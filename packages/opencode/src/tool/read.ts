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
import { InstructionPrompt } from "../session/instruction"
import DESCRIPTION from "./read.txt"
import { TOOL } from "../constants"

const parameters = z.object({
  filePath: z.string().describe("The absolute path to the file or directory to read"),
  offset: z.coerce.number().describe("The line number to start reading from (1-indexed)").optional(),
  limit: z.coerce.number().describe("The maximum number of lines to read (defaults to 2000)").optional(),
})

export const ReadTool = Tool.define<typeof parameters, { preview: string; truncated: boolean; loaded: string[] }>("read", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    if (params.offset !== undefined && params.offset < 1) {
      throw new Error("offset must be greater than or equal to 1")
    }
    const filepath = Filesystem.resolvePath(params.filePath)
    const title = Filesystem.relativePath(Instance.worktree, filepath)

    const file = Bun.file(filepath)
    const stat = await file.stat().catch(() => undefined)

    await assertExternalDirectory(ctx, filepath, {
      bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
      kind: stat?.isDirectory() ? "directory" : "file",
    })

    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })

    if (!stat) {
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
    }

    if (stat.isDirectory()) {
      const dirents = await fs.readdir(filepath, { withFileTypes: true })
      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          if (dirent.isDirectory()) return dirent.name + "/"
          if (dirent.isSymbolicLink()) {
            const target = await fs.stat(path.join(filepath, dirent.name)).catch(() => undefined)
            if (target?.isDirectory()) return dirent.name + "/"
          }
          return dirent.name
        }),
      )
      entries.sort((a, b) => a.localeCompare(b))

      const limit = params.limit ?? TOOL.DEFAULT_READ_LIMIT
      const offset = params.offset ?? 1
      const start = offset - 1
      const sliced = entries.slice(start, start + limit)
      const truncated = start + sliced.length < entries.length

      const output = [
        `<path>${filepath}</path>`,
        `<type>directory</type>`,
        `<entries>`,
        sliced.join("\n"),
        truncated
          ? `\n(Showing ${sliced.length} of ${entries.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
          : `\n(${entries.length} entries)`,
        `</entries>`,
      ].join("\n")

      return {
        title,
        output,
        metadata: {
          preview: sliced.slice(0, 20).join("\n"),
          truncated,
          loaded: [] as string[],
        },
      }
    }

    const instructions = await InstructionPrompt.resolve(ctx.messages, filepath, ctx.messageID)

    // Exclude SVG (XML-based) and vnd.fastbidsheet (.fbs extension, commonly FlatBuffers schema files)
    const isImage =
      file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/vnd.fastbidsheet"
    const isPdf = file.type === "application/pdf"

    if (isImage || isPdf) {
      const mime = file.type
      const msg = `${isImage ? "Image" : "PDF"} read successfully`
      return {
        title,
        output: msg,
        metadata: {
          preview: msg,
          truncated: false,
          loaded: instructions.map((i) => i.filepath),
        },
        attachments: [
          {
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "file",
            mime,
            url: `data:${mime};base64,${Buffer.from(await file.bytes()).toString("base64")}`,
          },
        ],
      }
    }

    const isBinary = await Filesystem.isBinaryFile(filepath)
    if (isBinary) throw new Error(`Cannot read binary file: ${filepath}`)

    const text = await file.text()
    const lines = text.split(/\r?\n/)
    const limit = params.limit ?? TOOL.DEFAULT_READ_LIMIT
    const offset = params.offset ?? 1
    const start = offset - 1
    if (start >= lines.length) throw new Error(`Offset ${offset} is out of range for this file (${lines.length} lines)`)

    const raw: string[] = []
    let bytes = 0
    let truncatedByBytes = false
    for (let i = start; i < Math.min(lines.length, start + limit); i++) {
      const line = lines[i].length > 2000 ? lines[i].substring(0, 2000) + "..." : lines[i]
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
      if (bytes + size > TOOL.MAX_BYTES) {
        truncatedByBytes = true
        break
      }
      raw.push(line)
      bytes += size
    }

    const content = raw.map((line, index) => {
      return `${index + offset}: ${line}`
    })
    const preview = raw.slice(0, 20).join("\n")

    let output = [`<path>${filepath}</path>`, `<type>file</type>`, "<content>"].join("\n")
    output += content.join("\n")

    const totalLines = lines.length
    const lastReadLine = offset + raw.length - 1
    const hasMoreLines = totalLines > lastReadLine
    const truncated = hasMoreLines || truncatedByBytes

    if (truncatedByBytes) {
      output += `\n\n(Output truncated at ${TOOL.MAX_BYTES} bytes. Use 'offset' parameter to read beyond line ${lastReadLine})`
    } else if (hasMoreLines) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`
    } else {
      output += `\n\n(End of file - total ${lines.length} lines)`
    }
    output += "\n</content>"

    // just warms the lsp client
    await LSP.touchFile(filepath, false)
    FileTime.read(ctx.sessionID, filepath)

    if (instructions.length > 0) {
      output += `\n\n<system-reminder>\n${instructions.map((i) => i.content).join("\n\n")}\n</system-reminder>`
    }

    return {
      title,
      output,
      metadata: {
        preview,
        truncated,
        loaded: instructions.map((i) => i.filepath),
      },
    }
  },
})

