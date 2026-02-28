import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { CodeSearchTool } from "../codesearch"

describe("CodeSearchTool", () => {
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
    expect(CodeSearchTool.id).toBe("codesearch")
  })

  test("should have description", async () => {
    const init = await CodeSearchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await CodeSearchTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should validate parameters schema", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React useState hook examples",
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should require query parameter", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  test("should accept optional tokensNum parameter", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 10000,
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should validate tokensNum minimum", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 500,
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should validate tokensNum maximum", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 60000,
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should request permission", async () => {
    const init = await CodeSearchTool.init()
    
    try {
      await init.execute({
        query: "React hooks",
      }, mockCtx)
    } catch (e) {
      // May fail due to network
    }

    expect(mockCtx.ask).toHaveBeenCalledWith({
      permission: "codesearch",
      patterns: ["React hooks"],
      always: ["*"],
      metadata: {
        query: "React hooks",
        tokensNum: 5000,
      },
    })
  })
})