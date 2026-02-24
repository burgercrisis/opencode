import z from "zod"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { Bus } from "../bus"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { trimDiff } from "./edit"
import { assertExternalDirectory } from "./external-directory"
import { Log } from "../util/log"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5
const MAX_CONTENT_SIZE = 10 * 1024 * 1024 // 10MB limit

const log = Log.create({ service: "write.tool" })

const parameters = z.object({
  content: z.string().max(MAX_CONTENT_SIZE).describe("The content to write to the file (max 10MB)"),
  filePath: z.string().refine((pathStr) => {
    // Use proper path validation that prevents directory traversal
    const validation = Filesystem.validateFilepath(pathStr, Instance.directory)
    return validation.valid
  }, "Path must be safe and within project directory").describe("The absolute path to the file to write (must be absolute, not relative)"),
})

export const WriteTool = Tool.define<typeof parameters, { diagnostics: any; filepath: string; exists: boolean }>("write", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    // Normalize and validate path early to prevent traversal
    const filepath = Filesystem.normalizeNativePath(
      path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(Instance.directory, params.filePath)
    )

    // BEST OF BOTH WORLDS: Use file locking from HEAD for safety
    return await FileTime.withLock(filepath, async () => {
      try {
        // Validate external directory access (from HEAD)
        await assertExternalDirectory(ctx, filepath)

        // Ensure parent directory exists
        const parentDir = path.dirname(filepath)
        try {
          // Create directory if it doesn't exist
          const dirFile = Bun.file(parentDir)
          if (!(await dirFile.exists())) {
            await Bun.write(parentDir + "/.gitkeep", "")
            await Bun.file(parentDir + "/.gitkeep").delete()
          }
        } catch (error) {
          throw new Error(`Failed to create parent directory ${parentDir}: ${error instanceof Error ? error.message : String(error)}`)
        }

        // Check file existence and read content safely (from HEAD using Bun.file)
        const file = Bun.file(filepath)
        const exists = await file.exists()
        const contentOld = exists ? await file.text() : ""

        // Assert file time if file exists (from both)
        if (exists) {
          await FileTime.assert(ctx.sessionID, filepath)
        }

        // Create diff for permission request
        const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content))

        // Request permission
        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, filepath)],
          always: ["*"],
          metadata: {
            filepath,
            diff,
          },
        })

        // Perform atomic write using temporary file
        const tempPath = `${filepath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`
        try {
          await Bun.write(tempPath, params.content)

          // Verify the write was successful
          const tempFile = Bun.file(tempPath)
          const tempExists = await tempFile.exists()
          if (!tempExists) {
            throw new Error("Temporary file write failed")
          }

          // Atomic rename using file system operations
          const fs = await import('fs/promises')
          await fs.rename(tempPath, filepath)
        } catch (error) {
          // Clean up temp file if it exists
          try {
            await Bun.file(tempPath).delete()
          } catch {
            // Ignore cleanup errors
          }
          throw new Error(`Failed to write file ${filepath}: ${error instanceof Error ? error.message : String(error)}`)
        }

        // Update file time tracking
        FileTime.read(ctx.sessionID, filepath)

        // Publish events
        await Bus.publish(File.Event.Edited, {
          file: filepath,
        })
        await Bus.publish(FileWatcher.Event.Updated, {
          file: filepath,
          event: exists ? "change" : "add",
        })

        // Handle LSP operations with proper error handling
        let diagnostics: any = {}
        try {
          // Run LSP operations in background to avoid blocking
          const lspPromise = LSP.touchFile(filepath, true).then(() => LSP.diagnostics())

          // Wait for LSP with timeout to prevent blocking
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("LSP operations timeout")), 5000)
          )

          diagnostics = await Promise.race([lspPromise, timeoutPromise]) as any
        } catch (error) {
          log.warn("LSP operations failed or timed out", {
            filepath,
            error: error instanceof Error ? error.message : String(error)
          })
          diagnostics = {}
        }

        // Process diagnostics with consistent path normalization
        const normalizedFilepath = Filesystem.normalizePath(filepath)
        const diagnosticOutput = Object.entries(diagnostics).reduce(
          (acc, [file, issues]) => {
            const issuesArray = Array.isArray(issues) ? issues : []
            const errors = issuesArray.filter((item: any) => item.severity === 1)
            const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
            const suffix = errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
            const formatted = `<diagnostics file="${file}">\n${limited.map((item: any) => LSP.Diagnostic.pretty(item)).join("\n")}${suffix}\n</diagnostics>`

            return errors.length === 0 ? acc : (
              file === normalizedFilepath ? { ...acc, current: formatted } : (
                acc.count >= MAX_PROJECT_DIAGNOSTICS_FILES ? acc : {
                  ...acc,
                  others: [...acc.others, formatted],
                  count: acc.count + 1,
                }
              )
            )
          },
          { current: "", others: [] as string[], count: 0 }
        )

        // Generate output
        const output = [
          "Wrote file successfully.",
          diagnosticOutput.current ? `\n\nLSP errors detected in this file, please fix:\n${diagnosticOutput.current}` : "",
          diagnosticOutput.others.length > 0 ? `\n\nLSP errors detected in other files:\n${diagnosticOutput.others.join("\n\n")}` : "",
        ].filter(Boolean).join("")

        return {
          title: path.relative(Instance.worktree, filepath),
          metadata: {
            diagnostics,
            filepath,
            exists: exists,
          },
          output,
        }
      } catch (error) {
        // Enhanced error handling with context
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error("Write operation failed", {
          filepath: params.filePath,
          error: errorMessage,
          sessionID: ctx.sessionID
        })

        // Re-throw with more context if it's a filesystem error
        if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
          throw new Error(`Permission denied writing to ${params.filePath}. Check file and directory permissions.`)
        }

        throw error
      }
    })
  },
})
