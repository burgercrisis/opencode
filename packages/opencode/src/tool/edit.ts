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
import { FileWatcher } from "../file/watcher"
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

    const filePath = Filesystem.resolvePath(Instance.directory, params.filePath)
    await assertExternalDirectory(ctx, filePath)

    let diff = ""
    let contentOld = ""
    let contentNew = ""
    await FileTime.withLock(filePath, async () => {
      if (await Filesystem.isDir(filePath)) throw new Error(`Path is a directory, not a file: ${filePath}`)

      const file = Bun.file(filePath)
      const existed = await file.exists()
      const stats = existed ? await file.stat() : null

      if (params.oldString === "") {
        contentNew = params.newString
        diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))

        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, filePath)],
          always: ["*"],
          metadata: { filepath: filePath, diff },
        })

        await file.write(params.newString)
        await Bus.publish(File.Event.Edited, { file: filePath })
        await Bus.publish(FileWatcher.Event.Updated, {
          file: filePath,
          event: existed ? "change" : "add",
        })
        FileTime.read(ctx.sessionID, filePath)
        contentNew = await file.text()
        return
      }

      if (!stats) throw new Error(`File ${filePath} not found`)

      await FileTime.assert(ctx.sessionID, filePath)
      contentOld = await file.text()
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
      await Bus.publish(FileWatcher.Event.Updated, {
        file: filePath,
        event: "change",
      })

      contentNew = await file.text()
      diff = trimDiff(
        createTwoFilesPatch(
          filePath,
          filePath,
          normalizeLineEndings(contentOld),
          normalizeLineEndings(contentNew),
        ),
      )
      FileTime.read(ctx.sessionID, filePath)
    })

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
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.5
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.5

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

    const processRow = (rowAcc: number[], j: number): number[] => {
      const colIdx = j + 1
      if (colIdx > b.length) return rowAcc
      const cost = a[rowIdx - 1] === b[colIdx - 1] ? 0 : 1
      const newValue = Math.min(
        prevRow[colIdx] + 1,
        rowAcc[colIdx - 1] + 1,
        prevRow[colIdx - 1] + cost,
      )
      return processRow([...rowAcc, newValue], colIdx)
    }

    const newRow = processRow([currentRow[0]], 0)

    return [...acc.slice(0, rowIdx), newRow, ...acc.slice(rowIdx + 1)]
  }, initialMatrix)

  return filledMatrix[a.length][b.length]
}

/**
 * Simple replacer that yields the exact find string.
 * @param _content - The content (unused)
 * @param find - The string to find
 */
export const SimpleReplacer: Replacer = function* (content, find) {
  if (content.includes(find)) {
    yield find
  }
}

/**
 * Replacer that matches lines by trimming whitespace.
 * @param content - The content to search in
 * @param find - The string to find
 */
