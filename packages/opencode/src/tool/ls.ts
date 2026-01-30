import z from "zod"
import { Tool } from "./tool"
import * as path from "path"
import DESCRIPTION from "./ls.txt"
import { Instance } from "../project/instance"
import { Ripgrep } from "../file/ripgrep"
import { assertExternalDirectory } from "./external-directory"

export const IGNORE_PATTERNS = [
  "node_modules/",
  "__pycache__/",
  ".git/",
  "dist/",
  "build/",
  "target/",
  "vendor/",
  "bin/",
  "obj/",
  ".idea/",
  ".vscode/",
  ".zig-cache/",
  "zig-out",
  ".coverage",
  "coverage/",
  "vendor/",
  "tmp/",
  "temp/",
  ".cache/",
  "cache/",
  "logs/",
  ".venv/",
  "venv/",
  "env/",
]

const LIMIT = 100

export const ListTool = Tool.define("list", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().describe("The absolute path to the directory to list (must be absolute, not relative)").optional(),
    ignore: z.array(z.string()).describe("List of glob patterns to ignore").optional(),
  }),
  async execute(params, ctx) {
    const searchPath = path.resolve(Instance.directory, params.path || ".")
    await assertExternalDirectory(ctx, searchPath, { kind: "directory" })

    await ctx.ask({
      permission: "list",
      patterns: [searchPath],
      always: ["*"],
      metadata: {
        path: searchPath,
      },
    })

    const ignoreGlobs = IGNORE_PATTERNS.map((p) => `!${p}*`).concat(params.ignore?.map((p) => `!${p}`) || [])
    const files: string[] = []
    for await (const file of Ripgrep.files({ cwd: searchPath, glob: ignoreGlobs, signal: ctx.abort })) {
      files.push(file)
      if (files.length >= LIMIT) break
    }

    const normalizedFiles = files.map((f) => f.replace(/\\/g, "/"))

    const { dirs, filesByDir } = normalizedFiles.reduce(
      (acc, file) => {
        const dir = path.dirname(file)
        const parts = dir === "." ? [] : dir.split("/")

        const newDirs = parts.reduce(
          (dAcc, _, i) => dAcc.add(parts.slice(0, i + 1).join("/")),
          new Set(acc.dirs).add(".")
        )

        return {
          dirs: newDirs,
          filesByDir: new Map(acc.filesByDir).set(dir, [...(acc.filesByDir.get(dir) || []), path.basename(file)]),
        }
      },
      { dirs: new Set<string>(), filesByDir: new Map<string, string[]>() }
    )

    const renderDir = (dirPath: string, depth: number): string => {
      const indent = "  ".repeat(depth)
      const header = depth > 0 ? `${indent}${path.basename(dirPath)}/\n` : ""
      const childIndent = "  ".repeat(depth + 1)

      const subDirsOutput = Array.from(dirs)
        .filter((d) => path.dirname(d) === dirPath && d !== dirPath)
        .sort()
        .map((child) => renderDir(child, depth + 1))
        .join("")

      const filesOutput = (filesByDir.get(dirPath) || [])
        .sort()
        .map((file) => `${childIndent}${file}\n`)
        .join("")

      return header + subDirsOutput + filesOutput
    }

    const output = `${searchPath}/\n` + renderDir(".", 0)

    return {
      title: path.relative(Instance.worktree, searchPath),
      metadata: {
        count: files.length,
        truncated: files.length >= LIMIT,
      },
      output,
    }
  },
})
