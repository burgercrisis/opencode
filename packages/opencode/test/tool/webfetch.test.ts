import { describe, it, expect, mock, beforeEach } from "bun:test"
import { WebFetchTool } from "../../src/tool/webfetch"
import { Instance } from "../../src/project/instance"
import path from "node:path"

describe("WebFetchTool", () => {
  const ctx = {
    ask: mock(async () => {}),
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    mock.restore()
    ctx.ask = mock(async () => {})
  })

  it("validates URL protocol", async () => {
    const tool = await WebFetchTool.init()
    try {
      await tool.execute({ url: "ftp://example.com" }, ctx as any)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toBe("URL must start with http:// or https://")
    }
  })

  it("fetches content successfully as markdown (HTML to Markdown)", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html", "content-length": "100" }),
      arrayBuffer: async () => new TextEncoder().encode("<html><body><h1>Hello</h1></body></html>").buffer,
    }

    global.fetch = mock(async () => mockResponse as any)

    const result = await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)

    expect(result.title).toContain("https://example.com")
    expect(result.output).toContain("# Hello")
    expect(ctx.ask).toHaveBeenCalled()
  })

  it("fetches content successfully as text (HTML to Text)", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => new TextEncoder().encode("<html><body><h1>Hello</h1><p>World</p></body></html>").buffer,
    }

    global.fetch = mock(async () => mockResponse as any)

    const result = await tool.execute({ url: "https://example.com", format: "text" }, ctx as any)

    expect(result.output).toContain("Hello")
    expect(result.output).toContain("World")
  })

  it("extracts text from HTML excluding script and style tags", async () => {
    const tool = await WebFetchTool.init()
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>console.log("hello");</script>
        </head>
        <body>
          <p>Visible Content</p>
          <noscript>Hidden Content</noscript>
          <iframe>Hidden Content</iframe>
        </body>
      </html>
    `
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    }

    global.fetch = mock(async () => mockResponse as any)

    const result = await tool.execute({ url: "https://example.com", format: "text" }, ctx as any)

    expect(result.output).toContain("Visible Content")
    expect(result.output).not.toContain("console.log")
    expect(result.output).not.toContain("body { color: red; }")
    expect(result.output).not.toContain("Hidden Content")
  })

  it("fetches content successfully as html", async () => {
    const tool = await WebFetchTool.init()
    const html = "<html><body>Hello</body></html>"
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    }

    global.fetch = mock(async () => mockResponse as any)

    const result = await tool.execute({ url: "https://example.com", format: "html" }, ctx as any)

    expect(result.output).toBe(html)
  })

  it("handles Cloudflare mitigation retry", async () => {
    const tool = await WebFetchTool.init()
    const firstResponse = {
      ok: false,
      status: 403,
      headers: new Headers({ "cf-mitigated": "challenge" }),
    }

    const secondResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/plain" }),
      arrayBuffer: async () => new TextEncoder().encode("Success").buffer,
    }

    let callCount = 0
    global.fetch = mock(async (url, init) => {
      callCount++
      if (callCount === 1) {
        expect((init?.headers as any)["User-Agent"]).toContain("Mozilla")
        return firstResponse as any
      }
      expect((init?.headers as any)["User-Agent"]).toBe("opencode")
      return secondResponse as any
    })

    const result = await tool.execute({ url: "https://example.com" }, ctx as any)
    expect(result.output).toBe("Success")
    expect(callCount).toBe(2)
  })

  it("throws error on failed request", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: false,
      status: 404,
      headers: new Headers(),
    }

    global.fetch = mock(async () => mockResponse as any)

    try {
      await tool.execute({ url: "https://example.com" }, ctx as any)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toBe("Request failed with status code: 404")
    }
  })

  it("throws error if response is too large (Content-Length)", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": (6 * 1024 * 1024).toString() }),
    }

    global.fetch = mock(async () => mockResponse as any)

    try {
      await tool.execute({ url: "https://example.com" }, ctx as any)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toBe("Response too large (exceeds 5MB limit)")
    }
  })

  it("throws error if response is too large (ArrayBuffer)", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({}),
      arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024),
    }

    global.fetch = mock(async () => mockResponse as any)

    try {
      await tool.execute({ url: "https://example.com" }, ctx as any)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toBe("Response too large (exceeds 5MB limit)")
    }
  })

  it("respects custom timeout", async () => {
    const tool = await WebFetchTool.init()
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/plain" }),
      arrayBuffer: async () => new TextEncoder().encode("Timeout Test").buffer,
    }

    global.fetch = mock(async () => mockResponse as any)

    // We can't easily test the actual timeout mechanism here without complex mocks,
    // but we can at least ensure it executes.
    const result = await tool.execute({ url: "https://example.com", timeout: 1 }, ctx as any)
    expect(result.output).toBe("Timeout Test")
  })
})
