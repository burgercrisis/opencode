import { expect, it, describe, mock, beforeEach } from "bun:test"
import { CodeSearchTool } from "../../src/tool/codesearch"

describe("CodeSearchTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      ask: mock().mockResolvedValue(true),
      abort: new AbortController().signal,
    }
    // Reset global fetch mock
    global.fetch = mock() as any
  })

  it("successfully searches code and parses SSE response", async () => {
    const mockResponseText = 'data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Search result content"}]}}\n'
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    })

    const tool = await CodeSearchTool.init()
    const result = await tool.execute({ query: "react hooks", tokensNum: 5000 }, ctx)

    expect(result.output).toBe("Search result content")
    expect(result.title).toBe("Code search: react hooks")
    expect(global.fetch).toHaveBeenCalledWith(
      "https://mcp.exa.ai/mcp",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("react hooks"),
      })
    )
  })

  it("handles empty search results", async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("data: {}\n"),
    })

    const tool = await CodeSearchTool.init()
    const result = await tool.execute({ query: "empty query", tokensNum: 5000 }, ctx)

    expect(result.output).toContain("No code snippets or documentation found")
  })

  it("handles non-OK response", async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    })

    const tool = await CodeSearchTool.init()
    expect(tool.execute({ query: "fail", tokensNum: 5000 }, ctx)).rejects.toThrow("Code search error (500): Internal Server Error")
  })

  it("handles fetch timeout", async () => {
    const abortError = new Error("AbortError")
    abortError.name = "AbortError"
    ;(global.fetch as any).mockRejectedValue(abortError)

    const tool = await CodeSearchTool.init()
    expect(tool.execute({ query: "timeout", tokensNum: 5000 }, ctx)).rejects.toThrow("Code search request timed out")
  })

  it("handles other fetch errors", async () => {
    const networkError = new Error("Network Error")
    ;(global.fetch as any).mockRejectedValue(networkError)

    const tool = await CodeSearchTool.init()
    expect(tool.execute({ query: "error", tokensNum: 5000 }, ctx)).rejects.toThrow("Network Error")
  })

  it("ignores invalid JSON lines in SSE response", async () => {
    const mockResponseText = 'data: invalid json\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"valid result"}]}}\n'
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    })

    const tool = await CodeSearchTool.init()
    const result = await tool.execute({ query: "invalid json test", tokensNum: 5000 }, ctx)

    expect(result.output).toBe("valid result")
  })

  it("uses default tokensNum if not provided", async () => {
    const mockResponseText = 'data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"result"}]}}\n'
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    })

    const tool = await CodeSearchTool.init()
    await tool.execute({ query: "default tokens" } as any, ctx)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"tokensNum":5000'),
      })
    )
  })
})
