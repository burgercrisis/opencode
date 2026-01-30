// the approaches in this edit tool are sourced from
// https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/diff-06-23-25.ts
// https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/editCorrector.ts
// https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/diff-06-26-25.ts

import z from "zod"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { createTwoFilesPatch, diffLines } from "diff"
import DESCRIPTION from "./edit.txt"
import { File } from "../file"
import { Bus } from "../bus"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { Snapshot } from "@/snapshot"
import { assertExternalDirectory } from "./external-directory"

const MAX_DIAGNOSTICS_PER_FILE = 20

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n")
}

export const EditTool = Tool.define("edit", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to modify"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with (must be different from oldString)"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
  }),
  /**
   * Executes the edit operation on a file, replacing oldString with newString.
   * Handles file permissions, creates diffs, and validates changes with LSP.
   * @param params - The edit parameters
   * @param ctx - The execution context
   * @returns Promise resolving to the edit result with metadata
   */
  async execute(params, ctx) {
    if (!params.filePath) throw new Error("filePath is required")
    if (params.oldString === params.newString) throw new Error("oldString and newString must be different")

    const filePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(Instance.directory, params.filePath)
    await assertExternalDirectory(ctx, filePath)

    const result = await FileTime.withLock(filePath, async () => {
      const file = Bun.file(filePath)
      const stats = await file.stat().catch(() => {})

      return params.oldString === "" ? (async () => {
        const contentOld = ""
        const contentNew = params.newString
        const diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))
        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, filePath)],
          always: ["*"],
          metadata: { filepath: filePath, diff },
        })
        await Bun.write(filePath, params.newString)
        await Bus.publish(File.Event.Edited, { file: filePath })
        FileTime.read(ctx.sessionID, filePath)
        return { diff, contentOld, contentNew }
      })() : (async () => {
        return !stats ? (() => { throw new Error(`File ${filePath} not found`) })() : (
          stats.isDirectory() ? (() => { throw new Error(`Path is a directory, not a file: ${filePath}`) })() : (async () => {
            await FileTime.assert(ctx.sessionID, filePath)
            const contentOld = await file.text()
            const contentNewTemp = replace(contentOld, params.oldString, params.newString, params.replaceAll)
            const diffTemp = trimDiff(
              createTwoFilesPatch(
                filePath,
                filePath,
                normalizeLineEndings(contentOld),
                normalizeLineEndings(contentNewTemp),
              ),
            )

            await ctx.ask({
              permission: "edit",
              patterns: [path.relative(Instance.worktree, filePath)],
              always: ["*"],
              metadata: { filepath: filePath, diff: diffTemp },
            })

            await file.write(contentNewTemp)
            await Bus.publish(File.Event.Edited, { file: filePath })

            const contentNewFinal = await file.text()
            const diffFinal = trimDiff(
              createTwoFilesPatch(
                filePath,
                filePath,
                normalizeLineEndings(contentOld),
                normalizeLineEndings(contentNewFinal),
              ),
            )
            FileTime.read(ctx.sessionID, filePath)
            return { diff: diffFinal, contentOld, contentNew: contentNewFinal }
          })()
        )
      })()
    })

    const { diff, contentOld, contentNew } = result || { diff: "", contentOld: "", contentNew: "" }

    const filediff = diffLines(contentOld, contentNew).reduce<Snapshot.FileDiff>(
      (acc, change) => ({
        ...acc,
        additions: acc.additions + (change.added ? change.count || 0 : 0),
        deletions: acc.deletions + (change.removed ? change.count || 0 : 0),
      }),
      {
        file: filePath,
        before: contentOld,
        after: contentNew,
        additions: 0,
        deletions: 0,
      },
    )

    ctx.metadata({
      metadata: {
        diff,
        filediff,
        diagnostics: {},
      },
    })

    await LSP.touchFile(filePath, true)
    const diagnostics = await LSP.diagnostics()
    const normalizedFilePath = Filesystem.normalizePath(filePath)
    const issues = diagnostics[normalizedFilePath] ?? []
    const errors = issues.filter((item) => item.severity === 1)

    const output = (() => {
      const base = "Edit applied successfully."
      if (errors.length === 0) return base
      const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > MAX_DIAGNOSTICS_PER_FILE
          ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more`
          : ""
      return (
        base +
        `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filePath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
      )
    })()

    return {
      metadata: {
        diagnostics,
        diff,
        filediff,
      },
      title: `${path.relative(Instance.worktree, filePath)}`,
      output,
    }
  },
})

