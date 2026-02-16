import fs from "fs/promises"
import path from "path"
import { Global } from "../global"
import { Identifier } from "../id/id"
import { PermissionNext } from "../permission/next"
import type { Agent } from "../agent/agent"
import { Scheduler } from "../scheduler"
import { Log } from "../util/log"

export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  export const GLOB = path.join(DIR, "*")
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
  const HOUR_MS = 60 * 60 * 1000

  export type Result = { content: string; truncated: false } | { content: string; truncated: true; outputPath?: string }

  export interface Options {
    maxLines?: number
    maxBytes?: number
    direction?: "head" | "tail"
  }

  export function init() {
    Scheduler.register({
      id: "tool.truncation.cleanup",
      interval: HOUR_MS,
      run: cleanup,
      scope: "global",
    })
  }

  export async function cleanup() {
    const cutoff = Identifier.timestamp(Identifier.create("tool", false, Date.now() - RETENTION_MS))
    const glob = new Bun.Glob("tool_*")

    try {
      // Ensure directory exists before scanning
      await fs.mkdir(DIR, { recursive: true }).catch(() => { })

      const entries = await Array.fromAsync(glob.scan({ cwd: DIR, onlyFiles: true })).catch(() => [] as string[])

      // Process deletions in parallel with error handling for each
      await Promise.allSettled(
        entries.map(async (entry) => {
          try {
            if (Identifier.timestamp(entry) < cutoff) {
              await fs.unlink(path.join(DIR, entry))
            }
          } catch (unlinkError) {
            Log.Default.warn("Failed to delete old truncation file", { entry, error: unlinkError })
          }
        })
      )
    } catch (cleanupError) {
      Log.Default.error("Truncation cleanup failed", { error: cleanupError })
    }
  }

  const hasTaskTool = (agent?: Agent.Info): boolean =>
    agent?.permission ? PermissionNext.evaluate("task", "*", agent.permission).action !== "deny" : false

  export async function output(text: string, options: Options = {}, agent?: Agent.Info): Promise<Result> {
    const maxLines = options.maxLines ?? MAX_LINES
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const direction = options.direction ?? "head"
    const lines = text.split("\n")
    const totalBytes = Buffer.byteLength(text, "utf-8")

    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return { content: text, truncated: false }
    }

    // Iterative processing to avoid recursion limits and stack overflow
    const processIterative = (
      items: string[],
      direction: "head" | "tail",
    ): { out: string[]; bytes: number; hitBytes: boolean } => {
      const out: string[] = []
      let bytes = 0
      let hitBytes = false

      const processItems = direction === "head" ? items : [...items].reverse()

      for (const item of processItems) {
        if (out.length >= maxLines) break

        const size = Buffer.byteLength(item, "utf-8") + (out.length > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }

        if (direction === "head") {
          out.push(item)
        } else {
          out.unshift(item)
        }
        bytes += size
      }

      return { out, bytes, hitBytes }
    }

    const { out, bytes, hitBytes } = processIterative(lines, direction)
    const id = Identifier.ascending("tool")
    const filepath = path.join(DIR, id)
    const normalizedText = text.replace(/\r\n/g, '\n')

    // Ensure directory exists before writing
    try {
      await fs.mkdir(DIR, { recursive: true })
    } catch (mkdirError) {
      Log.Default.warn("Failed to create truncation directory", { DIR, error: mkdirError })
    }

    // Handle potential write errors (disk full, permissions, etc.)
    try {
      await Bun.write(Bun.file(filepath), normalizedText)
    } catch (writeError) {
      Log.Default.error("Failed to write truncated output to file", { filepath, error: writeError })
      // Return truncated content without file reference if write fails
      const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
      const unit = hitBytes ? "bytes" : "lines"
      const preview = out.join("\n")
      return {
        content: direction === "head"
          ? `${preview}\n\n...${removed} ${unit} truncated (file write failed)...`
          : `...${removed} ${unit} truncated (file write failed)...\n\n${preview}`,
        truncated: true,
        outputPath: undefined,
      }
    }

    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
    const unit = hitBytes ? "bytes" : "lines"
    const preview = out.join("\n")
    const hint = hasTaskTool(agent)
      ? `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
      : `The tool call succeeded but the output was truncated. Full output saved to: ${filepath}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`

    return {
      content: direction === "head"
        ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
        : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`,
      truncated: true,
      outputPath: filepath,
    }
  }
}
