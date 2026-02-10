import { describe, expect, test } from "bun:test"
import { Tool } from "../../src/tool/tool"
import { z } from "zod"

describe("Tool", () => {
  test("validation error with default message", async () => {
    const tool = Tool.define("test-tool", {
      description: "test tool",
      parameters: z.object({
        count: z.number(),
      }),
      execute: async () => ({
        title: "Test",
        metadata: {},
        output: "ok",
      }),
    })

    const info = await tool.init()
    const ctx: Tool.Context = {
      sessionID: "session",
      messageID: "message",
      agent: "agent",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => {},
      ask: async () => {},
    }

    expect(info.execute({ count: "invalid" } as any, ctx)).rejects.toThrow(
      /The test-tool tool was called with invalid arguments/,
    )
  })

  test("validation error with custom formatter", async () => {
    const tool = Tool.define("test-tool", {
      description: "test tool",
      parameters: z.object({
        count: z.number(),
      }),
      formatValidationError: (error) => `CUSTOM ERROR: ${error.message}`,
      execute: async () => ({
        title: "Test",
        metadata: {},
        output: "ok",
      }),
    })

    const info = await tool.init()
    const ctx: Tool.Context = {
      sessionID: "session",
      messageID: "message",
      agent: "agent",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => {},
      ask: async () => {},
    }

    expect(info.execute({ count: "invalid" } as any, ctx)).rejects.toThrow(/CUSTOM ERROR:[\s\S]*expected number, received string/i)
  })

  test("output truncation", async () => {
    const tool = Tool.define("test-tool", {
      description: "test tool",
      parameters: z.object({}),
      execute: async () => ({
        title: "Test",
        metadata: {},
        output: "A".repeat(100000), // Large output
      }),
    })

    const info = await tool.init()
    const ctx: Tool.Context = {
      sessionID: "session",
      messageID: "message",
      agent: "agent",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => {},
      ask: async () => {},
    }

    const result = await info.execute({}, ctx)
    expect(result.metadata.truncated).toBe(true)
    expect(result.output.length).toBeLessThan(100000)
    expect(result.metadata.outputPath).toBeDefined()
  })

  test("skips truncation if already truncated", async () => {
    const tool = Tool.define("test-tool", {
      description: "test tool",
      parameters: z.object({}),
      execute: async () => ({
        title: "Test",
        metadata: { truncated: true },
        output: "already truncated",
      }),
    })

    const info = await tool.init()
    const ctx: Tool.Context = {
      sessionID: "session",
      messageID: "message",
      agent: "agent",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => {},
      ask: async () => {},
    }

    const result = await info.execute({}, ctx)
    expect(result.output).toBe("already truncated")
    expect(result.metadata.truncated).toBe(true)
  })

  test("init with function context", async () => {
    const tool = Tool.define("test-tool", async (initCtx) => ({
      description: `test tool for ${initCtx?.agent?.name ?? "unknown"}`,
      parameters: z.object({}),
      execute: async () => ({
        title: "Test",
        metadata: {},
        output: "ok",
      }),
    }))

    const info = await tool.init({ agent: { name: "test-agent" } as any })
    expect(info.description).toBe("test tool for test-agent")
  })
})