export type Replacer = (content: string, find: string) => Generator<string, void, unknown>

// Similarity thresholds for block anchor fallback matching
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

/**
 * Levenshtein distance algorithm implementation
 */
function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)

  const initialMatrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  const filledMatrix = Array.from({ length: a.length }).reduce<number[][]>((acc, _, i) => {
    const rowIdx = i + 1
    const prevRow = acc[rowIdx - 1]
    const currentRow = acc[rowIdx]

    const newRow = Array.from({ length: b.length }).reduce<number[]>((rowAcc, __, j) => {
      const colIdx = j + 1
      const cost = a[rowIdx - 1] === b[colIdx - 1] ? 0 : 1
      const newValue = Math.min(
        prevRow[colIdx] + 1,
        rowAcc[colIdx - 1] + 1,
        prevRow[colIdx - 1] + cost,
      )
      return [...rowAcc, newValue]
    }, [currentRow[0]])

    return [...acc.slice(0, rowIdx), newRow, ...acc.slice(rowIdx + 1)]
  }, initialMatrix)

  return filledMatrix[a.length][b.length]
}

/**
 * Simple replacer that yields the exact find string.
 * @param _content - The content (unused)
 * @param find - The string to find
 */
export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

/**
 * Replacer that matches lines by trimming whitespace.
 * @param content - The content to search in
 * @param find - The string to find
 */
export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.endsWith("\n") ? find.split("\n").slice(0, -1) : find.split("\n")

  const range = Array.from({ length: originalLines.length - searchLines.length + 1 }, (_, i) => i)

  yield* range.reduce<string[]>((acc, i) => {
    const matches = searchLines.every((searchLine, j) => originalLines[i + j].trim() === searchLine.trim())

    return matches ? (() => {
      const start = originalLines.slice(0, i).reduce((sAcc, line) => sAcc + line.length + 1, 0)
      const end =
        start +
        searchLines.reduce(
          (eAcc, _, j) => eAcc + originalLines[i + j].length + (j < searchLines.length - 1 ? 1 : 0),
          0,
        )

      return [...acc, content.substring(start, end)]
    })() : acc
  }, [])
}

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.endsWith("\n") ? find.split("\n").slice(0, -1) : find.split("\n")

  const firstLineSearch = searchLines.length < 3 ? "" : searchLines[0].trim()
  const lastLineSearch = searchLines.length < 3 ? "" : searchLines[searchLines.length - 1].trim()
  const searchBlockSize = searchLines.length

  // Collect all candidate positions where both anchors match
  const candidates = (searchLines.length < 3) ? [] : originalLines.reduce<Array<{ startLine: number; endLine: number }>>(
    (acc, line, i) => {
      const isFirstMatch = line.trim() === firstLineSearch
      const endLine = isFirstMatch ? originalLines.findIndex(
        (l, index) => index >= i + 2 && l.trim() === lastLineSearch,
      ) : -1

      return endLine !== -1 ? [...acc, { startLine: i, endLine }] : acc
    },
    [],
  )

  const getSimilarity = (startLine: number, endLine: number) => {
    const actualBlockSize = endLine - startLine + 1
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2) // Middle lines only

    return linesToCheck > 0
      ? Array.from({ length: linesToCheck }).reduce<number>((acc, _, j) => {
          const originalLine = originalLines[startLine + j + 1].trim()
          const searchLine = searchLines[j + 1].trim()
          const maxLen = Math.max(originalLine.length, searchLine.length)
          return maxLen === 0 ? acc : acc + (1 - levenshtein(originalLine, searchLine) / maxLen) / linesToCheck
        }, 0)
      : 1.0
  }

  const getMatchContent = (startLine: number, endLine: number) => {
    const start = originalLines.slice(0, startLine).reduce((acc, l) => acc + l.length + 1, 0)
    const end =
      start +
      originalLines
        .slice(startLine, endLine + 1)
        .reduce((acc, l, idx) => acc + l.length + (idx < endLine - startLine ? 1 : 0), 0)
    return content.substring(start, end)
  }

  const best = candidates.length === 1
    ? { match: candidates[0], max: getSimilarity(candidates[0].startLine, candidates[0].endLine), threshold: SINGLE_CANDIDATE_SIMILARITY_THRESHOLD }
    : candidates.reduce(
        (acc, candidate) => {
          const similarity = getSimilarity(candidate.startLine, candidate.endLine)
          return similarity > acc.max ? { match: candidate, max: similarity, threshold: MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD } : acc
        },
        { match: null as { startLine: number; endLine: number } | null, max: -1, threshold: MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD },
      )

  yield* (best.match && best.max >= best.threshold) ? [getMatchContent(best.match.startLine, best.match.endLine)] : []
}

