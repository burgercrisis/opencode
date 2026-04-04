import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { WebFetchTool } from "../webfetch"

describe("WebFetchTool", () => {
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
    expect(WebFetchTool.id).toBe("webfetch")
  })

  test("should have description", async () => {
    const init = await WebFetchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await WebFetchTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should throw error for invalid URL", async () => {
    const init = await WebFetchTool.init()
    
    await expect(init.execute({
      url: "not-a-valid-url",
    }, mockCtx)).rejects.toThrow("URL must start with http:// or https://")
  })

  test("should throw error for ftp URL", async () => {
    const init = await WebFetchTool.init()
    
    await expect(init.execute({
      url: "ftp://example.com",
    }, mockCtx)).rejects.toThrow("URL must start with http:// or https://")
  })

  test("should validate parameters schema", async () => {
    const init = await WebFetchTool.init()
    
    const parsed = init.parameters.safeParse({
      url: "https://example.com",
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should require url parameter", async () => {
    const init = await WebFetchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  test("should accept optional format parameter", async () => {
    const init = await WebFetchTool.init()
    
    const parsed = init.parameters.safeParse({
      url: "https://example.com",
      format: "markdown",
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should accept optional timeout parameter", async () => {
    const init = await WebFetchTool.init()
    
    const parsed = init.parameters.safeParse({
      url: "https://example.com",
      timeout: 60,
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should accept valid format values", async () => {
    const init = await WebFetchTool.init()
    
    const formats = ["text", "markdown", "html"]
    
    for (const format of formats) {
      const parsed = init.parameters.safeParse({
        url: "https://example.com",
        format,
      })
      expect(parsed.success).toBe(true)
    }
  })

  test("should request permission", async () => {
    const init = await WebFetchTool.init()
    
    try {
      await init.execute({
        url: "https://example.com",
      }, mockCtx)
    } catch (e) {
      // May fail due to network, but permission should be requested
    }

    expect(mockCtx.ask).toHaveBeenCalled()
  })
})