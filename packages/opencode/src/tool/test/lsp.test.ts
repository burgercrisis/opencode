import { describe, test, expect, mock } from "bun:test"
import { LspTool } from "../lsp"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("LspTool", () => {
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
    expect(LspTool.id).toBe("lsp")
  })

  test("should have description", async () => {
    const init = await LspTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await LspTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should throw error for non-existent file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await LspTool.init()
        
        await expect(init.execute({ filePath: "nonexistent.ts" }, mockCtx)).rejects.toThrow()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "const x = 1")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await LspTool.init()
        
        await init.execute({ 
          filePath: "test.ts",
          operation: "hover",
          line: 1,
          character: 1,
        }, mockCtx)

        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })
})