export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)

  // Handle single line matches
  const lines = content.split("\n")
  const singleLineRange = Array.from({ length: lines.length }, (_, i) => i)

  yield* singleLineRange.reduce<string[]>((acc, i) => {
    const line = lines[i]
    const isExact = normalizeWhitespace(line) === normalizedFind
    const match = !isExact && normalizeWhitespace(line).includes(normalizedFind) ? (() => {
      const words = find.trim().split(/\s+/)
      const pattern = words.length > 0 ? words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+") : ""
      return pattern ? line.match(new RegExp(pattern)) : null
    })() : null

    return isExact ? [...acc, line] : (match ? [...acc, match[0]] : acc)
  }, [])

  // Handle multi-line matches
  const findLines = find.split("\n")
  const multiLineRange = findLines.length > 1 ? Array.from({ length: lines.length - findLines.length + 1 }, (_, i) => i) : []
  yield* multiLineRange.reduce<string[]>((acc, i) => {
    const block = lines.slice(i, i + findLines.length).join("\n")
    return normalizeWhitespace(block) === normalizedFind ? [...acc, block] : acc
  }, [])
}

export const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n")
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    const minIndent = nonEmptyLines.length === 0 ? 0 : Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/)
        return match ? match[1].length : 0
      }),
    )

    return nonEmptyLines.length === 0 ? text : lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n")
  }

  const normalizedFind = removeIndentation(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")

  const range = Array.from({ length: contentLines.length - findLines.length + 1 }, (_, i) => i)

  yield* range.reduce<string[]>((acc, i) => {
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    return removeIndentation(block) === normalizedFind ? [...acc, block] : acc
  }, [])
}

export const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string => {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
      const mapping: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        "'": "'",
        '"': '"',
        "`": "`",
        "\\": "\\",
        "\n": "\n",
        $: "$",
      }
      return mapping[capturedChar] || match
    })
  }

  const unescapedFind = unescapeString(find)

  // Try direct match with unescaped find string
  yield* content.includes(unescapedFind) ? [unescapedFind] : []

  // Also try finding escaped versions in content that match unescaped find
  const lines = content.split("\n")
  const findLines = unescapedFind.split("\n")

  const range = Array.from({ length: lines.length - findLines.length + 1 }, (_, i) => i)

  yield* range.reduce<string[]>((acc, i) => {
    const block = lines.slice(i, i + findLines.length).join("\n")
    return unescapeString(block) === unescapedFind ? [...acc, block] : acc
  }, [])
}

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  // This replacer yields all exact matches, allowing the replace function
  // to handle multiple occurrences based on replaceAll parameter
  const findIndices = (start: number): number[] => {
    const index = content.indexOf(find, start)
    return index === -1 ? [] : [index, ...findIndices(index + find.length)]
  }

  yield* findIndices(0).map(() => find)
}

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()

  // Try to find the trimmed version
  yield* (trimmedFind !== find && content.includes(trimmedFind)) ? [trimmedFind] : []

  // Also try finding blocks where trimmed content matches
  const lines = content.split("\n")
  const findLines = find.split("\n")

  const range = Array.from({ length: lines.length - findLines.length + 1 }, (_, i) => i)

  yield* range.reduce<string[]>((acc, i) => {
    const block = lines.slice(i, i + findLines.length).join("\n")
    return block.trim() === trimmedFind ? [...acc, block] : acc
  }, [])
}

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")

  // Remove trailing empty line if present
  const searchLines = findLines[findLines.length - 1] === "" ? findLines.slice(0, -1) : findLines
  const contentLines = content.split("\n")

  // Extract first and last lines as context anchors
  const firstLine = searchLines[0].trim()
  const lastLine = searchLines[searchLines.length - 1].trim()

  // Find blocks that start and end with the context anchors
  const range = findLines.length < 3 ? [] : Array.from({ length: contentLines.length }, (_, i) => i)

  yield* range.reduce<string[]>((acc, i) => {
    const isFirstMatch = contentLines[i].trim() === firstLine
    const j = isFirstMatch ? contentLines.findIndex((l, idx) => idx >= i + 2 && l.trim() === lastLine) : -1

    return j !== -1 ? (() => {
      const blockLines = contentLines.slice(i, j + 1)
      const block = blockLines.join("\n")

      const stats = blockLines.length === searchLines.length ? Array.from({ length: blockLines.length - 2 }, (_, k) => k + 1).reduce(
        (sAcc, k) => {
          const blockLine = blockLines[k].trim()
          const findLine = searchLines[k].trim()
          const isEmpty = blockLine.length === 0 && findLine.length === 0
          return {
            matching: sAcc.matching + (!isEmpty && blockLine === findLine ? 1 : 0),
            total: sAcc.total + (!isEmpty ? 1 : 0),
          }
        },
        { matching: 0, total: 0 },
      ) : { matching: 0, total: 1 } // total 1 to avoid division by zero and fail the check

      return (stats.total === 0 || stats.matching / stats.total >= 0.5) ? [...acc, block] : acc
    })() : acc
  }, [])
}

