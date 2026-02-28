import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { BatchTool } from "../batch"

describe("BatchTool", () => {
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
    expect(BatchTool.id).toBe("batch")
  })

  test("should have description", async () => {
    const init = await BatchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await BatchTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should validate parameters schema", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo", parameters: { text: "hello" } },
      ],
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should require tool_calls parameter", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  test("should require at least one tool call", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [],
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should validate tool_calls is an array", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: "not an array",
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should validate each tool call has tool name", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { parameters: { text: "hello" } },
      ],
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should validate each tool call has parameters", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo" },
      ],
    })
    
    expect(parsed.success).toBe(false)
  })

  test("should accept multiple tool calls", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo", parameters: { text: "hello" } },
        { tool: "pwd", parameters: {} },
      ],
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should have formatValidationError function", async () => {
    const init = await BatchTool.init()
    expect(init.formatValidationError).toBeDefined()
  })

  test("should format validation errors", async () => {
    const init = await BatchTool.init()
    
    // Create a mock ZodError
    const mockError = {
      issues: [
        { path: ["tool_calls", 0, "tool"], message: "Required" },
      ],
    }
    
    const formatted = init.formatValidationError!(mockError as any)
    expect(formatted).toContain("Invalid parameters")
    expect(formatted).toContain("tool_calls.0.tool")
    expect(formatted).toContain("Required")
  })
})