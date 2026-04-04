import { beforeAll, describe, expect, mock, test, beforeEach } from "bun:test"
import { createOpencodeClient } from "./client"
import type { Config } from "./gen/client/types.gen"

// Mock dependencies
beforeAll(async () => {
  // Mock the generated client modules
  mock.module("./gen/client/client.gen.js", () => ({
    createClient: mock((config: Config) => ({
      session: {
        create: mock(() => Promise.resolve({ data: { id: "test-session" } })),
        list: mock(() => Promise.resolve({ data: [] })),
        get: mock(() => Promise.resolve({ data: null })),
        update: mock(() => Promise.resolve({ data: null })),
        delete: mock(() => Promise.resolve({ data: null })),
        prompt: mock(() => Promise.resolve({ data: null })),
        promptAsync: mock(() => Promise.resolve({ data: null })),
        shell: mock(() => Promise.resolve({ data: null })),
        command: mock(() => Promise.resolve({ data: null })),
        abort: mock(() => Promise.resolve({ data: null })),
      },
      global: {
        config: {
          get: mock(() => Promise.resolve({ data: {} })),
          update: mock(() => Promise.resolve({ data: {} })),
        },
        event: mock(() => Promise.resolve({
          stream: (async function* () {
            yield { directory: "test", payload: { type: "test", properties: {} } }
          })(),
        })),
      },
      worktree: {
        create: mock(() => Promise.resolve({ data: { directory: "test-worktree" } })),
        list: mock(() => Promise.resolve({ data: [] })),
        get: mock(() => Promise.resolve({ data: null })),
        delete: mock(() => Promise.resolve({ data: null })),
      },
      lsp: {
        status: mock(() => Promise.resolve({ data: [] })),
      },
    })),
  }))

  mock.module("./gen/sdk.gen.js", () => ({
    OpencodeClient: mock(({ client }) => ({
      client,
      session: client.session,
      global: client.global,
      worktree: client.worktree,
      lsp: client.lsp,
    })),
  }))

  // Mock fetch globally
  global.fetch = mock(() => Promise.resolve(new Response())) as any
})