export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.endsWith("\n") ? find.split("\n").slice(0, -1) : find.split("\n")

  const processRange = (acc: string[], i: number): string[] => {
    if (i > originalLines.length - searchLines.length) return acc

    const checkMatch = (j: number): boolean => {
      if (j >= searchLines.length) return true
      if (originalLines[i + j].trim() !== searchLines[j].trim()) return false
      return checkMatch(j + 1)
    }

    const matches = checkMatch(0)

    const nextAcc = matches ? (() => {
      const getStart = (idx: number, current: number): number => {
        if (idx >= i) return current
        return getStart(idx + 1, current + originalLines[idx].length + 1)
      }
      const start = getStart(0, 0)

      const getEnd = (j: number, current: number): number => {
        if (j >= searchLines.length) return current
        return getEnd(j + 1, current + originalLines[i + j].length + (j < searchLines.length - 1 ? 1 : 0))
      }
      const end = getEnd(0, start)

      return [...acc, content.substring(start, end)]
    })() : acc

    return processRange(nextAcc, i + 1)
  }

  yield* processRange([], 0)
}

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.endsWith("\n") ? find.split("\n").slice(0, -1) : find.split("\n")

  const firstLineSearch = searchLines.length < 3 ? "" : searchLines[0].trim()
  const lastLineSearch = searchLines.length < 3 ? "" : searchLines[searchLines.length - 1].trim()
  const searchBlockSize = searchLines.length

  const findLastLine = (startIdx: number): number => {
    const searchFrom = (idx: number): number => {
      if (idx >= originalLines.length) return -1
      if (originalLines[idx].trim() === lastLineSearch) return idx
      return searchFrom(idx + 1)
    }
    return searchFrom(startIdx)
  }

  const collectCandidates = (acc: Array<{ startLine: number; endLine: number }>, i: number): Array<{ startLine: number; endLine: number }> => {
    if (i >= originalLines.length) return acc
    const isFirstMatch = originalLines[i].trim() === firstLineSearch
    const endLine = isFirstMatch ? findLastLine(i + 2) : -1
    const nextAcc = endLine !== -1 ? [...acc, { startLine: i, endLine }] : acc
    return collectCandidates(nextAcc, i + 1)
  }

  const candidates = (searchLines.length < 3) ? [] : collectCandidates([], 0)

  const getSimilarity = (startLine: number, endLine: number) => {
    const actualBlockSize = endLine - startLine + 1
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)

    const calculateSimilarity = (acc: number, j: number): number => {
      if (j >= linesToCheck) return acc
      const originalLine = originalLines[startLine + j + 1].trim()
      const searchLine = searchLines[j + 1].trim()
      const maxLen = Math.max(originalLine.length, searchLine.length)
      const similarity = maxLen === 0 ? 0 : (1 - levenshtein(originalLine, searchLine) / maxLen)
      return calculateSimilarity(acc + similarity / linesToCheck, j + 1)
    }

    return linesToCheck > 0 ? calculateSimilarity(0, 0) : 1.0
  }

  const getMatchContent = (startLine: number, endLine: number) => {
    const getStart = (idx: number, current: number): number => {
      if (idx >= startLine) return current
      return getStart(idx + 1, current + originalLines[idx].length + 1)
    }
    const start = getStart(0, 0)

    const getEndOffset = (idx: number, current: number): number => {
      if (idx > endLine) return current
      return getEndOffset(idx + 1, current + originalLines[idx].length + (idx < endLine ? 1 : 0))
    }
    const end = start + getEndOffset(startLine, 0)
    return content.substring(start, end)
  }

  const findBest = (idx: number, currentBest: { match: { startLine: number; endLine: number } | null, max: number, threshold: number }): typeof currentBest => {
    if (idx >= candidates.length) return currentBest
    const candidate = candidates[idx]
    const similarity = getSimilarity(candidate.startLine, candidate.endLine)
    const nextBest = similarity > currentBest.max
      ? { match: candidate, max: similarity, threshold: currentBest.threshold }
      : currentBest
    return findBest(idx + 1, nextBest)
  }

  const initialBest = candidates.length === 1
    ? { match: candidates[0], max: getSimilarity(candidates[0].startLine, candidates[0].endLine), threshold: SINGLE_CANDIDATE_SIMILARITY_THRESHOLD }
    : { match: null as { startLine: number; endLine: number } | null, max: -1, threshold: MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD }

  const best = candidates.length === 1 ? initialBest : findBest(0, initialBest)
  yield* (best.match && best.max >= best.threshold) ? [getMatchContent(best.match.startLine, best.match.endLine)] : []
}

export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)

  const lines = content.split("\n")

  const processSingleLines = (acc: string[], i: number): string[] => {
    if (i >= lines.length) return acc
    const line = lines[i]
    const lineWords = line.trim().split(/\s+/)
    const findWords = find.trim().split(/\s+/)
    const isExact = normalizeWhitespace(line) === normalizedFind
    const match = !isExact && normalizeWhitespace(line).includes(normalizedFind) ? (() => {
      const pattern = findWords.length > 0 ? findWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+") : ""
      return pattern ? line.match(new RegExp(pattern)) : null
    })() : null

    const nextAcc = isExact ? [...acc, line] : (match ? [...acc, match[0]] : acc)
    return processSingleLines(nextAcc, i + 1)
  }

  yield* processSingleLines([], 0)

  const findLines = find.split("\n")

  const processMultiLines = (acc: string[], i: number): string[] => {
    if (i > lines.length - findLines.length) return acc
    const blockLines = lines.slice(i, i + findLines.length)
    const block = blockLines.join("\n")
    const nextAcc = normalizeWhitespace(block) === normalizedFind ? [...acc, block] : acc
    return processMultiLines(nextAcc, i + 1)
  }

  if (findLines.length > 1 || (findLines.length === 1 && find.includes("\n"))) {
    yield* processMultiLines([], 0)
  }
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

    const processLines = (acc: string[], idx: number): string[] => {
      if (idx >= lines.length) return acc
      const line = lines[idx]
      const nextLine = line.trim().length === 0 ? line : line.slice(minIndent)
      return processLines([...acc, nextLine], idx + 1)
    }

    return nonEmptyLines.length === 0 ? text : processLines([], 0).join("\n")
  }

  const normalizedFind = removeIndentation(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")

  const processRange = (acc: string[], i: number): string[] => {
    if (i > contentLines.length - findLines.length) return acc
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    const nextAcc = removeIndentation(block) === normalizedFind ? [...acc, block] : acc
    return processRange(nextAcc, i + 1)
  }

  yield* processRange([], 0)
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

  const processRange = (acc: string[], i: number): string[] => {
    if (i > lines.length - findLines.length) return acc
    const block = lines.slice(i, i + findLines.length).join("\n")
    const nextAcc = unescapeString(block) === unescapedFind ? [...acc, block] : acc
    return processRange(nextAcc, i + 1)
  }

  yield* processRange([], 0)
}

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  const findIndices = (start: number, acc: number[]): number[] => {
    const index = content.indexOf(find, start)
    return index === -1 ? acc : findIndices(index + find.length, [...acc, index])
  }

  const processIndices = (indices: number[], acc: string[]): string[] => {
    if (indices.length === 0) return acc
    return processIndices(indices.slice(1), [...acc, find])
  }

  yield* processIndices(findIndices(0, []), [])
}

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()

  // Try to find the trimmed version
  yield* (trimmedFind !== find && content.includes(trimmedFind)) ? [trimmedFind] : []

  // Also try finding blocks where trimmed content matches
  const lines = content.split("\n")
  const findLines = find.split("\n")

  const processRange = (acc: string[], i: number): string[] => {
    if (i > lines.length - findLines.length) return acc
    const block = lines.slice(i, i + findLines.length).join("\n")
    const nextAcc = block.trim() === trimmedFind ? [...acc, block] : acc
    return processRange(nextAcc, i + 1)
  }

  yield* processRange([], 0)
}

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")

  // Remove trailing empty line if present
  const searchLines = findLines[findLines.length - 1] === "" ? findLines.slice(0, -1) : findLines
  const contentLines = content.split("\n")

  // Extract first and last lines as context anchors
  const firstLine = searchLines[0].trim()
  const lastLine = searchLines[searchLines.length - 1].trim()

  const findLastLine = (startIdx: number): number => {
    const searchFrom = (idx: number): number => {
      if (idx >= contentLines.length) return -1
      if (contentLines[idx].trim() === lastLine) return idx
      return searchFrom(idx + 1)
    }
    return searchFrom(startIdx)
  }

  const processRange = (acc: string[], i: number): string[] => {
    if (i >= contentLines.length) return acc
    const isFirstMatch = contentLines[i].trim() === firstLine
    const j = isFirstMatch ? findLastLine(i + 2) : -1

    const nextAcc = j !== -1 ? (() => {
      const blockLines = contentLines.slice(i, j + 1)
      const block = blockLines.join("\n")

      const getStats = (idx: number, currentStats: { matching: number, total: number }): typeof currentStats => {
        if (idx >= blockLines.length - 1) return currentStats
        const blockLine = blockLines[idx].trim()
        const findLine = searchLines[idx].trim()
        const isEmpty = blockLine.length === 0 && findLine.length === 0
        return getStats(idx + 1, {
          matching: currentStats.matching + (!isEmpty && blockLine === findLine ? 1 : 0),
          total: currentStats.total + (!isEmpty ? 1 : 0),
        })
      }

      const stats = blockLines.length === searchLines.length
        ? getStats(1, { matching: 0, total: 0 })
        : { matching: 0, total: 1 }

      return (stats.total === 0 || stats.matching / stats.total >= 0.5) ? [...acc, block] : acc
    })() : acc

    return processRange(nextAcc, i + 1)
  }

  if (findLines.length >= 3) {
    yield* processRange([], 0)
  }
}

