import { expect, it, describe, mock, beforeEach, vi, afterEach } from "bun:test"
import { CodeSearchTool } from "../../src/tool/codesearch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("CodeSearchTool", () => {
  let ctx: any
  let fetchSpy: any

  beforeEach(() => {
    ctx = {
      ask: vi.fn(async () => true),
      abort: new AbortController().signal,
    }
    fetchSpy = vi.spyOn(global, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("successfully searches code and parses SSE response", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockResponseText = 'data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Search result content"}]}}\n'
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(mockResponseText),
        } as any)

        const tool = await CodeSearchTool.init()
        const result = await tool.execute({ query: "react hooks", tokensNum: 5000 }, ctx)

        expect(result.output).toBe("Search result content")
        expect(result.title).toBe("Code search: react hooks")
        expect(fetchSpy).toHaveBeenCalledWith(
          "https://mcp.exa.ai/mcp",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("react hooks"),
          })
        )
      }
    })
  })

  it("handles empty search results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve("data: {}\n"),
        } as any)

        const tool = await CodeSearchTool.init()
        const result = await tool.execute({ query: "empty query", tokensNum: 5000 }, ctx)

        expect(result.output).toContain("No code snippets or documentation found")
      }
    })
  })

  it("handles non-OK response", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        fetchSpy.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        } as any)

        const tool = await CodeSearchTool.init()
        expect(tool.execute({ query: "fail", tokensNum: 5000 }, ctx)).rejects.toThrow("Code search error (500): Internal Server Error")
      }
    })
  })

  it("handles fetch timeout", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const abortError = new Error("AbortError")
        abortError.name = "AbortError"
        fetchSpy.mockRejectedValue(abortError)

        const tool = await CodeSearchTool.init()
        expect(tool.execute({ query: "timeout", tokensNum: 5000 }, ctx)).rejects.toThrow("Code search request timed out")
      }
    })
  })

  it("handles other fetch errors", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        fetchSpy.mockRejectedValue(new Error("Network failure"))

        const tool = await CodeSearchTool.init()
        expect(tool.execute({ query: "error", tokensNum: 5000 }, ctx)).rejects.toThrow("Network failure")
      }
    })
  })

  it("handles malformed JSON response", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve("data: { invalid json }\n"),
        } as any)

        const tool = await CodeSearchTool.init()
        const result = await tool.execute({ query: "malformed", tokensNum: 5000 }, ctx)

        expect(result.output).toContain("No code snippets or documentation found")
      }
    })
  })

  it("handles empty SSE data prefix", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockResponseText = '{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Direct JSON"}]}}'
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(mockResponseText),
        } as any)

        const tool = await CodeSearchTool.init()
        const result = await tool.execute({ query: "direct", tokensNum: 5000 }, ctx)

        expect(result.output).toBe("Direct JSON")
      }
    })
  })

  it("ignores invalid JSON lines in SSE response", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockResponseText = 'data: invalid json\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"valid result"}]}}\n'
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(mockResponseText),
        } as any)

        const tool = await CodeSearchTool.init()
        const result = await tool.execute({ query: "invalid json test", tokensNum: 5000 }, ctx)

        expect(result.output).toBe("valid result")
      }
    })
  })

  it("uses default tokensNum if not provided", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockResponseText = 'data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"result"}]}}\n'
        fetchSpy.mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(mockResponseText),
        } as any)

        const tool = await CodeSearchTool.init()
        await tool.execute({ query: "default tokens" }, ctx)

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            body: expect.stringContaining('"tokensNum":5000'),
          })
        )
      }
    })
  })
})
