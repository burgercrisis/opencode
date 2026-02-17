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
import { TOOL } from "../constants"
import { levenshtein } from "@/util/levenshtein"

// Edit tool constants for configurable behavior
const EDIT_MAX_MATCHES = parseInt(process.env.EDIT_MAX_MATCHES || '1000')
const EDIT_MAX_CONTEXT_LENGTH = parseInt(process.env.EDIT_MAX_CONTEXT_LENGTH || '150')

// Confidence calculation constants
const CONFIDENCE_EXACT_MATCH_BONUS = 0.1
const CONFIDENCE_LONGER_MATCH_BONUS = 0.1
const CONFIDENCE_NOT_AT_BEGINNING_BONUS = 0.05
const CONFIDENCE_NOT_AT_BEGINNING_THRESHOLD = 10
const CONFIDENCE_LONG_STRING_BONUS = 0.1
const CONFIDENCE_LONG_STRING_THRESHOLD = 50
const ERROR_CONTEXT_PREVIEW_LENGTH = 50 // Characters to show in error messages

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
    occurrence: z.number().optional().describe("Replace the Nth occurrence (1-based index) when multiple matches exist"),
    autoContext: z.boolean().optional().describe("Automatically expand context when multiple matches are found (default true)"),
    confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold for automatic selection (0-1, default 0.8)"),
  }),
  async execute(params, ctx) {
    // Comprehensive input validation
    if (!params.filePath) {
      throw new Error("filePath is required")
    }

    if (!params.oldString || params.oldString.length === 0) {
      throw new Error("oldString is required and cannot be empty")
    }

    if (!params.newString || params.newString.length === 0) {
      throw new Error("newString is required and cannot be empty")
    }

    if (params.oldString === params.newString) {
      throw new Error("No changes to apply: oldString and newString are identical.")
    }

    // Validate filePath format and security
    if (typeof params.filePath !== 'string') {
      throw new Error("filePath must be a string")
    }

    // Check for potentially dangerous patterns in oldString
    if (params.oldString.includes('\0') || params.newString.includes('\0')) {
      throw new Error("String parameters cannot contain null bytes")
    }

    // Validate string lengths to prevent resource exhaustion
    if (params.oldString.length > TOOL.MAX_LENGTH || params.newString.length > TOOL.MAX_LENGTH) {
      throw new Error(`String parameters too long: max ${TOOL.MAX_LENGTH} characters allowed`)
    }

    // Validate new parameters
    if (params.occurrence !== undefined && params.occurrence < 1) {
      throw new Error("occurrence must be a positive integer (1-based index)")
    }

    if (params.confidence !== undefined && (params.confidence < 0 || params.confidence > 1)) {
      throw new Error("confidence must be between 0 and 1")
    }

    // Set defaults
    const autoContext = params.autoContext !== false // default true
    const confidence = params.confidence ?? 0.8 // default 0.8

    // BEST OF BOTH WORLDS: Use Filesystem.resolvePath which handles both absolute and relative paths
    const filePath = Filesystem.resolvePath(Instance.directory, params.filePath)
    await assertExternalDirectory(ctx, filePath)

    let diff = ""
    let contentOld = ""
    let contentNew = ""

    // Read file content outside lock to avoid holding lock during expensive operations
    const file = Bun.file(filePath)
    const stats = await file.stat().catch(() => { })
    if (!stats) throw new Error(`File ${filePath} not found`)
    if (stats.isDirectory()) throw new Error(`Path is a directory, not a file: ${filePath}`)

    await FileTime.assert(ctx.sessionID, filePath)
    contentOld = await file.text()

    // Perform expensive match collection and processing outside lock
    contentNew = replace(contentOld, params.oldString, params.newString, params.replaceAll, {
      occurrence: params.occurrence,
      autoContext,
      confidence
    })

    // Now acquire lock only for final file operations
    await FileTime.withLock(filePath, async () => {
      // Create diff for permission request
      diff = trimDiff(
        createTwoFilesPatch(filePath, filePath, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)),
      )

      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Instance.worktree, filePath)],
        always: ["*"],
        metadata: {
          filepath: filePath,
          diff,
        },
      })

      await file.write(contentNew)
      await Bus.publish(File.Event.Edited, {
        file: filePath,
      })
      await Bus.publish(FileWatcher.Event.Updated, {
        file: filePath,
        event: "change",
      })
      contentNew = await file.text()
      diff = trimDiff(
        createTwoFilesPatch(filePath, filePath, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)),
      )
      FileTime.read(ctx.sessionID, filePath)
    })

    const filediff: Snapshot.FileDiff = {
      file: filePath,
      before: contentOld,
      after: contentNew,
      additions: 0,
      deletions: 0,
    }
    for (const change of diffLines(contentOld, contentNew)) {
      if (change.added) filediff.additions += change.count || 0
      if (change.removed) filediff.deletions += change.count || 0
    }

    ctx.metadata({
      metadata: {
        diff,
        filediff,
        diagnostics: {},
      },
    })

    let output = "Edit applied successfully."
    await LSP.touchFile(filePath, true)
    const diagnostics = await LSP.diagnostics()
    const normalizedFilePath = Filesystem.normalizePath(filePath)
    const issues = diagnostics[normalizedFilePath] ?? []
    const errors = issues.filter((item) => item.severity === 1)
    if (errors.length > 0) {
      const limited = errors.slice(0, TOOL.MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > TOOL.MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - TOOL.MAX_DIAGNOSTICS_PER_FILE} more` : ""
      output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filePath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
    }

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

export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")

  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop()
  }

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true

    for (let j = 0; j < searchLines.length; j++) {
      const originalTrimmed = originalLines[i + j].trim()
      const searchTrimmed = searchLines[j].trim()

      if (originalTrimmed !== searchTrimmed) {
        matches = false
        break
      }
    }

    if (matches) {
      let matchStartIndex = 0
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1
      }

      let matchEndIndex = matchStartIndex
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length
        if (k < searchLines.length - 1) {
          matchEndIndex += 1 // Add newline character except for the last line
        }
      }

      yield content.substring(matchStartIndex, matchEndIndex)
    }
  }
}

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")

  if (searchLines.length < 3) {
    return
  }

  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop()
  }

  const firstLineSearch = searchLines[0].trim()
  const lastLineSearch = searchLines[searchLines.length - 1].trim()
  const searchBlockSize = searchLines.length

  // Collect all candidate positions where both anchors match
  const candidates: Array<{ startLine: number; endLine: number }> = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) {
      continue
    }

    // Look for the matching last line after this first line
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j })
        break // Only match the first occurrence of the last line
      }
    }
  }

  // Return immediately if no candidates
  if (candidates.length === 0) {
    return
  }

  // Handle single candidate scenario (using relaxed threshold)
  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0]
    const actualBlockSize = endLine - startLine + 1

    let similarity = 0
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2) // Middle lines only

    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim()
        const searchLine = searchLines[j].trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) {
          continue
        }
        const distance = levenshtein(originalLine, searchLine)
        similarity += (1 - distance / maxLen) / linesToCheck

        // Exit early when threshold is reached
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
          break
        }
      }
    } else {
      // No middle lines to compare, just accept based on anchors
      similarity = 1.0
    }

    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0
      for (let k = 0; k < startLine; k++) {
        matchStartIndex += originalLines[k].length + 1
      }
      let matchEndIndex = matchStartIndex
      for (let k = startLine; k <= endLine; k++) {
        matchEndIndex += originalLines[k].length
        if (k < endLine) {
          matchEndIndex += 1 // Add newline character except for the last line
        }
      }
      yield content.substring(matchStartIndex, matchEndIndex)
    }
    return
  }

  // Calculate similarity for multiple candidates
  let bestMatch: { startLine: number; endLine: number } | null = null
  let maxSimilarity = -1

  for (const candidate of candidates) {
    const { startLine, endLine } = candidate
    const actualBlockSize = endLine - startLine + 1

    let similarity = 0
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2) // Middle lines only

    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim()
        const searchLine = searchLines[j].trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) {
          continue
        }
        const distance = levenshtein(originalLine, searchLine)
        similarity += 1 - distance / maxLen
      }
      similarity /= linesToCheck // Average similarity
    } else {
      // No middle lines to compare, just accept based on anchors
      similarity = 1.0
    }

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity
      bestMatch = candidate
    }
  }

  // Threshold judgment
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    const { startLine, endLine } = bestMatch
    let matchStartIndex = 0
    for (let k = 0; k < startLine; k++) {
      matchStartIndex += originalLines[k].length + 1
    }
    let matchEndIndex = matchStartIndex
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length
      if (k < endLine) {
        matchEndIndex += 1
      }
    }
    yield content.substring(matchStartIndex, matchEndIndex)
  }
}

export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  // Simplified version for debugging
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)

  const lines = content.split("\n")
  for (const line of lines) {
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line
    } else {
      // Check for substring match
      if (normalizeWhitespace(line).includes(normalizedFind)) {
        yield find // Just return the original search string
      }
    }
  }
}

export const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n")
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) return text

    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/)
        return match ? match[1].length : 0
      }),
    )

    return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n")
  }

  const normalizedFind = removeIndentation(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    if (removeIndentation(block) === normalizedFind) {
      yield block
    }
  }
}

export const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string => {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
      switch (capturedChar) {
        case "n":
          return "\n"
        case "t":
          return "\t"
        case "r":
          return "\r"
        case "'":
          return "'"
        case '"':
          return '"'
        case "`":
          return "`"
        case "\\":
          return "\\"
        case "\n":
          return "\n"
        case "$":
          return "$"
        default:
          return match
      }
    })
  }

  const unescapedFind = unescapeString(find)

  // Try direct match with unescaped find string
  if (content.includes(unescapedFind)) {
    yield unescapedFind
  }

  // Also try finding escaped versions in content that match unescaped find
  const lines = content.split("\n")
  const findLines = unescapedFind.split("\n")

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    const unescapedBlock = unescapeString(block)

    if (unescapedBlock === unescapedFind) {
      yield block
    }
  }
}

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  // This replacer yields all exact matches, allowing the replace function
  // to handle multiple occurrences based on replaceAll parameter
  let startIndex = 0

  while (true) {
    const index = content.indexOf(find, startIndex)
    if (index === -1) break

    yield find
    startIndex = index + find.length
  }
}

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()

  if (trimmedFind === find) {
    // Already trimmed, no point in trying
    return
  }

  // Try to find the trimmed version
  if (content.includes(trimmedFind)) {
    yield trimmedFind
  }

  // Also try finding blocks where trimmed content matches
  const lines = content.split("\n")
  const findLines = find.split("\n")

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")

    if (block.trim() === trimmedFind) {
      yield block
    }
  }
}

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")
  if (findLines.length < 3) {
    // Need at least 3 lines to have meaningful context
    return
  }

  // Remove trailing empty line if present
  if (findLines[findLines.length - 1] === "") {
    findLines.pop()
  }

  const contentLines = content.split("\n")

  // Extract first and last lines as context anchors
  const firstLine = findLines[0].trim()
  const lastLine = findLines[findLines.length - 1].trim()

  // Find blocks that start and end with the context anchors
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue

    // Look for the matching last line
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        // Found a potential context block
        const blockLines = contentLines.slice(i, j + 1)
        const block = blockLines.join("\n")

        // Check if the middle content has reasonable similarity
        // (simple heuristic: at least 50% of non-empty lines should match when trimmed)
        if (blockLines.length === findLines.length) {
          let matchingLines = 0
          let totalNonEmptyLines = 0

          for (let k = 1; k < blockLines.length - 1; k++) {
            const blockLine = blockLines[k].trim()
            const findLine = findLines[k].trim()

            if (blockLine.length > 0 || findLine.length > 0) {
              totalNonEmptyLines++
              if (blockLine === findLine) {
                matchingLines++
              }
            }
          }

          if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
            yield block
            break // Only match the first occurrence
          }
        }
        break
      }
    }
  }
}

