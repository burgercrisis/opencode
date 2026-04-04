import { describe, test, expect, mock } from "bun:test"
import { InvalidTool } from "../invalid"

describe("InvalidTool", () => {
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
    expect(InvalidTool.id).toBe("invalid")
  })

  test("should have description", async () => {
    const init = await InvalidTool.init()
    expect(init.description).toBeDefined()
  })

  test("should have parameters schema", async () => {
    const init = await InvalidTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should require tool parameter", async () => {
    const init = await InvalidTool.init()
    const parsed = init.parameters.safeParse({ error: "some error" })
    expect(parsed.success).toBe(false)
  })

  test("should require error parameter", async () => {
    const init = await InvalidTool.init()
    const parsed = init.parameters.safeParse({ tool: "some-tool" })
    expect(parsed.success).toBe(false)
  })

  test("should accept valid parameters", async () => {
    const init = await InvalidTool.init()
    const parsed = init.parameters.safeParse({ tool: "some-tool", error: "some error" })
    expect(parsed.success).toBe(true)
  })

  test("should execute and return error message", async () => {
    const init = await InvalidTool.init()
    const result = await init.execute({ tool: "test-tool", error: "Invalid arguments" }, mockCtx)
    
    expect(result.title).toBe("Invalid Tool")
    expect(result.output).toContain("Invalid arguments")
  })
})
