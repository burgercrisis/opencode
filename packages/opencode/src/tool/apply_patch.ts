import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import { Tool } from "./tool"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import { Instance } from "../project/instance"
import { Patch } from "../patch"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectory } from "./external-directory"
import { trimDiff } from "./edit"
import { LSP } from "../lsp"
import { Filesystem } from "../util/filesystem"
import DESCRIPTION from "./apply_patch.txt"
import { File } from "../file"

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made"),
})

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: PatchParams,
  async execute(params, ctx) {
    const _validateParams = !params.patchText ? (() => { throw new Error("patchText is required") })() : null

    const parsed = (() => {
      const result = Patch.safeParsePatch(params.patchText)
      return result.success ? result.data : (() => { throw new Error(`apply_patch verification failed: ${result.error.message}`) })()
    })()
    const hunks = parsed.hunks

    const _validateHunks = hunks.length === 0 ? (() => {
      const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      return normalized === "*** Begin Patch\n*** End Patch" 
        ? (() => { throw new Error("patch rejected: empty patch") })() 
        : (() => { throw new Error("apply_patch verification failed: no hunks found") })()
    })() : null

    const groupedHunks = hunks.reduce((acc, hunk) => {
      const existing = acc.get(hunk.path) || []
      return acc.set(hunk.path, [...existing, hunk])
    }, new Map<string, Patch.Hunk[]>())

    const fileChanges = await Array.from(groupedHunks.entries()).reduce(async (accPromise, [relPath, fileHunks]) => {
      const acc = await accPromise
      const filePath = path.resolve(Instance.directory, relPath)
      await assertExternalDirectory(ctx, filePath)

      const change = await (async () => {
        const first = fileHunks[0]
        const isAdd = first.type === "add"
        const isDelete = first.type === "delete"

        return isAdd
          ? (() => {
              const old = ""
              const content = first.contents.length === 0 || first.contents.endsWith("\n") ? first.contents : `${first.contents}\n`
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, content))
              const counts = diffLines(old, content).reduce(
                (cAcc, change) =>
                  change.added
                    ? { ...cAcc, additions: cAcc.additions + (change.count || 0) }
                    : change.removed
                    ? { ...cAcc, deletions: cAcc.deletions + (change.count || 0) }
                    : cAcc,
                { additions: 0, deletions: 0 },
              )

              return {
                filePath,
                oldContent: old,
                newContent: content,
                type: "add" as const,
                diff,
                additions: counts.additions,
                deletions: counts.deletions,
              }
            })()
          : isDelete
          ? (async () => {
              const old = await Bun.file(filePath).text()
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, ""))
              return {
                filePath,
                oldContent: old,
                newContent: "",
                type: "delete" as const,
                diff,
                additions: 0,
                deletions: old.split("\n").length,
              }
            })()
          : (async () => {
              const file = Bun.file(filePath)
              const _exists = !(await file.exists()) ? (() => { throw new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`) })() : true

              const old = await file.text()
              const update = await fileHunks.reduce(async (contentPromise, hunk) => {
                const currentContent = await contentPromise
                return hunk.type === "update"
                  ? Patch.deriveNewContentsFromChunks(filePath, hunk.chunks, currentContent).then((res) => res.content)
                  : currentContent
              }, Promise.resolve(old)).catch((e) => {
                throw new Error(`apply_patch verification failed: ${(e as Error).message}`)
              })

              const content = update
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, content))
              const counts = diffLines(old, content).reduce(
                (cAcc, change) =>
                  change.added
                    ? { ...cAcc, additions: cAcc.additions + (change.count || 0) }
                    : change.removed
                    ? { ...cAcc, deletions: cAcc.deletions + (change.count || 0) }
                    : cAcc,
                { additions: 0, deletions: 0 },
              )

              const lastUpdate = [...fileHunks].reverse().find(h => h.type === "update" && h.move_path) as Extract<Patch.Hunk, { type: "update" }> | undefined
              const move = lastUpdate?.move_path ? path.resolve(Instance.directory, lastUpdate.move_path) : undefined
              const _moveAsk = move ? await assertExternalDirectory(ctx, move) : null

              return {
                filePath,
                oldContent: old,
                newContent: content,
                type: (move ? "move" : "update") as const,
                movePath: move,
                diff,
                additions: counts.additions,
                deletions: counts.deletions,
              }
            })()
      })()

      return [...acc, change]
    }, Promise.resolve([] as any[]))

    const diffs = fileChanges.map((c) => c.diff).join("\n")
    const files = fileChanges.map((c) => ({
      filePath: c.filePath,
      relativePath: path.relative(Instance.worktree, c.movePath ?? c.filePath).replaceAll(path.sep, "/"),
      type: c.type,
      diff: c.diff,
      before: c.oldContent,
      after: c.newContent,
      additions: c.additions,
      deletions: c.deletions,
      movePath: c.movePath,
    }))

    const relatives = fileChanges.map((c) => path.relative(Instance.worktree, c.filePath).replaceAll(path.sep, "/"))
    await ctx.ask({
      permission: "edit",
      patterns: relatives,
      always: ["*"],
      metadata: {
        filepath: relatives.join(", "),
        diff: diffs,
        files,
      },
    })

    const applied = await fileChanges.reduce(async (accPromise, c) => {
      const acc = await accPromise
      const target = c.type === "delete" ? undefined : c.movePath ?? c.filePath
      
      const _ensureDir = c.type === "add" || c.type === "move" 
        ? await fs.mkdir(path.dirname(c.movePath ?? c.filePath), { recursive: true })
        : null

      const result =
        c.type === "add"
          ? await Bun.write(c.filePath, c.newContent).then(() => c.filePath)
          : c.type === "update"
          ? await Bun.write(c.filePath, c.newContent).then(() => c.filePath)
          : c.type === "move" && c.movePath
          ? await Bun.write(c.movePath, c.newContent)
              .then(async () => {
                await fs.unlink(c.filePath)
                return c.movePath!
              })
          : c.type === "delete"
          ? await fs.unlink(c.filePath).then(() => c.filePath)
          : c.filePath

      const _publishEdited = target ? await Bus.publish(File.Event.Edited, { file: target }) : null
      return [...acc, result]
    }, Promise.resolve([] as string[]))

    await applied.reduce(async (acc, f) => {
      await acc
      return Bus.publish(FileWatcher.Event.Updated, { file: f, event: "change" })
    }, Promise.resolve())

    await fileChanges.reduce(async (acc, c) => {
      await acc
      return c.type !== "delete" ? LSP.touchFile(c.movePath ?? c.filePath, true) : Promise.resolve()
    }, Promise.resolve())

    const diagnostics = await LSP.diagnostics()
    const summary = `Success. Updated the following files:\n${fileChanges
      .map((c) => {
        const icon = c.type === "add" ? "A" : c.type === "delete" ? "D" : "M"
        const rel = path.relative(Instance.worktree, c.movePath ?? c.filePath)
        return `${icon} ${rel}`
      })
      .join("\n")}`

    const output = fileChanges.reduce((acc, c) => {
      const target = c.movePath ?? c.filePath
      const issues = (c.type !== "delete" && diagnostics[Filesystem.normalizePath(target)]) || []
      const errors = issues.filter((i) => i.severity === 1)
      
      return errors.length === 0 ? acc : (() => {
        const limited = errors.slice(0, 20)
        const suffix = errors.length > 20 ? `\n... and ${errors.length - 20} more` : ""
        return (
          acc +
          `\n\nLSP errors detected in ${path.relative(Instance.worktree, target)}, please fix:\n<diagnostics file="${target}">\n${limited
            .map(LSP.Diagnostic.pretty)
            .join("\n")}${suffix}\n</diagnostics>`
        )
      })()
    }, summary)

    return {
      title: output,
      metadata: { diff: diffs, files, diagnostics },
      output,
    }
  },
})