export function trimDiff(diff: string): string {
  const lines = diff.split("\n")
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  )

  if (contentLines.length === 0) return diff

  let min = Infinity
  for (const line of contentLines) {
    const content = line.slice(1)
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/)
      if (match) min = Math.min(min, match[1].length)
    }
  }
  if (min === Infinity || min === 0) return diff
  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
    ) {
      const prefix = line[0]
      const content = line.slice(1)
      return prefix + content.slice(min)
    }
    return line
  })

  return trimmedLines.join("\n")
}

interface ReplaceOptions {
  occurrence?: number
  autoContext?: boolean
  confidence?: number
}

export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  options: ReplaceOptions = {}
): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.")
  }

  // Collect all matches with their positions and context
  let notFound = true
  const allMatches: Array<{
    search: string
    index: number
    line: number
    context: string
    confidence: number
  }> = []

  // Memory management limits to prevent excessive memory usage
  const MAX_MATCHES = 1000 // Maximum total matches to collect
  const MAX_CONTEXT_LENGTH = 150 // Reduced from 200 to save memory
  let totalMatchesCollected = 0

  // Context and confidence calculation constants
  const CONFIDENCE_EXACT_MATCH_BONUS = 0.1
  const CONFIDENCE_LONGER_MATCH_BONUS = 0.1
  const CONFIDENCE_NOT_AT_BEGINNING_BONUS = 0.05
  const CONFIDENCE_LONG_STRING_BONUS = 0.1
  const CONFIDENCE_NOT_AT_BEGINNING_THRESHOLD = 10
  const CONFIDENCE_LONG_STRING_THRESHOLD = 50
  const ERROR_CONTEXT_PREVIEW_LENGTH = 50 // Characters to show in error messages

  for (const replacer of [
    SimpleReplacer,
    LineTrimmedReplacer,
    BlockAnchorReplacer,
    WhitespaceNormalizedReplacer,
    IndentationFlexibleReplacer,
    EscapeNormalizedReplacer,
    TrimmedBoundaryReplacer,
    ContextAwareReplacer,
    MultiOccurrenceReplacer,
  ]) {
    // Special handling for MultiOccurrenceReplacer to get actual positions
    if (replacer === MultiOccurrenceReplacer) {
      let startIndex = 0
      while (true) {
        // Memory limit check
        if (totalMatchesCollected >= MAX_MATCHES) {
          console.warn(`Edit tool: Reached maximum match limit (${MAX_MATCHES}) to prevent memory exhaustion`)
          break
        }

        const index = content.indexOf(oldString, startIndex)
        if (index === -1) break
        notFound = false

        // Calculate line number and extract context
        const lines = content.substring(0, index).split('\n')
        const lineNumber = lines.length
        const contextStart = Math.max(0, index - MAX_CONTEXT_LENGTH)
        const contextEnd = Math.min(content.length, index + oldString.length + MAX_CONTEXT_LENGTH)
        const context = content.substring(contextStart, contextEnd)

        allMatches.push({
          search: oldString,
          index,
          line: lineNumber,
          context: context.trim(),
          confidence: 1.0
        })
        totalMatchesCollected++
        startIndex = index + oldString.length
      }
    } else {
      for (const search of replacer(content, oldString)) {
        // Memory limit check
        if (totalMatchesCollected >= MAX_MATCHES) {
          console.warn(`Edit tool: Reached maximum match limit (${MAX_MATCHES}) to prevent memory exhaustion`)
          break
        }

        const index = content.indexOf(search)
        if (index === -1) continue
        notFound = false

        // Calculate line number and extract context
        const lines = content.substring(0, index).split('\n')
        const lineNumber = lines.length
        const contextStart = Math.max(0, index - MAX_CONTEXT_LENGTH)
        const contextEnd = Math.min(content.length, index + search.length + MAX_CONTEXT_LENGTH)
        const context = content.substring(contextStart, contextEnd)

        // Calculate confidence based on various factors
        let confidence = 1.0
        if (replacer !== SimpleReplacer) confidence += CONFIDENCE_EXACT_MATCH_BONUS
        if (search.length > oldString.length) confidence += CONFIDENCE_LONGER_MATCH_BONUS
        if (lineNumber > CONFIDENCE_NOT_AT_BEGINNING_THRESHOLD) confidence += CONFIDENCE_NOT_AT_BEGINNING_BONUS

        allMatches.push({
          search,
          index,
          line: lineNumber,
          context: context.trim(),
          confidence: Math.min(confidence, 1.0)
        })
        totalMatchesCollected++
      }
    }
  }

  if (notFound) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
    )
  }

  // Handle replaceAll case
  if (replaceAll) {
    // Group by unique search strings and replace all
    const uniqueSearches = [...new Set(allMatches.map(m => m.search))]
    let result = content
    for (const search of uniqueSearches) {
      result = result.replaceAll(search, newString)
    }
    return result
  }

  // Filter unique matches by position
  const uniqueMatches = allMatches.filter((match, index, self) =>
    index === self.findIndex(m => m.index === match.index)
  )

  // Handle explicit occurrence selection
  if (options.occurrence) {
    const targetIndex = options.occurrence - 1 // Convert to 0-based
    if (targetIndex >= uniqueMatches.length) {
      throw new Error(`occurrence ${options.occurrence} is out of range. Found ${uniqueMatches.length} matches.`)
    }
    const match = uniqueMatches[targetIndex]
    return content.substring(0, match.index) + newString + content.substring(match.index + match.search.length)
  }

  // If only one unique match, use it
  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0]
    return content.substring(0, match.index) + newString + content.substring(match.index + match.search.length)
  }

  // Try auto context expansion if enabled
  if (options.autoContext !== false) {
    try {
      const expandedResult = tryWithContextExpansion(content, oldString, newString, options.confidence || 0.8)
      if (expandedResult) {
        return expandedResult
      }
    } catch (error) {
      // Context expansion failed, continue to enhanced error
    }
  }

  // Create enhanced error with match information
  const matchInfo = uniqueMatches.map((match, index) =>
    `Match ${index + 1} (line ${match.line}): ${match.context.substring(0, ERROR_CONTEXT_PREVIEW_LENGTH)}${match.context.length > ERROR_CONTEXT_PREVIEW_LENGTH ? '...' : ''}`
  ).join('\n')

  const suggestions = [
    "Add more surrounding context to oldString to make it unique",
    "Use occurrence: N to specify which match to replace",
    "Set replaceAll: true to replace all occurrences",
    "Set autoContext: false to disable automatic context expansion"
  ]

  throw new Error(
    `Found multiple matches for oldString. Please provide more specific context or use one of these solutions:\n\n` +
    `Found matches:\n${matchInfo}\n\n` +
    `Suggested solutions:\n${suggestions.map(s => `- ${s}`).join('\n')}`
  )
}

