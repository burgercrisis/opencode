import z from "zod"
import { Tool } from "./tool"
import { Ripgrep } from "../file/ripgrep"

import DESCRIPTION from "./grep.txt"
import { Instance } from "../project/instance"
import path from "path"
import { assertExternalDirectory } from "./external-directory"
import { Filesystem } from "../util/filesystem"

const MAX_LINE_LENGTH = 2000
const MATCH_LIMIT = 250

export const GrepTool = Tool.define("grep", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for in file contents"),
    path: z.string().optional().describe("The directory to search in. Defaults to the current working directory."),
    include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
  }),
  async execute(params, ctx) {
    if (!params.pattern) {
      throw new Error("pattern is required")
    }
    const pattern = params.pattern

    await ctx.ask({
      permission: "grep",
      patterns: [pattern],
      always: ["*"],
      metadata: {
        pattern,
        path: params.path,
        include: params.include,
      },
    })

    const searchPath = params.path
      ? (path.isAbsolute(params.path) ? Filesystem.nativePath(params.path) : Filesystem.resolvePath(Instance.directory, params.path))
      : Instance.directory
    await assertExternalDirectory(ctx, searchPath, { kind: "directory" })

    const rgPath = await Ripgrep.filepath()
    const args = [
      "-nH",
      "--hidden",
      "--follow",
      "--no-messages",
      "--field-match-separator=|",
      "--regexp",
      pattern,
      ...(params.include ? ["--glob", params.include] : []),
      searchPath,
    ]

    const proc = Bun.spawn([rgPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      signal: ctx.abort,
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    interface Match {
      path: string
      lineNum: number
      lineText: string
      modTime?: number
    }

    const read = async (acc: Match[], buffer: string): Promise<{ matches: Match[]; truncated: boolean }> => {
      const { done, value } = await reader.read()
      
      const processDone = () => {
        const remaining = buffer.split("|")
        const match = remaining.length >= 3 ? {
          path: remaining[0],
          lineNum: parseInt(remaining[1], 10),
          lineText: remaining.slice(2).join("|"),
        } : null
        return {
          matches: match ? [...acc, match].slice(0, MATCH_LIMIT) : acc,
          truncated: acc.length >= MATCH_LIMIT || (match !== null && acc.length + 1 > MATCH_LIMIT),
        }
      }

      if (done) return processDone()

      const content = buffer + decoder.decode(value, { stream: true })
      const lines = content.split(/\r?\n/)
      const last = lines.pop() || ""

      const newMatches = lines
        .filter(Boolean)
        .map((line) => {
          const [filePath, lineNumStr, ...lineTextParts] = line.split("|")
          return filePath && lineNumStr && lineTextParts.length > 0
            ? {
                path: filePath,
                lineNum: parseInt(lineNumStr, 10),
                lineText: lineTextParts.join("|"),
              }
            : null
        })
        .filter((m): m is Match => m !== null)

      const total = [...acc, ...newMatches]
      if (total.length >= MATCH_LIMIT) {
        proc.kill()
        return { matches: total.slice(0, MATCH_LIMIT), truncated: true }
      }
      return read(total, last)
    }

    const { matches: rawMatches, truncated } = await read([], "").finally(() => reader.releaseLock())
    const errorOutput = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (rawMatches.length === 0) {
      if (exitCode !== 0 && exitCode !== 1 && exitCode !== 2) {
        throw new Error(`ripgrep failed: ${errorOutput}`)
      }
      return {
        title: pattern,
        metadata: { matches: 0, truncated: false },
        output: "No files found",
      }
    }

    const hasErrors = exitCode === 2
    const uniqueFiles = [...new Set(rawMatches.map((m) => m.path))]
    
    const statsEntries = await Promise.all(
      uniqueFiles.map(async (filePath) => {
        const stats = await Bun.file(filePath).stat().catch(() => null)
        return [filePath, stats?.mtime.getTime() ?? 0] as [string, number]
      })
    )
    const fileStats = new Map(statsEntries)

    const matches = rawMatches
      .map((m) => ({ ...m, modTime: fileStats.get(m.path) ?? 0 }))
      .sort((a, b) => b.modTime - a.modTime)

    const formattedMatches = matches.reduce((acc, match, i) => {
      const prev = matches[i - 1]
      const fileHeader = !prev || prev.path !== match.path ? [`${acc.length > 0 ? "\n" : ""}${match.path}:`] : []
      const truncatedLineText = match.lineText.length > MAX_LINE_LENGTH
        ? match.lineText.substring(0, MAX_LINE_LENGTH) + "..."
        : match.lineText
      return acc.concat(fileHeader, `  Line ${match.lineNum}: ${truncatedLineText}`)
    }, [] as string[])

    return {
      title: pattern,
      metadata: {
        matches: matches.length,
        truncated,
      },
      output: [
        `Found ${matches.length} matches`,
        ...formattedMatches,
        ...(truncated ? ["", "(Results are truncated. Consider using a more specific path or pattern.)"] : []),
        ...(hasErrors ? ["", "(Some paths were inaccessible and skipped)"] : []),
      ].join("\n"),
    }
  },
})
