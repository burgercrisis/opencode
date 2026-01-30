import z from "zod"
import path from "path"
import { Tool } from "./tool"
import DESCRIPTION from "./glob.txt"
import { Ripgrep } from "../file/ripgrep"
import { Instance } from "../project/instance"
import { assertExternalDirectory } from "./external-directory"

export const GlobTool = Tool.define("glob", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z
      .string()
      .optional()
      .describe(
        `The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`,
      ),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "glob",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    })

    const search = params.path
      ? (path.isAbsolute(params.path) ? params.path : path.resolve(Instance.directory, params.path))
      : Instance.directory
    await assertExternalDirectory(ctx, search, { kind: "directory" })

    const limit = 100
    interface FileInfo { path: string; mtime: number }

    const collectFiles = async (gen: AsyncGenerator<string>, acc: FileInfo[]): Promise<{ files: FileInfo[]; truncated: boolean }> => {
      return acc.length >= limit
        ? { files: acc, truncated: true }
        : await gen.next().then(async ({ value, done }) =>
            done
              ? { files: acc, truncated: false }
              : await (() => {
                  const full = path.resolve(search, value)
                  return Bun.file(full)
                    .stat()
                    .then((x) => x.mtime.getTime())
                    .catch(() => 0)
                    .then((mtime) => collectFiles(gen, [...acc, { path: full, mtime }]))
                })(),
          )
    }

    const { files: rawFiles, truncated } = await collectFiles(
      Ripgrep.files({ cwd: search, glob: [params.pattern] }),
      []
    )

    const files = [...rawFiles].sort((a, b) => b.mtime - a.mtime)

    const output = files.length === 0
      ? "No files found"
      : [
          ...files.map((f) => f.path),
          ...(truncated ? ["", "(Results are truncated. Consider using a more specific path or pattern.)"] : []),
        ].join("\n")

    return {
      title: path.relative(Instance.worktree, search),
      metadata: {
        count: files.length,
        truncated,
      },
      output,
    }
  },
})
