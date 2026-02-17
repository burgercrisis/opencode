import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { WriteTool } from "../../src/tool/write"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { LSP } from "../../src/lsp"
import { Bus } from "../../src/bus"
import { FileTime } from "../../src/file/time"
import * as fs from "fs/promises"
import * as path from "path"

describe("WriteTool Enhanced Features", () => {
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
      busPublish: vi.spyOn(Bus, "publish").mockResolvedValue([]),
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
    metadata: vi.fn(),
    ask: vi.fn().mockResolvedValue(true),
  }

  test("rejects content larger than 10MB", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "large.txt")
        const largeContent = "x".repeat(11 * 1024 * 1024) // 11MB

        const tool = await WriteTool.init()

        await expect(
          tool.execute({ filePath, content: largeContent }, ctx)
        ).rejects.toThrow("Too big: expected string to have <=10485760 characters")
      },
    })
  })

  test("accepts content within 10MB limit", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "acceptable.txt")
        const content = "x".repeat(5 * 1024 * 1024) // 5MB

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content }, ctx)

        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe(content)
      },
    })
  })

  test("creates parent directories if they don't exist", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "nested", "deep", "file.txt")
        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "content" }, ctx)

        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("content")

        // Verify directories were created
        const stats = await fs.stat(path.join(tmp.path, "nested", "deep"))
        expect(stats.isDirectory()).toBe(true)
      },
    })
  })

  test("handles LSP timeout gracefully", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "timeout.txt")

        // Mock LSP to never resolve
        mocks.lspTouch.mockImplementation(() => new Promise(() => { }))

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "content" }, ctx)

        // Should still succeed despite LSP timeout
        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("content")
      },
    })
  })

  test("handles LSP errors gracefully", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "error.txt")

        // Mock LSP to throw an error
        mocks.lspTouch.mockRejectedValue(new Error("LSP server crashed"))

        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "content" }, ctx)

        // Should still succeed despite LSP error
        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("content")
      },
    })
  })

  test("provides enhanced error messages for permission errors", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "readonly.txt")

        // Create file and make it read-only
        await fs.writeFile(filePath, "existing")
        await fs.chmod(filePath, 0o444)

        const tool = await WriteTool.init()

        const error = await tool.execute({ filePath, content: "new content" }, ctx).catch(e => e)
        expect(error.message).toContain("Failed to write file")
        expect(error.message).toContain("EPERM")
      },
    })
  })

  test("performs atomic write operations", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "atomic.txt")

        // Create initial file
        await fs.writeFile(filePath, "original")

        const tool = await WriteTool.init()
        await tool.execute({ filePath, content: "updated" }, ctx)

        // Final content should be complete, not partial
        const finalContent = await fs.readFile(filePath, "utf-8")
        expect(finalContent).toBe("updated")
      },
    })
  })

  test("uses file locking to prevent race conditions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "locked.txt")

        // Track lock acquisition
        const withLockSpy = vi.spyOn(FileTime, 'withLock')

        const tool = await WriteTool.init()
        await tool.execute({ filePath, content: "content" }, ctx)

        // Verify withLock was called
        expect(withLockSpy).toHaveBeenCalledWith(filePath, expect.any(Function))

        vi.restoreAllMocks()
      },
    })
  })

  test("validates path traversal prevention", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WriteTool.init()

        // Should reject relative paths with parent directory references
        await expect(
          tool.execute({ filePath: "../outside.txt", content: "content" }, ctx)
        ).rejects.toThrow("Path must be absolute or not contain parent directory references")
      },
    })
  })

  test("allows absolute paths with parent directory references", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // This should be allowed since it's an absolute path
        const filePath = path.join(tmp.path, "subdir", "..", "allowed.txt")
        const tool = await WriteTool.init()
        const result = await tool.execute({ filePath, content: "content" }, ctx)

        expect(result.output).toContain("Wrote file successfully.")
        expect(await fs.readFile(filePath, "utf-8")).toBe("content")
      },
    })
  })
})
