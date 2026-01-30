import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import { Tool } from "./tool"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import { Instance } from "../project/instance"
import { Patch } from "../patch"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectory } from "./external-directory"
import { trimDiff } from "./edit"
import { LSP } from "../lsp"
import { Filesystem } from "../util/filesystem"
import DESCRIPTION from "./apply_patch.txt"
import { File } from "../file"

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made"),
})

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: PatchParams,
  async execute(params, ctx) {
    const _validateParams = !params.patchText ? (() => { throw new Error("patchText is required") })() : null

    const parsed = (() => {
      const result = Patch.safeParsePatch(params.patchText)
      return result.success ? result.data : (() => { throw new Error(`apply_patch verification failed: ${result.error.message}`) })()
    })()
    const hunks = parsed.hunks

    const _validateHunks = hunks.length === 0 ? (() => {
      const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      return normalized === "*** Begin Patch\n*** End Patch" 
        ? (() => { throw new Error("patch rejected: empty patch") })() 
        : (() => { throw new Error("apply_patch verification failed: no hunks found") })()
    })() : null

    const groupedHunks = hunks.reduce((acc, hunk) => {
      const existing = acc.get(hunk.path) || []
      return acc.set(hunk.path, [...existing, hunk])
    }, new Map<string, Patch.Hunk[]>())

    const fileChanges = await Array.from(groupedHunks.entries()).reduce(async (accPromise, [relPath, fileHunks]) => {
      const acc = await accPromise
      const filePath = path.resolve(Instance.directory, relPath)
      await assertExternalDirectory(ctx, filePath)

      const change = await (async () => {
        const first = fileHunks[0]
        const isAdd = first.type === "add"
        const isDelete = first.type === "delete"

        return isAdd
          ? (() => {
              const old = ""
              const content = first.contents.length === 0 || first.contents.endsWith("\n") ? first.contents : `${first.contents}\n`
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, content))
              const counts = diffLines(old, content).reduce(
                (cAcc, change) =>
                  change.added
                    ? { ...cAcc, additions: cAcc.additions + (change.count || 0) }
                    : change.removed
                    ? { ...cAcc, deletions: cAcc.deletions + (change.count || 0) }
                    : cAcc,
                { additions: 0, deletions: 0 },
              )

              return {
                filePath,
                oldContent: old,
                newContent: content,
                type: "add" as const,
                diff,
                additions: counts.additions,
                deletions: counts.deletions,
              }
            })()
          : isDelete
          ? (async () => {
              const old = await Bun.file(filePath).text()
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, ""))
              return {
                filePath,
                oldContent: old,
                newContent: "",
                type: "delete" as const,
                diff,
                additions: 0,
                deletions: old.split("\n").length,
              }
            })()
          : (async () => {
              const file = Bun.file(filePath)
              const _exists = !(await file.exists()) ? (() => { throw new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`) })() : true

              const old = await file.text()
              const update = await fileHunks.reduce(async (contentPromise, hunk) => {
                const currentContent = await contentPromise
                return hunk.type === "update"
                  ? Patch.deriveNewContentsFromChunks(filePath, hunk.chunks, currentContent).then((res) => res.content)
                  : currentContent
              }, Promise.resolve(old)).catch((e) => {
                throw new Error(`apply_patch verification failed: ${(e as Error).message}`)
              })

              const content = update
              const diff = trimDiff(createTwoFilesPatch(filePath, filePath, old, content))
              const counts = diffLines(old, content).reduce(
                (cAcc, change) =>
                  change.added
                    ? { ...cAcc, additions: cAcc.additions + (change.count || 0) }
                    : change.removed
                    ? { ...cAcc, deletions: cAcc.deletions + (change.count || 0) }
                    : cAcc,
                { additions: 0, deletions: 0 },
              )

              const lastUpdate = [...fileHunks].reverse().find(h => h.type === "update" && h.move_path) as Extract<Patch.Hunk, { type: "update" }> | undefined
              const move = lastUpdate?.move_path ? path.resolve(Instance.directory, lastUpdate.move_path) : undefined
              const _moveAsk = move ? await assertExternalDirectory(ctx, move) : null

              return {
                filePath,
                oldContent: old,
                newContent: content,
                type: (move ? "move" : "update") as const,
                movePath: move,
                diff,
                additions: counts.additions,
                deletions: counts.deletions,
              }
            })()
      })()

      return [...acc, change]
    }, Promise.resolve([] as any[]))

    const diffs = fileChanges.map((c) => c.diff).join("\n")
    const files = fileChanges.map((c) => ({
      filePath: c.filePath,
      relativePath: path.relative(Instance.worktree, c.movePath ?? c.filePath).replaceAll(path.sep, "/"),
      type: c.type,
      diff: c.diff,
      before: c.oldContent,
      after: c.newContent,
      additions: c.additions,
      deletions: c.deletions,
      movePath: c.movePath,
    }))

    const relatives = fileChanges.map((c) => path.relative(Instance.worktree, c.filePath).replaceAll(path.sep, "/"))
    await ctx.ask({
      permission: "edit",
      patterns: relatives,
      always: ["*"],
      metadata: {
        filepath: relatives.join(", "),
        diff: diffs,
        files,
      },
    })

    const updates: Array<{ file: string; event: "add" | "change" | "unlink" }> = []

    for (const change of fileChanges) {
      const edited = change.type === "delete" ? undefined : (change.movePath ?? change.filePath)
      switch (change.type) {
        case "add":
          await fs.mkdir(path.dirname(change.filePath), { recursive: true })
          await fs.writeFile(change.filePath, change.newContent, "utf-8")
          updates.push({ file: change.filePath, event: "add" })
          break

        case "update":
          await fs.writeFile(change.filePath, change.newContent, "utf-8")
          updates.push({ file: change.filePath, event: "change" })
          break

        case "move":
          if (change.movePath) {
            await fs.mkdir(path.dirname(change.movePath), { recursive: true })
            await fs.writeFile(change.movePath, change.newContent, "utf-8")
            await fs.unlink(change.filePath)
            updates.push({ file: change.filePath, event: "unlink" })
            updates.push({ file: change.movePath, event: "add" })
          }
          break

        case "delete":
          await fs.unlink(change.filePath)
          updates.push({ file: change.filePath, event: "unlink" })
          break
      }

      if (edited) {
        await Bus.publish(File.Event.Edited, {
          file: edited,
        })
      }
    }

    for (const update of updates) {
      await Bus.publish(FileWatcher.Event.Updated, update)
    }

    for (const change of fileChanges) {
      if (change.type === "delete") continue
      const target = change.movePath ?? change.filePath
      await LSP.touchFile(target, true)
    }

    const diagnostics = await LSP.diagnostics()
    const summaryLines = fileChanges.map((change) => {
      if (change.type === "add") {
        return `A ${path.relative(Instance.worktree, change.filePath)}`
      }
      if (change.type === "delete") {
        return `D ${path.relative(Instance.worktree, change.filePath)}`
      }
      const target = change.movePath ?? change.filePath
      return `M ${path.relative(Instance.worktree, target)}`
    })
    let output = `Success. Updated the following files:\n${summaryLines.join("\n")}`

    const MAX_DIAGNOSTICS_PER_FILE = 20
    for (const change of fileChanges) {
      if (change.type === "delete") continue
      const target = change.movePath ?? change.filePath
      const normalized = Filesystem.normalizePath(target)
      const issues = diagnostics[normalized] ?? []
      const errors = issues.filter((item) => item.severity === 1)
      if (errors.length > 0) {
        const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
        const suffix =
          errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
        output += `\n\nLSP errors detected in ${path.relative(Instance.worktree, target)}, please fix:\n<diagnostics file="${target}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
      }
    }

    return {
      title: output,
      metadata: { diff: diffs, files, diagnostics },
      output,
    }
  },
})