function tryWithContextExpansion(
  content: string,
  oldString: string,
  newString: string,
  minConfidence: number
): string | null {
  // Handle edge cases
  if (!content || content.length === 0) {
    return null
  }

  if (!oldString || oldString.length === 0) {
    return null
  }

  // Check if oldString exists in content
  if (content.indexOf(oldString) === -1) {
    return null
  }

  const oldLines = oldString.split('\n')
  const contentLines = content.split('\n')

  // Find all positions where the oldString matches first
  const allMatches = []
  let searchStart = 0

  while (true) {
    const index = content.indexOf(oldString, searchStart)
    if (index === -1) break

    // Calculate line number
    const linesBeforeMatch = content.substring(0, index).split('\n').length - 1
    allMatches.push({
      index,
      lineNumber: linesBeforeMatch
    })
    searchStart = index + 1
  }

  // If there's only one match, no need for context expansion
  if (allMatches.length <= 1) {
    return content.replace(oldString, newString)
  }

  // Try expanding context gradually (1, 2, 3 lines before/after)
  for (let expansion = 1; expansion <= 3; expansion++) {
    const expandedMatches = []

    // For each match, create expanded context
    for (const match of allMatches) {
      const startLine = Math.max(0, match.lineNumber - expansion)
      const endLine = Math.min(contentLines.length - 1, match.lineNumber + oldLines.length - 1 + expansion)

      // Extract expanded context
      const contextLines = []
      for (let i = startLine; i <= endLine; i++) {
        contextLines.push(contentLines[i])
      }
      const expandedOldString = contextLines.join('\n')

      expandedMatches.push({
        expandedString: expandedOldString,
        originalIndex: match.index,
        lineNumber: match.lineNumber
      })
    }

    // Count how many times each expanded string appears among all matches
    const expandedStringCounts = new Map<string, number>()
    for (const expanded of expandedMatches) {
      const count = expandedMatches.filter(m => m.expandedString === expanded.expandedString).length
      expandedStringCounts.set(expanded.expandedString, count)
    }

    // Look for expanded strings that appear exactly once AND have high confidence
    for (const match of expandedMatches) {
      const count = expandedStringCounts.get(match.expandedString) || 0
      if (count === 1) {
        // Calculate confidence based on context expansion
        let confidence = 0.2 // Lower base confidence

        // Higher confidence for more context expansion
        confidence += expansion * 0.15

        // Higher confidence if the match is not at the very beginning or end
        if (match.lineNumber > expansion && match.lineNumber < contentLines.length - oldLines.length - expansion) {
          confidence += 0.15
        }

        // Higher confidence for longer original strings
        if (oldString.length > CONFIDENCE_LONG_STRING_THRESHOLD) {
          confidence += CONFIDENCE_LONG_STRING_BONUS
        }

        // Higher confidence if there are other groups with multiple matches (indicating good differentiation)
        const otherGroupsCount = Array.from(expandedStringCounts.values()).filter(c => c > 1).length
        if (otherGroupsCount > 0) {
          confidence += 0.15
        }

        // Only use this match if it meets the confidence threshold
        if (confidence >= minConfidence) {
          const expandedNewString = match.expandedString.replace(oldString, newString)
          return content.replace(match.expandedString, expandedNewString)
        }
      }
    }
  }

  return null // No unique match found with context expansion
}

export { tryWithContextExpansion }
