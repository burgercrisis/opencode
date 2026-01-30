import z from "zod"
import * as fs from "fs/promises"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { assertExternalDirectory } from "./external-directory"
import { Identifier } from "../id/id"
import DESCRIPTION from "./read.txt"

const DEFAULT_READ_LIMIT = 2000
const MAX_BYTES = 50 * 1024

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional(),
    limit: z.coerce.number().describe("The number of lines to read (defaults to 2000)").optional(),
  }),
  async execute(params, ctx) {
    const filepath = Filesystem.resolvePath(params.filePath)
    const title = Filesystem.relativePath(Instance.worktree, filepath)

    await assertExternalDirectory(ctx, filepath, {
      bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
    })

    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })

    const file = Bun.file(filepath)
    const exists = await file.exists()

    !exists && await (async () => {
      const dir = path.dirname(filepath)
      const base = path.basename(filepath)

      const suggestions = await fs.readdir(dir)
        .then((entries) => entries.filter((entry) => entry.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(entry.toLowerCase())))
        .then((filtered) => filtered.map((entry) => path.join(dir, entry)))
        .then((mapped) => mapped.slice(0, 3))
        .catch(() => [])

      const error = suggestions.length > 0
        ? `File not found: ${filepath}\n\nDid you mean one of these?\n${suggestions.join("\n")}`
        : `File not found: ${filepath}`
      throw new Error(error)
    })()

    const isImage = file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/vnd.fastbidsheet"
    const isPdf = file.type === "application/pdf"

    return (isImage || isPdf)
      ? (async () => {
          const bytes = await file.bytes()
          return {
            title,
            output: `${isImage ? "Image" : "PDF"} read successfully`,
            metadata: {
              preview: `${isImage ? "Image" : "PDF"} read successfully`,
              truncated: false,
            },
            attachments: [
              {
                id: Identifier.ascending("part"),
                sessionID: ctx.sessionID,
                messageID: ctx.messageID,
                type: "file" as const,
                mime: file.type,
                url: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
              },
            ],
          }
        })()
      : (async () => {
          const isBinary = await Filesystem.isBinaryFile(filepath)
          if (isBinary) throw new Error(`Cannot read binary file: ${filepath}`)
          
          const text = await file.text()
          const lines = text.split(/\r?\n/)
          const limit = params.limit ?? DEFAULT_READ_LIMIT
          const offset = params.offset || 0
          const subset = lines.slice(offset, offset + limit)

          const processLines = (items: string[], acc: string[], bytes: number): { raw: string[]; bytes: number; truncated: boolean } => {
            const item = items[0]
            if (item === undefined) return { raw: acc, bytes, truncated: false }

            const line = item.length > 2000 ? item.substring(0, 2000) + "..." : item
            const size = Buffer.byteLength(line, "utf-8") + (acc.length > 0 ? 1 : 0)

            return (bytes + size > MAX_BYTES)
              ? { raw: acc, bytes, truncated: true }
              : processLines(items.slice(1), [...acc, line], bytes + size)
          }

          const result = processLines(subset, [], 0)
          const lastReadLine = offset + result.raw.length
          const hasMoreLines = lines.length > lastReadLine
          const truncated = hasMoreLines || result.truncated
          const output = `<file>\n${result.raw.map((line, i) => `${(offset + i + 1).toString().padStart(5, "0")}| ${line}`).join("\n")}${
            result.truncated
              ? `\n\n(Output truncated at ${MAX_BYTES} bytes. Use 'offset' parameter to read beyond line ${lastReadLine})`
              : hasMoreLines
                ? `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`
                : `\n\n(End of file - total ${lines.length} lines)`
          }\n</file>`

          await LSP.touchFile(filepath, false)
          FileTime.read(ctx.sessionID, filepath)

          return {
            title,
            output,
            metadata: {
              preview: result.raw.slice(0, 20).join("\n"),
              truncated,
            },
          }
        })()
  },
})

