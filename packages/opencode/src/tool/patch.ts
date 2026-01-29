import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "./tool"
import { FileTime } from "../file/time"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import { Instance } from "../project/instance"
import { Patch } from "../patch"
import { Filesystem } from "../util/filesystem"
import { createTwoFilesPatch } from "diff"
import { assertExternalDirectory } from "./external-directory"

import DESCRIPTION from "./patch.txt"

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made"),
})

export const PatchTool = Tool.define("patch", {
  description: DESCRIPTION,
  parameters: PatchParams,
  async execute(params, ctx) {
    if (!params.patchText) throw new Error("patchText is required")

    const { hunks } = (() => {
      try {
        return Patch.parsePatch(params.patchText)
      } catch (error) {
        throw new Error(`Failed to parse patch: ${error}`)
      }
    })()

    if (hunks.length === 0) throw new Error("No file changes found in patch")

    const fileChanges = await Promise.all(hunks.map(async (hunk) => {
      const filePath = Filesystem.resolvePath(Instance.directory, hunk.path)
      await assertExternalDirectory(ctx, filePath)

      if (hunk.type === "add") {
        const oldContent = ""
        const newContent = hunk.contents
        const diff = createTwoFilesPatch(filePath, filePath, oldContent, newContent)
        return {
          filePath,
          oldContent,
          newContent,
          type: "add" as const,
          diff,
        }
      }

      if (hunk.type === "update") {
        const stats = await fs.stat(filePath).catch(() => null)
        if (!stats || stats.isDirectory()) throw new Error(`File not found or is directory: ${filePath}`)

        await FileTime.assert(ctx.sessionID, filePath)
        const oldContent = await fs.readFile(filePath, "utf-8")

        const newContent = await (async () => {
          try {
            const fileUpdate = await Patch.deriveNewContentsFromChunks(filePath, hunk.chunks)
            return fileUpdate.content
          } catch (error) {
            throw new Error(`Failed to apply update to ${filePath}: ${error}`)
          }
        })()

        const diff = createTwoFilesPatch(filePath, filePath, oldContent, newContent)
        const movePath = hunk.move_path ? Filesystem.resolvePath(Instance.directory, hunk.move_path) : undefined
        if (movePath) await assertExternalDirectory(ctx, movePath)

        return {
          filePath,
          oldContent,
          newContent,
          type: (hunk.move_path ? "move" : "update") as const,
          movePath,
          diff,
        }
      }

      if (hunk.type === "delete") {
        await FileTime.assert(ctx.sessionID, filePath)
        const oldContent = await fs.readFile(filePath, "utf-8")
        const diff = createTwoFilesPatch(filePath, filePath, oldContent, "")
        return {
          filePath,
          oldContent,
          newContent: "",
          type: "delete" as const,
          diff,
        }
      }

      throw new Error(`Unknown hunk type: ${(hunk as any).type}`)
    }))

    const totalDiff = fileChanges.map(c => c.diff).join("\n")

    await ctx.ask({
      permission: "edit",
      patterns: fileChanges.map((c) => Filesystem.relativePath(Instance.worktree, c.filePath)),
      always: ["*"],
      metadata: {
        diff: totalDiff,
      },
    })

    const changedFiles = await Promise.all(fileChanges.map(async (change) => {
      if (change.type === "add") {
        const dir = Filesystem.dirname(change.filePath)
        if (dir !== "." && dir !== "/") await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(change.filePath, change.newContent, "utf-8")
        return change.filePath
      }

      if (change.type === "update") {
        await fs.writeFile(change.filePath, change.newContent, "utf-8")
        return change.filePath
      }

      if (change.type === "move" && change.movePath) {
        const dir = Filesystem.dirname(change.movePath)
        if (dir !== "." && dir !== "/") await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(change.movePath, change.newContent, "utf-8")
        await fs.unlink(change.filePath)
        return change.movePath
      }

      if (change.type === "delete") {
        await fs.unlink(change.filePath)
        return change.filePath
      }

      return ""
    }))

    // Update file time tracking and publish events
    await Promise.all(fileChanges.flatMap(change => {
      const paths = [change.filePath, change.movePath].filter((p): p is string => !!p)
      return paths.map(async (p) => {
        FileTime.read(ctx.sessionID, p)
      })
    }))

    await Promise.all(changedFiles.filter(Boolean).map(async (p) => {
      await Bus.publish(FileWatcher.Event.Updated, { file: p, event: "change" })
    }))

    const relativePaths = changedFiles.filter(Boolean).map((p) => Filesystem.relativePath(Instance.worktree, p))
    const summary = `${fileChanges.length} files changed`

    return {
      title: summary,
      metadata: {
        diff: totalDiff,
      },
      output: `Patch applied successfully. ${summary}:\n${relativePaths.map((p) => `  ${p}`).join("\n")}`,
    }
  },
})