export function trimDiff(diff: string): string {
  const lines = diff.split("\n")

  const getContentLines = (acc: string[], idx: number): string[] => {
    if (idx >= lines.length) return acc
    const line = lines[idx]
    const isContent = (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
    return getContentLines(isContent ? [...acc, line] : acc, idx + 1)
  }

  const contentLines = getContentLines([], 0)

  const getMinIndent = (currentMin: number, idx: number): number => {
    if (idx >= contentLines.length) return currentMin
    const line = contentLines[idx]
    const content = line.slice(1)
    const match = content.trim().length > 0 ? content.match(/^(\s*)/) : null
    const nextMin = match ? Math.min(currentMin, match[1].length) : currentMin
    return getMinIndent(nextMin, idx + 1)
  }

  const min = getMinIndent(Infinity, 0)

  const processLines = (acc: string[], idx: number): string[] => {
    if (idx >= lines.length) return acc
    const line = lines[idx]
    const isContent = (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
    const prefix = line[0]
    const content = line.slice(1)
    const nextLine = !isContent ? line : prefix + content.slice(min)
    return processLines([...acc, nextLine], idx + 1)
  }

  return (contentLines.length === 0 || min === Infinity || min === 0) ? diff : processLines([], 0).join("\n")
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
      const result = Array.from(replacer(content, oldString))
    return acc.length > 0 ? acc : [...acc, ...result]
  }, [])

  const uniqueMatches = Array.from(new Set(matches))

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

        if (index !== lastIndex) {
          throw new Error(
            "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.",
          )
        }

        const searchLines = search.split("\n")
        const replacementLines = newString.split("\n")
        const searchIndent = searchLines[0].match(/^(\s+)/)?.[1] || ""
        const replacementIndent = replacementLines[0].match(/^(\s+)/)?.[1] || ""

        const finalNewString =
          searchLines.length === replacementLines.length
            ? replacementLines
                .map((line, i) => {
                  const sIndent = searchLines[i].match(/^(\s+)/)?.[1] || ""
                  const rIndent = line.match(/^(\s+)/)?.[1] || ""
                  return sIndent && !rIndent ? sIndent + line : line
                })
                .join("\n")
            : searchIndent && !replacementIndent
              ? replacementLines.map((line) => (line.trim().length === 0 ? line : searchIndent + line)).join("\n")
              : newString

        return content.substring(0, index) + finalNewString + content.substring(index + search.length)
      })()
    )
  )
}
