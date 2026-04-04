import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import { Log } from "../util/log"

export namespace Patch {
  const log = Log.create({ service: "patch" })

  // Schema definitions
  export const PatchSchema = z.object({
    patchText: z.string().describe("The full patch text that describes all changes to be made"),
  })

  export type PatchParams = z.infer<typeof PatchSchema>

  // Core types matching the Rust implementation
  export interface ApplyPatchArgs {
    patch: string
    hunks: Hunk[]
    workdir?: string
  }

  export type Hunk =
    | { type: "add"; path: string; contents: string }
    | { type: "delete"; path: string }
    | { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] }

  export interface UpdateFileChunk {
    old_lines: string[]
    new_lines: string[]
    change_context?: string
    is_end_of_file?: boolean
  }

  export interface ApplyPatchAction {
    changes: Map<string, ApplyPatchFileChange>
    patch: string
    cwd: string
  }

  export type ApplyPatchFileChange =
    | { type: "add"; content: string }
    | { type: "delete"; content: string }
    | { type: "update"; unified_diff: string; move_path?: string; new_content: string }

  export interface AffectedPaths {
    added: string[]
    modified: string[]
    deleted: string[]
  }

  export enum ApplyPatchError {
    ParseError = "ParseError",
    IoError = "IoError",
    ComputeReplacements = "ComputeReplacements",
    ImplicitInvocation = "ImplicitInvocation",
  }

  export enum MaybeApplyPatch {
    Body = "Body",
    ShellParseError = "ShellParseError",
    PatchParseError = "PatchParseError",
    NotApplyPatch = "NotApplyPatch",
  }

  export enum MaybeApplyPatchVerified {
    Body = "Body",
    ShellParseError = "ShellParseError",
    CorrectnessError = "CorrectnessError",
    NotApplyPatch = "NotApplyPatch",
  }

  // Parser implementation
  function parsePatchHeader(
    lines: string[],
    startIdx: number,
  ): { filePath: string; movePath?: string; nextIdx: number } | null {
    const line = lines[startIdx]

    if (line.startsWith("*** Add File:")) {
      const filePath = line.slice(line.indexOf(":") + 1).trim()
      return filePath ? { filePath, nextIdx: startIdx + 1 } : null
    }

    if (line.startsWith("*** Delete File:")) {
      const filePath = line.slice(line.indexOf(":") + 1).trim()
      return filePath ? { filePath, nextIdx: startIdx + 1 } : null
    }

    if (line.startsWith("*** Update File:")) {
      const filePath = line.slice(line.indexOf(":") + 1).trim()
      const nextIdxAfterHeader = startIdx + 1
      const hasMove = nextIdxAfterHeader < lines.length && lines[nextIdxAfterHeader].startsWith("*** Move to:")
      const movePath = hasMove ? lines[nextIdxAfterHeader].slice(lines[nextIdxAfterHeader].indexOf(":") + 1).trim() : undefined
      const nextIdx = hasMove ? nextIdxAfterHeader + 1 : nextIdxAfterHeader

      return filePath ? { filePath, movePath, nextIdx } : null
    }

    return null
  }

  function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
    const parseChunks = (currentIdx: number, acc: UpdateFileChunk[]): { chunks: UpdateFileChunk[]; nextIdx: number } => {
      if (currentIdx >= lines.length || lines[currentIdx].startsWith("***")) {
        return { chunks: acc, nextIdx: currentIdx }
      }

      if (lines[currentIdx].startsWith("@@")) {
        const contextLine = lines[currentIdx].substring(2).trim()

        const parseLines = (
          i: number,
          oldL: string[],
          newL: string[],
          eof: boolean,
        ): { nextI: number; oldLines: string[]; newLines: string[]; isEndOfFile: boolean } => {
          if (i >= lines.length || lines[i].startsWith("@@") || lines[i].startsWith("***")) {
            return { nextI: i, oldLines: oldL, newLines: newL, isEndOfFile: eof }
          }

          const changeLine = lines[i]
          if (changeLine === "*** End of File") {
            return { nextI: i + 1, oldLines: oldL, newLines: newL, isEndOfFile: true }
          }

          if (changeLine.startsWith(" ")) {
            const content = changeLine.substring(1)
            return parseLines(i + 1, [...oldL, content], [...newL, content], eof)
          }

          if (changeLine.startsWith("-")) {
            return parseLines(i + 1, [...oldL, changeLine.substring(1)], newL, eof)
          }

          if (changeLine.startsWith("+")) {
            return parseLines(i + 1, oldL, [...newL, changeLine.substring(1)], eof)
          }

          return parseLines(i + 1, oldL, newL, eof)
        }

        const { nextI, oldLines, newLines, isEndOfFile } = parseLines(currentIdx + 1, [], [], false)
        return parseChunks(nextI, [
          ...acc,
          {
            old_lines: oldLines,
            new_lines: newLines,
            change_context: contextLine || undefined,
            is_end_of_file: isEndOfFile || undefined,
          },
        ])
      }

      return parseChunks(currentIdx + 1, acc)
    }

    return parseChunks(startIdx, [])
  }

  function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
    const parse = (i: number, acc: string): { content: string; nextIdx: number } => {
      if (i >= lines.length || lines[i].startsWith("***")) {
        // Remove trailing newline
        const content = acc.endsWith("\n") ? acc.slice(0, -1) : acc
        return { content, nextIdx: i }
      }

      const nextAcc = lines[i].startsWith("+") ? acc + lines[i].substring(1) + "\n" : acc
      return parse(i + 1, nextAcc)
    }

    return parse(startIdx, "")
  }

  export function parsePatch(patchText: string): { hunks: Hunk[] } {
    const lines = patchText.split(/\r?\n/)

    // Look for Begin/End patch markers
    const beginMarker = "*** Begin Patch"
    const endMarker = "*** End Patch"

    const beginIdx = lines.findIndex((line) => line.trim() === beginMarker)
    const endIdx = lines.findIndex((line) => line.trim() === endMarker)

    if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
      throw new Error("Invalid patch format: missing Begin/End markers")
    }

    // Parse content between markers
    const parseHunks = (currentIdx: number, acc: Hunk[]): Hunk[] => {
      if (currentIdx >= endIdx) return acc

      const header = parsePatchHeader(lines, currentIdx)
      if (!header) return parseHunks(currentIdx + 1, acc)

      const line = lines[currentIdx]
      if (line.startsWith("*** Add File:")) {
        const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx)
        return parseHunks(nextIdx, [
          ...acc,
          {
            type: "add",
            path: header.filePath,
            contents: content,
          },
        ])
      }

      if (line.startsWith("*** Delete File:")) {
        return parseHunks(header.nextIdx, [
          ...acc,
          {
            type: "delete",
            path: header.filePath,
          },
        ])
      }

      if (line.startsWith("*** Update File:")) {
        const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx)
        return parseHunks(nextIdx, [
          ...acc,
          {
            type: "update",
            path: header.filePath,
            move_path: header.movePath,
            chunks,
          },
        ])
      }

      return parseHunks(currentIdx + 1, acc)
    }

    return { hunks: parseHunks(beginIdx + 1, []) }
  }

  export function safeParsePatch(patchText: string): { success: true; data: { hunks: Hunk[] } } | { success: false; error: Error } {
    try {
      return { success: true, data: parsePatch(patchText) }
    } catch (e) {
      return { success: false, error: e as Error }
    }
  }

  // Apply patch functionality
  export function maybeParseApplyPatch(
    argv: string[],
  ):
    | { type: MaybeApplyPatch.Body; args: ApplyPatchArgs }
    | { type: MaybeApplyPatch.PatchParseError; error: Error }
    | { type: MaybeApplyPatch.NotApplyPatch } {
    const APPLY_PATCH_COMMANDS = ["apply_patch", "applypatch"]

    // Direct invocation: apply_patch <patch>
    if (argv.length === 2 && APPLY_PATCH_COMMANDS.includes(argv[0])) {
      try {
        const { hunks } = parsePatch(argv[1])
        return {
          type: MaybeApplyPatch.Body,
          args: {
            patch: argv[1],
            hunks,
          },
        }
      } catch (error) {
        return {
          type: MaybeApplyPatch.PatchParseError,
          error: error as Error,
        }
      }
    }

    // Bash heredoc form: bash -lc 'apply_patch <<"EOF" ...'
    if (argv.length === 3 && argv[0] === "bash" && argv[1] === "-lc") {
      // Simple extraction - in real implementation would need proper bash parsing
      const script = argv[2]
      const heredocMatch = script.match(/apply_patch\s*<<['"](\w+)['"]\s*\n([\s\S]*?)\n\1/)

      if (heredocMatch) {
        const patchContent = heredocMatch[2]
        try {
          const { hunks } = parsePatch(patchContent)
          return {
            type: MaybeApplyPatch.Body,
            args: {
              patch: patchContent,
              hunks,
            },
          }
        } catch (error) {
          return {
            type: MaybeApplyPatch.PatchParseError,
            error: error as Error,
          }
        }
      }
    }

    return { type: MaybeApplyPatch.NotApplyPatch }
  }

  // File content manipulation
  interface ApplyPatchFileUpdate {
    unified_diff: string
    content: string
  }

  const normalize = (s: string) =>
    s
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\u2014/g, "--")
      .replace(/\u2013/g, "-")
      .trim()

  const linesMatch = (a: string, b: string) => {
    if (a === b) return true
    return normalize(a) === normalize(b)
  }

  export async function deriveNewContentsFromChunks(
    filePath: string,
    chunks: UpdateFileChunk[],
    existingContent?: string,
  ): Promise<ApplyPatchFileUpdate> {
    // Read original file content
    const originalContent =
      existingContent ??
      (await (async () => {
        try {
          return await Bun.file(filePath).text()
        } catch (error) {
          throw new Error(`Failed to read file ${filePath}: ${error}`)
        }
      })())

    const initialLines = originalContent.split(/\r?\n/)

    // Drop trailing empty element for consistent line counting
    const originalLines = (initialLines.length > 0 && initialLines[initialLines.length - 1] === "")
      ? initialLines.slice(0, -1)
      : initialLines

    const replacements = computeReplacements(originalLines, filePath, chunks)
    const appliedLines = applyReplacements(originalLines, replacements)

    // Ensure trailing newline
    const newLines = (appliedLines.length === 0 || appliedLines[appliedLines.length - 1] !== "")
      ? [...appliedLines, ""]
      : appliedLines

    const newContent = newLines.join("\n")

    // Generate unified diff
    const unifiedDiff = generateUnifiedDiff(originalContent, newContent)

    return {
      unified_diff: unifiedDiff,
      content: newContent,
    }
  }

  function computeReplacements(
    originalLines: string[],
    filePath: string,
    chunks: UpdateFileChunk[],
  ): Array<[number, number, string[]]> {
    const { replacements } = chunks.reduce(
      (acc, chunk) => {
        // Handle context-based seeking
        const lineIndexAfterContext = chunk.change_context
          ? (() => {
              const contextIdx = seekSequence(originalLines, [chunk.change_context], acc.lineIndex)
              if (contextIdx === -1) {
                throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`)
              }
              return contextIdx + 1
            })()
          : acc.lineIndex

        // Handle pure addition (no old lines)
        if (chunk.old_lines.length === 0) {
          const insertionIdx =
            originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
              ? originalLines.length - 1
              : originalLines.length
          return {
            replacements: [...acc.replacements, [insertionIdx, 0, chunk.new_lines] as [number, number, string[]]],
            lineIndex: lineIndexAfterContext,
          }
        }

        // Try to match old lines in the file
        const findMatch = (pattern: string[], newSlice: string[]): [number, number, string[]] | null => {
          const found = seekSequence(originalLines, pattern, lineIndexAfterContext)
          if (found !== -1) return [found, pattern.length, newSlice]
          if (pattern.length > 0 && pattern[pattern.length - 1] === "") {
            return findMatch(pattern.slice(0, -1), newSlice.length > 0 ? newSlice.slice(0, -1) : newSlice)
          }
          return null
        }

        const match = findMatch(chunk.old_lines, chunk.new_lines)
        if (!match) {
          throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`)
        }

        return {
          replacements: [...acc.replacements, match],
          lineIndex: match[0] + match[1],
        }
      },
      { replacements: [] as Array<[number, number, string[]]>, lineIndex: 0 },
    )

    // Sort replacements by index to apply in order
    return [...replacements].sort((a, b) => a[0] - b[0])
  }

  function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
    // Apply replacements in reverse order to avoid index shifting
    return replacements
      .sort((a, b) => b[0] - a[0])
      .reduce((acc, [startIdx, oldLen, newSegment]) => [
        ...acc.slice(0, startIdx),
        ...newSegment,
        ...acc.slice(startIdx + oldLen)
      ], lines)
  }

  function seekSequence(lines: string[], pattern: string[], startIndex: number): number {
    if (pattern.length === 0) return -1

    const checkMatch = (idx: number) => pattern.every((p, j) => linesMatch(lines[idx + j], p))

    const findIndex = (i: number): number => {
      if (i > lines.length - pattern.length) return -1
      if (checkMatch(i)) return i
      return findIndex(i + 1)
    }

    return findIndex(startIndex)
  }

  function generateUnifiedDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split("\n")
    const newLines = newContent.split("\n")

    const maxLen = Math.max(oldLines.length, newLines.length)
    
    const diffLinesList = Array.from({ length: maxLen }).reduce((acc: string[], _, i) => {
      const oldLine = oldLines[i] || ""
      const newLine = newLines[i] || ""

      if (oldLine !== newLine) {
        const removed = oldLine ? [`-${oldLine}`] : []
        const added = newLine ? [`+${newLine}`] : []
        return [...acc, ...removed, ...added]
      }
      
      if (oldLine) return [...acc, ` ${oldLine}`]
      return acc
    }, [])

    const hasChanges = diffLinesList.some(line => line.startsWith("+") || line.startsWith("-"))
    return hasChanges ? "@@ -1 +1 @@\n" + diffLinesList.join("\n") + "\n" : ""
  }

  // Apply hunks to filesystem
  export async function applyHunksToFiles(hunks: Hunk[]): Promise<AffectedPaths> {
    if (hunks.length === 0) throw new Error("No files were modified.")

    const results = await Promise.all(
      hunks.map(async (hunk) => {
        if (hunk.type === "add") {
          const dir = path.dirname(hunk.path)
          if (dir !== "." && dir !== "/") await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(hunk.path, hunk.contents, "utf-8")
          log.info(`Added file: ${hunk.path}`)
          return { type: "added" as const, path: hunk.path }
        }

        if (hunk.type === "delete") {
          await fs.unlink(hunk.path)
          log.info(`Deleted file: ${hunk.path}`)
          return { type: "deleted" as const, path: hunk.path }
        }

        const update = await deriveNewContentsFromChunks(hunk.path, hunk.chunks)

        if (hunk.move_path) {
          const dir = path.dirname(hunk.move_path)
          if (dir !== "." && dir !== "/") await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(hunk.move_path, update.content, "utf-8")
          await fs.unlink(hunk.path)
          log.info(`Moved file: ${hunk.path} -> ${hunk.move_path}`)
          return { type: "modified" as const, path: hunk.move_path }
        }

        await fs.writeFile(hunk.path, update.content, "utf-8")
        log.info(`Updated file: ${hunk.path}`)
        return { type: "modified" as const, path: hunk.path }
      }),
    )

    return results.reduce(
      (acc, res) => {
        if (res.type === "added") return { ...acc, added: [...acc.added, res.path] }
        if (res.type === "modified") return { ...acc, modified: [...acc.modified, res.path] }
        return { ...acc, deleted: [...acc.deleted, res.path] }
      },
      { added: [], modified: [], deleted: [] } as AffectedPaths,
    )
  }

  // Main patch application function
  export async function applyPatch(patchText: string): Promise<AffectedPaths> {
    const { hunks } = parsePatch(patchText)
    return applyHunksToFiles(hunks)
  }

  // Async version of maybeParseApplyPatchVerified
  export async function maybeParseApplyPatchVerified(
    argv: string[],
    cwd: string,
  ): Promise<
    | { type: MaybeApplyPatchVerified.Body; action: ApplyPatchAction }
    | { type: MaybeApplyPatchVerified.CorrectnessError; error: Error }
    | { type: MaybeApplyPatchVerified.NotApplyPatch }
  > {
    // Detect implicit patch invocation (raw patch without apply_patch command)
    const isImplicit = argv.length === 1 && (() => {
      try {
        parsePatch(argv[0])
        return true
      } catch {
        return false
      }
    })()

    if (isImplicit) {
      return {
        type: MaybeApplyPatchVerified.CorrectnessError,
        error: new Error(ApplyPatchError.ImplicitInvocation),
      }
    }

    const result = maybeParseApplyPatch(argv)

    if (result.type === MaybeApplyPatch.PatchParseError) {
      return {
        type: MaybeApplyPatchVerified.CorrectnessError,
        error: result.error,
      }
    }

    if (result.type === MaybeApplyPatch.NotApplyPatch) {
      return { type: MaybeApplyPatchVerified.NotApplyPatch }
    }

    const effectiveCwd = result.args.workdir ? path.resolve(cwd, result.args.workdir) : cwd

    try {
      const changesList = await Promise.all(
        result.args.hunks.map(async (hunk) => {
          const resolvedPath = path.resolve(
            effectiveCwd,
            hunk.type === "update" && hunk.move_path ? hunk.move_path : hunk.path,
          )

          if (hunk.type === "add") {
            return {
              path: resolvedPath,
              change: {
                type: "add" as const,
                content: hunk.contents,
              },
            }
          }

          if (hunk.type === "delete") {
            const deletePath = path.resolve(effectiveCwd, hunk.path)
            const content = await fs.readFile(deletePath, "utf-8")
            return {
              path: resolvedPath,
              change: {
                type: "delete" as const,
                content,
              },
            }
          }

          if (hunk.type === "update") {
            const updatePath = path.resolve(effectiveCwd, hunk.path)
            const fileUpdate = await deriveNewContentsFromChunks(updatePath, hunk.chunks)
            return {
              path: resolvedPath,
              change: {
                type: "update" as const,
                unified_diff: fileUpdate.unified_diff,
                move_path: hunk.move_path ? path.resolve(effectiveCwd, hunk.move_path) : undefined,
                new_content: fileUpdate.content,
              },
            }
          }

          return null as never
        }),
      )

      return {
        type: MaybeApplyPatchVerified.Body,
        action: {
          changes: new Map(changesList.map((c) => [c.path, c.change])),
          patch: result.args.patch,
          cwd: effectiveCwd,
        },
      }
    } catch (error) {
      return {
        type: MaybeApplyPatchVerified.CorrectnessError,
        error: error as Error,
      }
    }
  }
}