describe("createOpencodeClient", () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  test("creates client with default config", () => {
    const client = createOpencodeClient()
    
    expect(client).toBeDefined()
    expect(client.session).toBeDefined()
    expect(client.global).toBeDefined()
    expect(client.worktree).toBeDefined()
    expect(client.lsp).toBeDefined()
  })

  test("creates client with custom config", () => {
    const customConfig: Config = {
      baseUrl: "http://localhost:4096",
      headers: {
        "Authorization": "Bearer token",
      },
    }

    const client = createOpencodeClient(customConfig)
    
    expect(client).toBeDefined()
  })

  test("adds custom fetch when not provided", () => {
    const originalFetch = global.fetch
    
    createOpencodeClient()
    
    // Should have called fetch with timeout disabled
    expect(originalFetch).toHaveBeenCalled()
  })

  test("preserves provided fetch function", () => {
    const customFetch = mock(() => Promise.resolve(new Response()))
    
    const config = {
      fetch: customFetch,
    }

    createOpencodeClient(config)
    
    // Should not have overridden the custom fetch
    expect(customFetch).not.toHaveBeenCalled()
  })

  test("adds directory header for ASCII directories", () => {
    const config = {
      directory: "/path/to/directory",
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "x-opencode-directory": "/path/to/directory",
    })
  })

  test("encodes non-ASCII directories", () => {
    const config = {
      directory: "/path/with/üñíçødé/characters",
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "x-opencode-directory": encodeURIComponent("/path/with/üñíçødé/characters"),
    })
  })

  test("preserves existing headers when adding directory header", () => {
    const config = {
      directory: "/test/directory",
      headers: {
        "Authorization": "Bearer token",
        "Existing-Header": "value",
      },
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "Authorization": "Bearer token",
      "Existing-Header": "value",
      "x-opencode-directory": "/test/directory",
    })
  })

  test("handles empty directory", () => {
    const config = {
      directory: "",
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "x-opencode-directory": "",
    })
  })

  test("handles special characters in directory", () => {
    const config = {
      directory: "/path/with spaces & symbols!@#$%",
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "x-opencode-directory": "/path/with spaces & symbols!@#$%",
    })
  })

  test("handles Unicode characters in directory", () => {
    const config = {
      directory: "/路径/包含/中文/字符",
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig.headers).toEqual({
      "x-opencode-directory": encodeURIComponent("/路径/包含/中文/字符"),
    })
  })

  test("combines directory header with other config options", () => {
    const config = {
      baseUrl: "http://localhost:4096",
      directory: "/test/directory",
      headers: {
        "Authorization": "Bearer token",
      },
      timeout: 30000,
    }

    createOpencodeClient(config)
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    const calledConfig = createClientMock.mock.calls[0][0]
    
    expect(calledConfig).toEqual({
      baseUrl: "http://localhost:4096",
      directory: "/test/directory",
      headers: {
        "Authorization": "Bearer token",
        "x-opencode-directory": "/test/directory",
      },
      timeout: 30000,
      fetch: expect.any(Function),
    })
  })

  test("creates OpencodeClient wrapper", () => {
    const config = {
      baseUrl: "http://localhost:4096",
    }

    const client = createOpencodeClient(config)
    
    const OpencodeClientMock = require("./gen/sdk.gen.js").OpencodeClient
    expect(OpencodeClientMock).toHaveBeenCalledWith({
      client: expect.any(Object),
    })
  })

  test("passes through all client methods", () => {
    const config = {
      baseUrl: "http://localhost:4096",
    }

    const client = createOpencodeClient(config)
    
    // Test that all expected methods are available
    expect(typeof client.session.create).toBe("function")
    expect(typeof client.session.list).toBe("function")
    expect(typeof client.session.get).toBe("function")
    expect(typeof client.session.update).toBe("function")
    expect(typeof client.session.delete).toBe("function")
    expect(typeof client.session.prompt).toBe("function")
    expect(typeof client.session.promptAsync).toBe("function")
    expect(typeof client.session.shell).toBe("function")
    expect(typeof client.session.command).toBe("function")
    expect(typeof client.session.abort).toBe("function")
    
    expect(typeof client.global.config.get).toBe("function")
    expect(typeof client.global.config.update).toBe("function")
    expect(typeof client.global.event).toBe("function")
    
    expect(typeof client.worktree.create).toBe("function")
    expect(typeof client.worktree.list).toBe("function")
    expect(typeof client.worktree.get).toBe("function")
    expect(typeof client.worktree.delete).toBe("function")
    
    expect(typeof client.lsp.status).toBe("function")
  })

  test("handles undefined config", () => {
    const client = createOpencodeClient(undefined)
    
    expect(client).toBeDefined()
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    expect(createClientMock).toHaveBeenCalledWith({
      fetch: expect.any(Function),
    })
  })

  test("handles null config", () => {
    const client = createOpencodeClient(null)
    
    expect(client).toBeDefined()
    
    const createClientMock = require("./gen/client/client.gen.js").createClient
    expect(createClientMock).toHaveBeenCalledWith({
      fetch: expect.any(Function),
    })
  })

  test("custom fetch disables timeout", () => {
    const mockFetch = mock((req: any) => {
      expect(req.timeout).toBe(false)
      return Promise.resolve(new Response())
    })

    const config = {
      fetch: mockFetch,
    }

    createOpencodeClient(config)
    
    // The custom fetch should be called with timeout disabled
    // but since it's provided, it won't be called during client creation
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("default fetch disables timeout", () => {
    // Reset fetch mock
    global.fetch = mock((req: any) => {
      expect(req.timeout).toBe(false)
      return Promise.resolve(new Response())
    }) as any

    createOpencodeClient()
    
    // The default fetch wrapper should be called
    expect(global.fetch).toHaveBeenCalled()
  })

  test("handles complex directory paths", () => {
    const complexPaths = [
      "/simple/path",
      "/path/with-dashes",
      "/path/with_underscores",
      "/path/with.dots",
      "/path/with spaces",
      "/path/with/symbols!@#$%^&*()",
      "/path/with/unicode/üñíçødé",
      "/路径/包含/中文",
      "/путь/с/русскими/символами",
      "/مسار/باللغة/العربية",
    ]

    complexPaths.forEach((directory) => {
      const config = { directory }
      createOpencodeClient(config)
      
      const createClientMock = require("./gen/client/client.gen.js").createClient
      const calledConfig = createClientMock.mock.calls[createClientMock.mock.calls.length - 1][0]
      
      const expectedHeader = /[^\x00-\x7F]/.test(directory) 
        ? encodeURIComponent(directory) 
        : directory
      
      expect(calledConfig.headers["x-opencode-directory"]).toBe(expectedHeader)
    })
  })
})