export function trimDiff(diff: string): string {
  const lines = diff.split("\n")
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  )

  const min = contentLines.reduce((acc, line) => {
    const content = line.slice(1)
    const match = content.trim().length > 0 ? content.match(/^(\s*)/) : null
    return match ? Math.min(acc, match[1].length) : acc
  }, Infinity)

  return (contentLines.length === 0 || min === Infinity || min === 0) ? diff : lines
    .map((line) => {
      const isContent =
        (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
        !line.startsWith("---") &&
        !line.startsWith("+++")
      const prefix = line[0]
      const content = line.slice(1)
      return !isContent ? line : prefix + content.slice(min)
    })
    .join("\n")
}

/**
 * Unicode Emoji Matching Considerations
 *
 * Standard grep does not match emoji characters correctly because they are multi-byte Unicode sequences.
 * Use Perl-compatible regex with grep -P for proper emoji matching, e.g., grep -P '\x{1F600}' to match 😀.
 *
 * Emoji characters reside in Unicode Supplementary Planes (beyond the Basic Multilingual Plane, BMP).
 * The BMP covers U+0000 to U+FFFF, while emoji often fall in U+10000 and above.
 *
 * In PowerShell, [char] only supports BMP characters (0-65535). For emoji, use [char]::ConvertFromUtf32()
 * to handle code points above 65535, e.g., [char]::ConvertFromUtf32(0x1F600) for 😀.
 *
 * Example in bash: grep -P '\x{1F600}' file.txt to find lines containing the grinning face emoji.
 */
export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  const replacers = [
    SimpleReplacer,
    LineTrimmedReplacer,
    BlockAnchorReplacer,
    WhitespaceNormalizedReplacer,
    IndentationFlexibleReplacer,
    EscapeNormalizedReplacer,
    TrimmedBoundaryReplacer,
    ContextAwareReplacer,
    MultiOccurrenceReplacer,
  ]

  const matches = replacers.reduce<string[]>((acc, replacer) => {
    return (acc.length > 0 && !replaceAll) ? acc : [...acc, ...Array.from(replacer(content, oldString))]
  }, [])

  const uniqueMatches = [...new Set(matches)]

  return matches.length === 0 ? (() => { throw new Error("oldString not found in content") })() : (
    replaceAll ? uniqueMatches.reduce((acc, match) => acc.replaceAll(match, newString), content) : (
      uniqueMatches.length > 1 ? (() => {
        throw new Error(
          "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.",
        )
      })() : (() => {
        const search = uniqueMatches[0]
        const index = content.indexOf(search)
        const lastIndex = content.lastIndexOf(search)

        return index !== lastIndex ? (() => {
          throw new Error(
            "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.",
          )
        })() : content.substring(0, index) + newString + content.substring(index + search.length)
      })()
    )
  )
}
