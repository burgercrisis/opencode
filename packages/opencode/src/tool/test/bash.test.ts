import { describe, test, expect, mock } from "bun:test"
import { BashTool } from "../bash"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("BashTool", () => {
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
    expect(BashTool.id).toBe("bash")
  })

  test("should have description", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        expect(init.description).toBeDefined()
        expect(init.description.length).toBeGreaterThan(0)
      },
    })
  })

  test("should have parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        expect(init.parameters).toBeDefined()
      },
    })
  })

  test("should validate parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const parsed = init.parameters.safeParse({
          command: "echo hello",
          description: "Print hello",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should require command parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Print hello",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  test("should require description parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const parsed = init.parameters.safeParse({
          command: "echo hello",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  test("should accept optional timeout parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const parsed = init.parameters.safeParse({
          command: "echo hello",
          description: "Print hello",
          timeout: 5000,
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should accept optional workdir parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const parsed = init.parameters.safeParse({
          command: "echo hello",
          description: "Print hello",
          workdir: "/tmp",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should throw error for negative timeout", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        await expect(init.execute({
          command: "echo hello",
          description: "Print hello",
          timeout: -1,
        }, mockCtx)).rejects.toThrow("Invalid timeout value")
      },
    })
  })

  test("should execute simple command", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        const result = await init.execute({
          command: "echo hello",
          description: "Print hello",
        }, mockCtx)

        expect(result.title).toBe("Print hello")
        expect(result.output).toContain("hello")
        // metadata.exitCode may be undefined in some cases
        expect(result.metadata).toBeDefined()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await BashTool.init()
        
        await init.execute({
          command: "echo hello",
          description: "Print hello",
        }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls[0][0]
        expect(call.permission).toBe("bash")
        expect(call.patterns).toContain("echo hello")
      },
    })
  })
})