import { describe, test, expect, mock } from "bun:test"
import { WriteTool } from "../write"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"
import * as fs from "fs/promises"

describe("WriteTool", () => {
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
    expect(WriteTool.id).toBe("write")
  })

  test("should have description", async () => {
    const init = await WriteTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await WriteTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should require filePath parameter", async () => {
    const init = await WriteTool.init()
    
    const parsed = init.parameters.safeParse({
      content: "test content",
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should write to a new file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await WriteTool.init()
        
        const result = await init.execute({
          filePath: "newfile.txt",
          content: "Hello, World!",
        }, mockCtx)

        expect(result.title).toBeDefined()
        
        const content = await fs.readFile(path.join(tmp.path, "newfile.txt"), "utf-8")
        expect(content).toBe("Hello, World!")
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await WriteTool.init()
        
        await init.execute({
          filePath: "test.txt",
          content: "content",
        }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls.at(-1)[0]
        expect(call.permission).toBe("edit")
      },
    })
  })

  test("should create parent directories if needed", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await WriteTool.init()
        
        const result = await init.execute({
          filePath: "subdir/nested/file.txt",
          content: "nested content",
        }, mockCtx)

        expect(result.title).toBeDefined()
        
        const content = await fs.readFile(path.join(tmp.path, "subdir", "nested", "file.txt"), "utf-8")
        expect(content).toBe("nested content")
      },
    })
  })
})