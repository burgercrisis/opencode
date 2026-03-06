// COMPREHENSIVE TEST-LEVEL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[test-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[test-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[test-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, mock, beforeEach, afterEach, vi, spyOn } from "bun:test"
import { WebSearchTool } from "../../src/tool/websearch"

describe("WebSearchTool", () => {
  let ctx: any

  // Mock fetch for all tests - this is appropriate for external API calls
  beforeEach(() => {
    ctx = {
      ask: mock().mockResolvedValue(undefined),
      abort: new AbortController().signal,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("has a name", async () => {
    expect(WebSearchTool.id).toBe("websearch")
  })

  it("defines parameters correctly", async () => {
    const tool = await WebSearchTool.init()
    expect(tool.parameters).toBeDefined()
    const schema = tool.parameters
    expect(schema.shape.query).toBeDefined()
    expect(schema.shape.numResults).toBeDefined()
    expect(schema.shape.livecrawl).toBeDefined()
    expect(schema.shape.type).toBeDefined()
    expect(schema.shape.contextMaxCharacters).toBeDefined()
  })

  it("executes a successful search with SSE response", async () => {
    const tool = await WebSearchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      text: mock().mockResolvedValue("data: " + JSON.stringify({
        jsonrpc: "2.0",
        result: {
          content: [{
            type: "text",
            text: "search result content"
          }]
        }
      }) + "\n")
    }

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any)

    const result = await tool.execute({ query: "test query" }, ctx)

    expect(ctx.ask).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mcp.exa.ai/mcp",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"query":"test query"')
      })
    )
    expect(result.output).toBe("search result content")
    expect(result.title).toBe("Web search: test query")

    fetchSpy.mockRestore()
  })

  it("returns no results found message when content is empty", async () => {
    const tool = await WebSearchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      text: mock().mockResolvedValue("data: " + JSON.stringify({
        jsonrpc: "2.0",
        result: {
          content: []
        }
      }) + "\n")
    }

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any)

    const result = await tool.execute({ query: "test query" }, ctx)

    expect(result.output).toBe("No search results found. Please try a different query.")
    
    fetchSpy.mockRestore()
  })

  it("handles search errors correctly", async () => {
    const tool = await WebSearchTool.init()
    const mockResponse = {
      ok: false,
      status: 500,
      text: mock().mockResolvedValue("Internal Server Error")
    }

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any)

    await expect(tool.execute({ query: "test query" }, ctx)).rejects.toThrow("Search error (500): Internal Server Error")

    fetchSpy.mockRestore()
  })

  it("handles timeout correctly", async () => {
    const tool = await WebSearchTool.init()
    
    const abortError = new Error("AbortError")
    abortError.name = "AbortError"

    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(abortError)

    await expect(tool.execute({ query: "test query" }, ctx)).rejects.toThrow("Search request timed out")

    fetchSpy.mockRestore()
  })

  it("passes through other errors", async () => {
    const tool = await WebSearchTool.init()
    const otherError = new Error("Other error")

    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(otherError)

    await expect(tool.execute({ query: "test query" }, ctx)).rejects.toThrow("Other error")

    fetchSpy.mockRestore()
  })

  it("uses provided parameters in search request", async () => {
    const tool = await WebSearchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      text: mock().mockResolvedValue("data: " + JSON.stringify({
        jsonrpc: "2.0",
        result: {
          content: [{ text: "content" }]
        }
      }) + "\n")
    }

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any)

    await tool.execute({
      query: "test query",
      numResults: 5,
      livecrawl: "preferred",
      type: "deep",
      contextMaxCharacters: 5000
    }, ctx)

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body))
    expect(body.params.arguments.numResults).toBe(5)
    expect(body.params.arguments.livecrawl).toBe("preferred")
    expect(body.params.arguments.type).toBe("deep")
    expect(body.params.arguments.contextMaxCharacters).toBe(5000)

    fetchSpy.mockRestore()
  })

  it("handles large content with real truncation", async () => {
    const tool = await WebSearchTool.init()
    // Create content larger than default truncation limit
    const largeContent = "x".repeat(100000)
    const mockResponse = {
      ok: true,
      status: 200,
      text: mock().mockResolvedValue("data: " + JSON.stringify({
        jsonrpc: "2.0",
        result: {
          content: [{
            type: "text",
            text: largeContent
          }]
        }
      }) + "\n")
    }

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any)

    const result = await tool.execute({ query: "test query" }, ctx)

    // The real truncation should handle large content
    expect(result.output.length).toBeLessThan(largeContent.length)
    
    fetchSpy.mockRestore()
  })
})
