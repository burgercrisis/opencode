import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test"
import { WebFetchTool } from "../../src/tool/webfetch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("WebFetchTool", () => {
  let mocks: any
  const ctx = {
    ask: vi.fn(async () => {}),
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    mocks = {
      fetch: vi.spyOn(global, "fetch"),
      ask: vi.spyOn(ctx, "ask"),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("validates URL protocol", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        try {
          await tool.execute({ url: "ftp://example.com", format: "markdown" }, ctx as any)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toBe("URL must start with http:// or https://")
        }
      }
    })
  })

  it("fetches content successfully as markdown (HTML to Markdown)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const mockResponse = {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html", "content-length": "100" }),
          arrayBuffer: async () => new TextEncoder().encode("<html><body><h1>Hello</h1></body></html>").buffer,
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        const result = await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)

        expect(result.title).toContain("https://example.com")
        expect(result.output).toContain("# Hello")
        expect(mocks.ask).toHaveBeenCalled()
      }
    })
  })

  it("fetches content successfully as text (HTML to Text)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const mockResponse = {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          arrayBuffer: async () => new TextEncoder().encode("<html><body><h1>Hello</h1><p>World</p></body></html>").buffer,
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        const result = await tool.execute({ url: "https://example.com", format: "text" }, ctx as any)

        expect(result.output).toContain("Hello")
        expect(result.output).toContain("World")
      }
    })
  })

  it("extracts text from HTML excluding script and style tags", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
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

        mocks.fetch.mockResolvedValue(mockResponse as any)

        const result = await tool.execute({ url: "https://example.com", format: "text" }, ctx as any)

        expect(result.output).toContain("Visible Content")
        expect(result.output).not.toContain("console.log")
        expect(result.output).not.toContain("body { color: red; }")
        expect(result.output).not.toContain("Hidden Content")
      }
    })
  })

  it("fetches content successfully as html", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const html = "<html><body>Hello</body></html>"
        const mockResponse = {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          arrayBuffer: async () => new TextEncoder().encode(html).buffer,
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        const result = await tool.execute({ url: "https://example.com", format: "html" }, ctx as any)

        expect(result.output).toBe(html)
      }
    })
  })

  it("handles Cloudflare mitigation retry", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
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
        mocks.fetch.mockImplementation(async (url: string, init: any) => {
          callCount++
          if (callCount === 1) {
            expect(init?.headers?.["User-Agent"]).toContain("Mozilla")
            return firstResponse as any
          }
          expect(init?.headers?.["User-Agent"]).toBe("opencode")
          return secondResponse as any
        })

        const result = await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)
        expect(result.output).toBe("Success")
        expect(callCount).toBe(2)
      }
    })
  })

  it("throws error on failed request", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const mockResponse = {
          ok: false,
          status: 404,
          headers: new Headers(),
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        try {
          await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("404")
        }
      }
    })
  })

  it("throws error on large response (header check)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const mockResponse = {
          ok: true,
          status: 200,
          headers: new Headers({ "content-length": (10 * 1024 * 1024).toString() }),
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        try {
          await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("too large")
        }
      }
    })
  })

  it("throws error on large response (actual body check)", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        const mockResponse = {
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024),
        }

        mocks.fetch.mockResolvedValue(mockResponse as any)

        try {
          await tool.execute({ url: "https://example.com", format: "markdown" }, ctx as any)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("too large")
        }
      }
    })
  })

  it("handles timeout correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WebFetchTool.init()
        
        mocks.fetch.mockImplementation(async (url: string, init: any) => {
          expect(init.signal).toBeDefined()
          return new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")))
          })
        })

        try {
          await tool.execute({ url: "https://example.com", format: "markdown", timeout: 1 }, ctx as any)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("aborted")
        }
      }
    })
  })
})
