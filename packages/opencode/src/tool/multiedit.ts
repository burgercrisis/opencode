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
      if (edit.oldString === edit.newString) {
        throw new Error("oldString and newString cannot be identical in an edit")
      }
      if (edit.oldString.includes('\0') || edit.newString.includes('\0')) {
        throw new Error("Edit strings cannot contain null bytes")
      }
      if (edit.oldString.length > TOOL.MAX_LENGTH || edit.newString.length > TOOL.MAX_LENGTH) {
        throw new Error(`Edit strings too long: max ${TOOL.MAX_LENGTH} characters allowed`)
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

    for (let i = 0; i < params.edits.length; i++) {
      const edit = params.edits[i]

      // Skip no-op edits
      if (edit.oldString === edit.newString) {
        continue
      }

      try {
        contentNew = replace(contentNew, edit.oldString, edit.newString, edit.replaceAll)
        appliedEdits++
      } catch (error) {
        failedEdits++

        // Log the failure but continue with other edits
        console.error(`Edit ${i + 1} failed:`, error)

        // Continue with next edit instead of failing immediately
        continue
      }
    }

    // Write the final result only once at the end
    await FileTime.withLock(params.filePath, async () => {
      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Instance.worktree, params.filePath)],
        always: ["*"],
        metadata: {
          filepath: params.filePath,
          diff: `Applied ${params.edits.length} edits`,
        },
      })
      await file.write(contentNew)
      await Bus.publish(File.Event.Edited, {
        file: params.filePath,
      })
      await Bus.publish(FileWatcher.Event.Updated, {
        file: params.filePath,
        event: contentOld ? "change" : "add",
      })
      FileTime.read(ctx.sessionID, params.filePath)
    })

    return {
      title: path.relative(Instance.worktree, params.filePath),
      metadata: {
        editCount: params.edits.length,
        appliedEdits,
        failedEdits,
        results: params.edits.map((edit, index) => ({
          index,
          success: true,
          applied: true
        }))
      },
      output: `Successfully applied ${appliedEdits} edit(s)${failedEdits > 0 ? ` (${failedEdits} failed)` : ''}`,
    }
  },
})
