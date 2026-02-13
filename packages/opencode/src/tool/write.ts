import z from "zod"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { Bus } from "../bus"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { trimDiff } from "./edit"
import { assertExternalDirectory } from "./external-directory"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5

const parameters = z.object({
  content: z.string().describe("The content to write to the file"),
  filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
})

export const WriteTool = Tool.define<typeof parameters, { diagnostics: any; filepath: string; exists: boolean }>("write", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const filepath = Filesystem.normalizeNativePath(path.isAbsolute(params.filePath) ? params.filePath : path.join(Instance.directory, params.filePath))
    await assertExternalDirectory(ctx, filepath)

    const file = Bun.file(filepath)
    const exists = await file.exists()
    const contentOld = exists ? await file.text() : ""
    exists && await FileTime.assert(ctx.sessionID, filepath)

    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content))
    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath)],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    await Bun.write(filepath, params.content)
    await Bus.publish(File.Event.Edited, {
      file: filepath,
    })
    await Bus.publish(FileWatcher.Event.Updated, {
      file: filepath,
      event: exists ? "change" : "add",
    })
    FileTime.read(ctx.sessionID, filepath)

    const diagnostics = await LSP.touchFile(filepath, true).then(() => LSP.diagnostics())
    const normalizedFilepath = Filesystem.normalizePath(filepath)
    const diagnosticOutput = Object.entries(diagnostics).reduce(
      (acc, [file, issues]) => {
        const errors = issues.filter((item) => item.severity === 1)
        const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
        const suffix = errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
        const formatted = `<diagnostics file="${file}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`

        return errors.length === 0 ? acc : (
          file === normalizedFilepath ? { ...acc, current: formatted } : (
            acc.count >= MAX_PROJECT_DIAGNOSTICS_FILES ? acc : {
              ...acc,
              others: [...acc.others, formatted],
              count: acc.count + 1,
            }
          )
        )
      },
      { current: "", others: [] as string[], count: 0 }
    )

    const output = [
      "Wrote file successfully.",
      diagnosticOutput.current ? `\n\nLSP errors detected in this file, please fix:\n${diagnosticOutput.current}` : "",
      diagnosticOutput.others.length > 0 ? `\n\nLSP errors detected in other files:\n${diagnosticOutput.others.join("\n\n")}` : "",
    ].filter(Boolean).join("")

    return {
      title: path.relative(Instance.worktree, filepath),
      metadata: {
        diagnostics,
        filepath,
        exists: exists,
      },
      output,
    }
  },
})
