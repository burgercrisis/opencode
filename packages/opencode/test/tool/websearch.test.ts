import { describe, it, expect, mock, beforeEach, afterEach, vi, spyOn } from "bun:test"
import { WebSearchTool } from "../../src/tool/websearch"
import { Truncate } from "../../src/tool/truncation"

describe("WebSearchTool", () => {
  let ctx: any
  let truncateSpy: any

  beforeEach(() => {
    ctx = {
      ask: mock().mockResolvedValue(undefined),
      abort: new AbortController().signal,
    }
    truncateSpy = vi.spyOn(Truncate, "output").mockImplementation(async (content) => ({
      content,
      truncated: false
    }))
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

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.params.arguments.numResults).toBe(5)
    expect(body.params.arguments.livecrawl).toBe("preferred")
    expect(body.params.arguments.type).toBe("deep")
    expect(body.params.arguments.contextMaxCharacters).toBe(5000)

    fetchSpy.mockRestore()
  })
})
