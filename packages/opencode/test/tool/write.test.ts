import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { WriteTool } from "../../src/tool/write"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { LSP } from "../../src/lsp"
import { Bus } from "../../src/bus"
import { FileTime } from "../../src/file/time"
import * as fs from "fs/promises"
import * as path from "path"

describe("WriteTool", () => {
  let mocks: {
    lspTouch: any
    lspDiagnostics: any
    busPublish: any
    fileTimeAssert: any
    fileTimeRead: any
  }

  beforeEach(() => {
    mocks = {
      lspTouch: vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined),
      lspDiagnostics: vi.spyOn(LSP, "diagnostics").mockResolvedValue({}),
      busPublish: vi.spyOn(Bus, "publish").mockResolvedValue(undefined),
      fileTimeAssert: vi.spyOn(FileTime, "assert").mockResolvedValue(undefined),
      fileTimeRead: vi.spyOn(FileTime, "read").mockReturnValue(undefined),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }

  test("writes a new file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "new.txt")
        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "hello world" }, ctx)

        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("hello world")
        expect(result.metadata.exists).toBe(false)
      },
    })
  })

  test("overwrites an existing file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "existing.txt")
        await fs.writeFile(filePath, "old content")

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "new content" }, ctx)

        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("new content")
        expect(result.metadata.exists).toBe(true)
        expect(mocks.fileTimeAssert).toHaveBeenCalled()
      },
    })
  })

  test("shows LSP diagnostics for the current file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "error.ts")
        mocks.lspDiagnostics.mockResolvedValueOnce({
          [filePath]: [
            {
              severity: 1,
              message: "Syntax error",
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            },
          ],
        })

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "bad code" }, ctx)

        expect(result.output).toContain("LSP errors detected in this file")
        expect(result.output).toContain("Syntax error")
      },
    })
  })

  test("shows LSP diagnostics for other files", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "main.ts")
        const otherPath = path.join(tmp.path, "other.ts")
        mocks.lspDiagnostics.mockResolvedValueOnce({
          [otherPath]: [
            {
              severity: 1,
              message: "Other error",
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            },
          ],
        })

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "good code" }, ctx)

        expect(result.output).toContain("LSP errors detected in other files")
        expect(result.output).toContain("Other error")
      },
    })
  })

  test("limits the number of diagnostics shown", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "many-errors.ts")
        const diagnostics = Array.from({ length: 25 }, (_, i) => ({
          severity: 1,
          message: `Error ${i}`,
          range: { start: { line: i, character: 0 }, end: { line: i, character: 10 } },
        }))
        mocks.lspDiagnostics.mockResolvedValueOnce({
          [filePath]: diagnostics,
        })

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "bad code" }, ctx)

        expect(result.output).toContain("and 5 more")
      },
    })
  })
})
