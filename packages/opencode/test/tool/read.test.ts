import { describe, expect, test, mock, beforeEach } from "bun:test"
import { ReadTool } from "../../src/tool/read"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { InstructionPrompt } from "../../src/session/instruction"
import { LSP } from "../../src/lsp"
import * as fs from "fs/promises"
import * as path from "path"

mock.module("../../src/session/instruction", () => ({
  InstructionPrompt: {
    resolve: mock(() => Promise.resolve([])),
  },
}))

mock.module("../../src/lsp", () => ({
  LSP: {
    touchFile: mock(() => Promise.resolve()),
  },
}))

describe("ReadTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }

  test("reads a text file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.txt")
        await fs.writeFile(filePath, "line 1\nline 2\nline 3")

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("line 1")
        expect(result.output).toContain("line 2")
        expect(result.output).toContain("line 3")
        expect(result.output).toContain("(End of file - total 3 lines)")
        expect(result.metadata.truncated).toBe(false)
      },
    })
  })

  test("handles missing file with suggestions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "hello.txt"), "hello")
        await fs.writeFile(path.join(tmp.path, "world.txt"), "world")

        const tool = await ReadTool.init()
        try {
          await tool.execute({ filePath: path.join(tmp.path, "hell") }, ctx)
          expect.unreachable()
        } catch (e: any) {
          expect(e.message).toContain("File not found")
          expect(e.message).toContain("Did you mean one of these?")
          expect(e.message).toContain("hello.txt")
        }
      },
    })
  })

  test("reads image as base64", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.png")
        const content = Buffer.from("fake-png-data")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        // Mocking Bun.file type because it might not detect .png correctly in all environments
        // but Bun.file(path).type should work if the extension is present.
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toBe("Image read successfully")
        expect(result.attachments).toBeDefined()
        expect(result.attachments![0].mime).toBe("image/png")
        expect(result.attachments![0].url).toContain("data:image/png;base64,")
      },
    })
  })

  test("throws for binary files", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.bin")
        // A file with null bytes is considered binary
        await fs.writeFile(filePath, Buffer.from([0, 1, 2, 3, 0]))

        const tool = await ReadTool.init()
        expect(tool.execute({ filePath }, ctx)).rejects.toThrow(/Cannot read binary file/)
      },
    })
  })

  test("handles offset and limit", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "large.txt")
        const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath, offset: 2, limit: 3 }, ctx)

        expect(result.output).not.toContain("line 1")
        expect(result.output).not.toContain("line 2")
        expect(result.output).toContain("line 3")
        expect(result.output).toContain("line 4")
        expect(result.output).toContain("line 5")
        expect(result.output).not.toContain("line 6")
        expect(result.output).toContain("Use 'offset' parameter to read beyond line 5")
        expect(result.metadata.truncated).toBe(true)
      },
    })
  })

  test("truncates by bytes", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "huge_lines.txt")
        // MAX_BYTES is 50KB. We need to exceed it with many lines.
        const content = Array.from({ length: 1000 }, (_, i) => `line ${i.toString().padStart(50, "0")}`).join("\n")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.metadata.truncated).toBe(true)
        expect(result.output).toContain("Output truncated at 51200 bytes")
      },
    })
  })

  test("includes system reminders from instructions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.txt")
        await fs.writeFile(filePath, "content")

        const mockResolve = InstructionPrompt.resolve as any
        mockResolve.mockResolvedValueOnce([{ filepath: "hint.md", content: "Remember to do X" }])

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("<system-reminder>")
        expect(result.output).toContain("Remember to do X")
        expect(result.metadata.loaded).toContain("hint.md")
      },
    })
  })
})
