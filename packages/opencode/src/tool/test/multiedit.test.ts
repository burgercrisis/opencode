import { describe, test, expect, mock, beforeEach } from "bun:test"
import { MultiEditTool } from "../multiedit"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"
import { FileTime } from "../../file/time"

describe("MultiEditTool", () => {
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
    expect(MultiEditTool.id).toBe("multiedit")
  })

  test("should have description", async () => {
    const init = await MultiEditTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await MultiEditTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should return early for empty edits array", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        const result = await init.execute({ filePath: path.join(tmp.path, "test.ts"), edits: [] }, mockCtx)

        expect(result.title).toBeDefined()
      },
    })
  })

  test("should throw error for empty oldString", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "", newString: "test" }],
        }, mockCtx)).rejects.toThrow("non-empty oldString")
      },
    })
  })

  test("should throw error for empty newString", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "" }],
        }, mockCtx)).rejects.toThrow("non-empty newString")
      },
    })
  })

  test("should throw error for null bytes in oldString", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test\0", newString: "test" }],
        }, mockCtx)).rejects.toThrow("null bytes")
      },
    })
  })

  test("should throw error for null bytes in newString", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "test\0" }],
        }, mockCtx)).rejects.toThrow("null bytes")
      },
    })
  })

  test("should throw error for invalid occurrence", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "test2", occurrence: 0 }],
        }, mockCtx)).rejects.toThrow("positive integer")
      },
    })
  })

  test("should throw error for invalid confidence", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "test2", confidence: 1.5 }],
        }, mockCtx)).rejects.toThrow("between 0 and 1")
      },
    })
  })

  test("should throw error for confidence below 0", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "test2", confidence: -0.5 }],
        }, mockCtx)).rejects.toThrow("between 0 and 1")
      },
    })
  })

  test("should throw error for non-existent file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await MultiEditTool.init()
        
        await expect(init.execute({
          filePath: path.join(tmp.path, "nonexistent", "test.ts"),
          edits: [{ oldString: "test", newString: "test2" }],
        }, mockCtx)).rejects.toThrow()
      },
    })
  })

  test("should handle no-op edit (oldString === newString)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "test content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Mark file as read before attempting edit
        FileTime.read(mockCtx.sessionID, path.join(tmp.path, "test.ts"))
        
        const init = await MultiEditTool.init()
        const result = await init.execute({
          filePath: path.join(tmp.path, "test.ts"),
          edits: [{ oldString: "test", newString: "test" }],
        }, mockCtx)

        expect(result.title).toBeDefined()
      },
    })
  })

  test("should validate parameters schema", async () => {
    const init = await MultiEditTool.init()
    
    const validParams = {
      filePath: "test.ts",
      edits: [
        { oldString: "old", newString: "new" },
        { oldString: "old2", newString: "new2", replaceAll: true },
      ],
    }

    const parsed = init.parameters.safeParse(validParams)
    expect(parsed.success).toBe(true)
  })

  test("should accept optional parameters", async () => {
    const init = await MultiEditTool.init()
    
    const params = {
      filePath: "test.ts",
      edits: [{
        oldString: "old",
        newString: "new",
        replaceAll: true,
        occurrence: 1,
        autoContext: false,
        confidence: 0.9,
      }],
    }

    const parsed = init.parameters.safeParse(params)
    expect(parsed.success).toBe(true)
  })
})
