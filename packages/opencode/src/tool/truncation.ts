import fs from "fs/promises"
import path from "path"
import { Global } from "../global"
import { Identifier } from "../id/id"
import { PermissionNext } from "../permission/next"
import type { Agent } from "../agent/agent"
import { Scheduler } from "../scheduler"

export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  export const GLOB = path.join(DIR, "*")
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
  const HOUR_MS = 60 * 60 * 1000

  export type Result = { content: string; truncated: false } | { content: string; truncated: true; outputPath: string }

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
    const entries = await Array.fromAsync(glob.scan({ cwd: DIR, onlyFiles: true })).catch(() => [] as string[])
    await entries.reduce(async (acc, entry) => {
      await acc
      return Identifier.timestamp(entry) < cutoff
        ? fs.unlink(path.join(DIR, entry)).catch(() => {})
        : Promise.resolve()
    }, Promise.resolve())
  }

  const hasTaskTool = (agent?: Agent.Info): boolean =>
    agent?.permission ? PermissionNext.evaluate("task", "*", agent.permission).action !== "deny" : false

  export async function output(text: string, options: Options = {}, agent?: Agent.Info): Promise<Result> {
    const maxLines = options.maxLines ?? MAX_LINES
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const direction = options.direction ?? "head"
    const lines = text.split("\n")
    const totalBytes = Buffer.byteLength(text, "utf-8")

    return (lines.length <= maxLines && totalBytes <= maxBytes)
      ? { content: text, truncated: false }
      : (async () => {
          const process = (
            items: string[],
            acc: string[],
            bytes: number,
          ): { out: string[]; bytes: number; hitBytes: boolean } => {
            const item = items[0]
            return item === undefined || acc.length >= maxLines
              ? { out: acc, bytes, hitBytes: false }
              : (() => {
                  const size = Buffer.byteLength(item, "utf-8") + (acc.length > 0 ? 1 : 0)
                  return bytes + size > maxBytes
                    ? { out: acc, bytes, hitBytes: true }
                    : process(
                        items.slice(1),
                        direction === "head" ? [...acc, item] : [item, ...acc],
                        bytes + size,
                      )
                })()
          }

          const { out, bytes, hitBytes } = process(direction === "head" ? lines : [...lines].reverse(), [], 0)
          const id = Identifier.ascending("tool")
          const filepath = path.join(DIR, id)
          const normalizedText = text.replace(/\r\n/g, '\n')
          await Bun.write(Bun.file(filepath), normalizedText)

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
        })()
  }
}
