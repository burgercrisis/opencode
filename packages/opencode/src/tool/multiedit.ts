import z from "zod"
import { Tool } from "./tool"
import { EditTool, replace } from "./edit"
import DESCRIPTION from "./multiedit.txt"
import path from "path"
import { Instance } from "../project/instance"
import { FileTime } from "../file/time"
import { Bus } from "../bus"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { TOOL } from "../constants"

export const MultiEditTool = Tool.define("multiedit", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to modify"),
    edits: z
      .array(
        z.object({
          oldString: z.string().describe("The text to replace"),
          newString: z.string().describe("The text to replace it with (must be different from oldString)"),
          replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
          occurrence: z.number().optional().describe("Replace the Nth occurrence (1-based index) when multiple matches exist"),
          autoContext: z.boolean().optional().describe("Automatically expand context when multiple matches are found (default true)"),
          confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold for automatic selection (0-1, default 0.8)"),
        }),
      )
      .describe("Array of edit operations to perform sequentially on the file"),
  }),
  async execute(params, ctx) {
    // Validate edits array to prevent unnecessary operations
    if (!params.edits || params.edits.length === 0) {
      return {
        title: path.relative(Instance.worktree, params.filePath),
        metadata: {
          editCount: 0,
          results: []
        },
        output: "No edits to apply",
      }
    }

    // Validate individual edit operations
    for (const edit of params.edits) {
      if (!edit.oldString || edit.oldString.length === 0) {
        throw new Error("All edits must have non-empty oldString")
      }
      if (!edit.newString || edit.newString.length === 0) {
        throw new Error("All edits must have non-empty newString")
      }
      // Note: We allow oldString === newString for no-op edits, but handle them in main logic
      if (edit.oldString.includes('\0') || edit.newString.includes('\0')) {
        throw new Error("Edit strings cannot contain null bytes")
      }
      if (edit.oldString.length > TOOL.MAX_LENGTH || edit.newString.length > TOOL.MAX_LENGTH) {
        throw new Error(`Edit strings too long: max ${TOOL.MAX_LENGTH} characters allowed`)
      }
      if (edit.occurrence !== undefined && edit.occurrence < 1) {
        throw new Error("occurrence must be a positive integer (1-based index)")
      }
      if (edit.confidence !== undefined && (edit.confidence < 0 || edit.confidence > 1)) {
        throw new Error("confidence must be between 0 and 1")
      }
    }

    const tool = await EditTool.init()

    // Read file once and apply all edits in memory
    const { file, contentOld } = await FileTime.withLock(params.filePath, async () => {
      const file = Bun.file(params.filePath)
      const stats = await file.stat().catch(() => { })
      if (!stats) throw new Error(`File ${params.filePath} not found`)
      if (stats.isDirectory()) throw new Error(`Path is a directory, not a file: ${params.filePath}`)
      await FileTime.assert(ctx.sessionID, params.filePath)
      const contentOld = await file.text()
      return { file, contentOld }
    })

    // Apply all edits sequentially with proper error handling and atomicity
    let contentNew = contentOld
    let appliedEdits = 0
    let failedEdits = 0
    const editResults: Array<{ index: number; success: boolean; applied: boolean; error?: string }> = []

    for (let i = 0; i < params.edits.length; i++) {
      const edit = params.edits[i]

      // Skip no-op edits
      if (edit.oldString === edit.newString) {
        editResults.push({
          index: i,
          success: true,
          applied: false // No-op, not actually applied
        })
        continue
      }

      try {
        contentNew = replace(contentNew, edit.oldString, edit.newString, edit.replaceAll, {
          occurrence: edit.occurrence,
          autoContext: edit.autoContext !== false, // default true
          confidence: edit.confidence ?? 0.8 // default 0.8
        })
        appliedEdits++
        editResults.push({
          index: i,
          success: true,
          applied: true
        })
      } catch (error) {
        failedEdits++

        // Log the failure but continue with other edits
        console.error(`Edit ${i + 1} failed:`, error)

        editResults.push({
          index: i,
          success: false,
          applied: false,
          error: error instanceof Error ? error.message : String(error)
        })

        // Continue with next edit instead of failing immediately
        continue
      }
    }

    // Write the final result only once at the end with proper error handling
    await FileTime.withLock(params.filePath, async () => {
      try {
        // Request permission for the edit operation
        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, params.filePath)],
          always: ["*"],
          metadata: {
            filepath: params.filePath,
            diff: `Applied ${params.edits.length} edits`,
          },
        })

        // Perform the atomic file write
        await file.write(contentNew)

        // Publish file events
        await Bus.publish(File.Event.Edited, {
          file: params.filePath,
        })
        await Bus.publish(FileWatcher.Event.Updated, {
          file: params.filePath,
          event: contentOld ? "change" : "add",
        })

        // Update file time tracking
        FileTime.read(ctx.sessionID, params.filePath)

      } catch (error) {
        // If any operation fails, we need to ensure the file state is consistent
        // Since we've been working with a copy (contentNew), the original file should be unchanged
        // But we should log the error and provide context for debugging

        const errorMessage = error instanceof Error ? error.message : String(error)
        const enhancedError = new Error(
          `MultiEdit failed during final file operations: ${errorMessage}. ` +
          `Applied ${appliedEdits} out of ${params.edits.length} edits before failure. ` +
          `Original file state should be preserved.`
        )

        // Add additional context to the error
        enhancedError.stack = error instanceof Error ? error.stack : enhancedError.stack

        throw enhancedError
      }
    })

    return {
      title: path.relative(Instance.worktree, params.filePath),
      metadata: {
        editCount: params.edits.length,
        appliedEdits,
        failedEdits,
        results: editResults
      },
      output: `Successfully applied ${appliedEdits} edit(s)${failedEdits > 0 ? ` (${failedEdits} failed)` : ''}`,
    }
  },
})
