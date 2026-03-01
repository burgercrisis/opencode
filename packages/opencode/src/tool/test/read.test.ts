import { describe, test, expect, mock } from "bun:test"
import { ReadTool } from "../read"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("ReadTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should define tool with correct id", () => {
    expect(ReadTool.id).toBe("read")
  })

  test("should have description", async () => {
    const init = await ReadTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await ReadTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should throw error for non-existent file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        
        await expect(init.execute({ filePath: "nonexistent.txt" }, mockCtx)).rejects.toThrow()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        await init.execute({ filePath: "test.txt" }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls.at(-1)[0]
        expect(call.permission).toBe("read")
      },
    })
  })

  test("should read existing file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "Hello, World!")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "test.txt" }, mockCtx)

        expect(result.title).toBeDefined()
        // The output contains the file content in a specific format
        expect(result.output).toBeDefined()
      },
    })
  })

  test("should read directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.txt"), "content2")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "." }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.output).toBeDefined()
      },
    })
  })

  test("should handle offset parameter", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Create a file with 5 lines - use actual newlines
        const lines = ["line1", "line2", "line3", "line4", "line5"].join("\n")
        await Bun.write(path.join(dir, "test.txt"), lines)
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        // Use absolute path since resolvePath uses cwd
        const result = await init.execute({ filePath: path.join(tmp.path, "test.txt"), offset: 2 }, mockCtx)

        expect(result.output).toBeDefined()
      },
    })
  })

  test("should handle limit parameter", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "line1\nline2\nline3\nline4\nline5")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "test.txt", limit: 2 }, mockCtx)

        expect(result.output).toBeDefined()
      },
    })
  })
})