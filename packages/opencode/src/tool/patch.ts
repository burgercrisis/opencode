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
    const patchText = params.patchText || (() => { throw new Error("patchText is required") })()
    const parsed = Patch.safeParsePatch(patchText)
    const { hunks } = parsed.success ? parsed.data : (() => { throw new Error("Failed to parse patch") })()

    return hunks.length === 0
      ? (() => { throw new Error("No file changes found in patch") })()
      : (async () => {
          const fileChanges = await hunks.reduce(async (accPromise, hunk) => {
            const acc = await accPromise
            const filePath = Filesystem.resolvePath(Instance.directory, hunk.path)
            await assertExternalDirectory(ctx, filePath)

            const file = Bun.file(filePath)
            const oldContent = hunk.type === "add" ? "" : await file.text()
            const diffBase = (newContent: string) => ({
              filePath,
              oldContent,
              newContent,
              diff: createTwoFilesPatch(filePath, filePath, oldContent, newContent)
            })

            const change = await (hunk.type === "add"
              ? Promise.resolve({ ...diffBase(hunk.contents), type: "add" as const })
              : hunk.type === "delete"
                ? (async () => {
                    FileTime.assert(ctx.sessionID, filePath)
                    return { ...diffBase(""), type: "delete" as const }
                  })()
                : hunk.type === "update"
                  ? (async () => {
                      !(await file.exists()) && (() => { throw new Error(`File not found: ${filePath}`) })()
                      await FileTime.assert(ctx.sessionID, filePath)

                      const update = await Patch.deriveNewContentsFromChunks(filePath, hunk.chunks)
                        .catch((error) => { throw new Error(`Failed to apply update to ${filePath}: ${error}`) })

                      const movePath = hunk.move_path ? Filesystem.resolvePath(Instance.directory, hunk.move_path) : undefined
                      movePath && await assertExternalDirectory(ctx, movePath)

                      return {
                        ...diffBase(update.content),
                        type: hunk.move_path ? "move" : "update",
                        movePath
                      }
                    })()
                  : (() => { throw new Error(`Unknown hunk type: ${(hunk as any).type}`) })())

            return acc.concat(change)
          }, Promise.resolve([] as any[]))

          const totalDiff = fileChanges.map(c => c.diff).join("\n")

          await ctx.ask({
            permission: "edit",
            patterns: fileChanges.map((c) => Filesystem.relativePath(Instance.worktree, c.filePath)),
            always: ["*"],
            metadata: { diff: totalDiff },
          })

          const changedFiles = await fileChanges.reduce(async (accPromise, change) => {
            const acc = await accPromise
            const p = change.type === "move" && change.movePath ? change.movePath : change.filePath
            const isNew = change.type === "add" || change.type === "move"
            const dir = Filesystem.dirname(p)

            isNew && dir !== "." && dir !== "/" && await fs.mkdir(dir, { recursive: true })

            const updatedPath = await (change.type === "delete"
              ? fs.unlink(change.filePath).then(() => change.filePath)
              : change.type === "move"
                ? Bun.write(p, change.newContent).then(() => fs.unlink(change.filePath)).then(() => p)
                : Bun.write(p, change.newContent).then(() => p))

            return acc.concat(updatedPath)
          }, Promise.resolve([] as string[]))

          // Update file time tracking and publish events sequentially
          await fileChanges.reduce(async (acc, change) => {
            await acc
            await [change.filePath, change.movePath]
              .filter((p): p is string => !!p)
              .reduce(async (innerAcc, p) => {
                await innerAcc
                FileTime.read(ctx.sessionID, p)
              }, Promise.resolve())
          }, Promise.resolve())

          await changedFiles.reduce(async (acc: Promise<void>, p: string) => {
            await acc
            p && await Bus.publish(FileWatcher.Event.Updated, { file: p, event: "change" })
          }, Promise.resolve())

          const relativePaths = changedFiles.filter(Boolean).map((p: string) => Filesystem.relativePath(Instance.worktree, p))
          const summary = `${fileChanges.length} files changed`

          return {
            title: summary,
            metadata: { diff: totalDiff },
            output: `Patch applied successfully. ${summary}:\n${relativePaths.map((p: string) => `  ${p}`).join("\n")}`,
          }
        })()
  },
})

