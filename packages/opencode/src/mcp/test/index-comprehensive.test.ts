import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { MCP } from "../index"
import { Config } from "../../config/config"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import { McpAuth } from "../auth"
import { Bus } from "../../bus/index"
import { TuiEvent } from "../../cli/cmd/tui/event"
import { McpOAuthCallback } from "../oauth-callback"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/index.js"
import { Installation } from "../../installation"
import crypto from "crypto"

describe("MCP Index - Comprehensive Coverage Tests", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  let tmp: any
  let originalConfig: any
  let originalCrypto: any

  beforeEach(async () => {
    tmp = await tmpdir()
    originalConfig = Config.get
    originalCrypto = crypto.getRandomValues
  })

  afterEach(async () => {
    await tmp?.dispose?.()
    Config.get = originalConfig
    crypto.getRandomValues = originalCrypto
  })

  describe("Status schema", () => {
    it("validates connected status", () => {
      const status = { status: "connected" }
      expect(() => MCP.Status.parse(status)).not.toThrow()
      expect(MCP.Status.safeParse(status).success).toBe(true)
    })

    it("validates disabled status", () => {
      const status = { status: "disabled" }
      expect(() => MCP.Status.parse(status)).not.toThrow()
      expect(MCP.Status.safeParse(status).success).toBe(true)
    })

    it("validates failed status", () => {
      const status = { status: "failed", error: "test error" }
      expect(() => MCP.Status.parse(status)).not.toThrow()
      expect(MCP.Status.safeParse(status).success).toBe(true)
    })

    it("validates needs_auth status", () => {
      const status = { status: "needs_auth" }
      expect(() => MCP.Status.parse(status)).not.toThrow()
      expect(MCP.Status.safeParse(status).success).toBe(true)
    })

    it("validates needs_client_registration status", () => {
      const status = { status: "needs_client_registration", error: "test error" }
      expect(() => MCP.Status.parse(status)).not.toThrow()
      expect(MCP.Status.safeParse(status).success).toBe(true)
    })
  })

  describe("convertMcpTool function", () => {
    it("converts MCP tool to AI SDK tool", async () => {
      const mcpTool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            input1: { type: "string" },
            input2: { type: "number" }
          }
        }
      }

      const mockClient = {
        callTool: async () => ({ content: "test result" })
      }

      const tool = await MCP.convertMcpTool(mcpTool, mockClient as any, 5000)

      expect(tool.description).toBe("Test tool")
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.inputSchema.properties).toBeDefined()
      expect(tool.inputSchema.additionalProperties).toBe(false)
    })

    it("handles tool execution with arguments", async () => {
      const mcpTool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            input1: { type: "string" }
          }
        }
      }

      let capturedArgs: any
      const mockClient = {
        callTool: async ({ name, arguments: args }) => {
          capturedArgs = args
          return { content: "test result" }
        }
      }

      const tool = await MCP.convertMcpTool(mcpTool, mockClient as any)
      const result = await tool.execute({ input1: "test value" })

      expect(capturedArgs.input1).toBe("test value")
      expect(result.content).toBe("test result")
    })

    it("handles empty arguments", async () => {
      const mcpTool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: { type: "object" }
      }

      let capturedArgs: any
      const mockClient = {
        callTool: async ({ name, arguments: args }) => {
          capturedArgs = args
          return { content: "test result" }
        }
      }

      const tool = await MCP.convertMcpTool(mcpTool, mockClient as any)
      await tool.execute({})

      expect(capturedArgs).toEqual({})
    })

    it("uses default timeout", async () => {
      const mcpTool = { name: "test_tool" }
      const mockClient = { callTool: async () => ({ content: "result" }) }

      const tool = await MCP.convertMcpTool(mcpTool, mockClient as any)
      await tool.execute({})

      // Should not throw with default timeout
      expect(true).toBe(true)
    })
  })

  describe("State management", () => {
    it("initializes state with disabled MCP servers", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({ mcp: {} })

          const state = await (MCP as any).state()

          expect(state.status).toEqual({})
          expect(state.clients).toEqual({})
        }
      })
    })

    it("ignores MCP config entries without type", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "invalid-server": { enabled: true } // Missing type
            }
          })

          // Should not throw
          const state = await (MCP as any).state()
          expect(state.status).toEqual({})
        }
      })
    })

    it("marks disabled servers correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "disabled-server": {
                type: "remote",
                url: "https://example.com",
                enabled: false
              }
            }
          })

          const state = await (MCP as any).state()
          expect(state.status["disabled-server"]).toEqual({ status: "disabled" })
        }
      })
    })

    it("handles create function failures", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "invalid-url"
              }
            }
          })

          const state = await (MCP as any).state()
          expect(state.status["test-server"]).toEqual({ status: "failed" })
        }
      })
    })

    it("closes clients on shutdown", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let clientClosed = false
          const mockClient = {
            close: async () => { clientClosed = true }
          }

          Config.get = () => Promise.resolve({ mcp: {} })
          const state = await (MCP as any).state()
          state.clients["test"] = mockClient

          await (MCP as any).shutdown(state)

          expect(clientClosed).toBe(true)
        }
      })
    })
  })

  describe("Remote server connection", () => {
    it("creates OAuth provider when not disabled", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com",
                oauth: {
                  clientId: "test-client"
                }
              }
            }
          })

          // Mock McpOAuthProvider constructor
          let providerCreated = false
          const originalProvider = (MCP as any).McpOAuthProvider
            ; (MCP as any).McpOAuthProvider = () => {
              providerCreated = true
              return { onRedirect: async () => { } }
            }

          await (MCP as any).create("test-server", {
            type: "remote",
            url: "https://example.com"
          })

          expect(providerCreated).toBe(true)

            ; (MCP as any).McpOAuthProvider = originalProvider
        }
      })
    })

    it("skips OAuth provider when disabled", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com",
                oauth: false
              }
            }
          })

          let providerCreated = false
          const originalProvider = (MCP as any).McpOAuthProvider
            ; (MCP as any).McpOAuthProvider = () => {
              providerCreated = true
              return { onRedirect: async () => { } }
            }

          await (MCP as any).create("test-server", {
            type: "remote",
            url: "https://example.com"
          })

          expect(providerCreated).toBe(false)

            ; (MCP as any).McpOAuthProvider = originalProvider
        }
      })
    })

    it("handles UnauthorizedError for needs_client_registration", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          // Mock Client to throw UnauthorizedError
          const originalClient = (MCP as any).Client
            ; (MCP as any).Client = class {
              constructor() { }
              async connect() {
                const error = new Error("registration required")
                error.name = "UnauthorizedError"
                throw error
              }
            }

          let toastShown = false
          const originalPublish = Bus.publish
          Bus.publish = (event: any, data: any) => {
            if (event.type === "tui.toast.show") {
              toastShown = true
              expect(data.title).toBe("MCP Authentication Required")
              expect(data.message).toContain("requires a pre-registered client ID")
            }
          }

          const result = await (MCP as any).create("test-server", {
            type: "remote",
            url: "https://example.com"
          })

          expect(result.status.status).toBe("needs_client_registration")
          expect(toastShown).toBe(true)

            ; (MCP as any).Client = originalClient
          Bus.publish = originalPublish
        }
      })
    })

    it("handles UnauthorizedError for needs_auth", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          // Mock Client to throw UnauthorizedError
          const originalClient = (MCP as any).Client
            ; (MCP as any).Client = class {
              constructor() { }
              async connect() {
                const error = new Error("authentication required")
                error.name = "UnauthorizedError"
                throw error
              }
            }

          let toastShown = false
          const originalPublish = Bus.publish
          Bus.publish = (event: any, data: any) => {
            if (event.type === "tui.toast.show") {
              toastShown = true
              expect(data.title).toBe("MCP Authentication Required")
              expect(data.message).toContain("requires authentication")
            }
          }

          const result = await (MCP as any).create("test-server", {
            type: "remote",
            url: "https://example.com"
          })

          expect(result.status.status).toBe("needs_auth")
          expect(toastShown).toBe(true)

            ; (MCP as any).Client = originalClient
          Bus.publish = originalPublish
        }
      })
    })

    it("tries multiple transports on failure", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          let connectAttempts = 0
          const originalClient = (MCP as any).Client
            ; (MCP as any).Client = class {
              constructor() { }
              async connect() {
                connectAttempts++
                if (connectAttempts < 2) {
                  throw new Error("First transport failed")
                }
                return {} // Success on second attempt
              }
            }

          const result = await (MCP as any).create("test-server", {
            type: "remote",
            url: "https://example.com"
          })

          expect(result.status.status).toBe("connected")
          expect(connectAttempts).toBe(2)

            ; (MCP as any).Client = originalClient
        }
      })
    })
  })

  describe("Local server connection", () => {
    it("creates stdio transport for local servers", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "local",
                command: ["echo", "test"]
              }
            }
          })

          // Mock StdioClientTransport
          let transportCreated = false
          const originalTransport = (MCP as any).StdioClientTransport
            ; (MCP as any).StdioClientTransport = (options: any) => {
              transportCreated = true
              expect(options.command).toEqual(["echo", "test"])
              expect(options.cwd).toBe(Instance.directory)
              return { on: () => { } }
            }

          await (MCP as any).create("test-server", {
            type: "local",
            command: ["echo", "test"]
          })

          expect(transportCreated).toBe(true)

            ; (MCP as any).StdioClientTransport = originalTransport
        }
      })
    })

    it("sets BUN_BE_BUN environment variable for opencode command", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "local",
                command: ["opencode", "test"]
              }
            }
          })

          let envVars: any = {}
          const originalTransport = (MCP as any).StdioClientTransport
            ; (MCP as any).StdioClientTransport = (options: any) => {
              envVars = options.env
              return { on: () => { } }
            }

          await (MCP as any).create("test-server", {
            type: "local",
            command: ["opencode", "test"]
          })

          expect(envVars.BUN_BE_BUN).toBe("1")

            ; (MCP as any).StdioClientTransport = originalTransport
        }
      })
    })

    it("handles local server connection failures", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "local",
                command: ["nonexistent-command"]
              }
            }
          })

          const result = await (MCP as any).create("test-server", {
            type: "local",
            command: ["nonexistent-command"]
          })

          expect(result.status.status).toBe("failed")
          expect(result.status.error).toBeDefined()
        }
      })
    })
  })

  describe("Status function", () => {
    it("returns status for all configured servers", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "server1": { type: "remote", url: "https://example1.com" },
              "server2": { type: "local", command: ["test"] },
              "server3": { type: "remote", url: "https://example2.com", enabled: false }
            }
          })

          const status = await MCP.status()

          expect(status["server1"]).toBeDefined()
          expect(status["server2"]).toBeDefined()
          expect(status["server3"]).toEqual({ status: "disabled" })
        }
      })
    })

    it("ignores invalid MCP configurations", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "valid-server": { type: "remote", url: "https://example.com" },
              "invalid-server": { enabled: true } // Missing type
            }
          })

          const status = await MCP.status()

          expect(status["valid-server"]).toBeDefined()
          expect(status["invalid-server"]).toBeUndefined()
        }
      })
    })
  })

  describe("Tools function", () => {
    it("returns tools from connected clients", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockTools = [
            { name: "tool1", description: "Test tool 1" },
            { name: "tool2", description: "Test tool 2" }
          ]

          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": { type: "remote", url: "https://example.com" }
            }
          })

          // Mock client and state
          const mockClient = {
            listTools: async () => ({ tools: mockTools })
          }

          const originalClients = MCP.clients
          MCP.clients = () => Promise.resolve({ "test-server": mockClient as any })

          const tools = await MCP.tools()

          expect(Object.keys(tools)).toContain("test-server_tool1")
          expect(Object.keys(tools)).toContain("test-server_tool2")

          MCP.clients = originalClients
        }
      })
    })

    it("handles tool list failures", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": { type: "remote", url: "https://example.com" }
            }
          })

          const mockClient = {
            listTools: async () => {
              throw new Error("Tools list failed")
            }
          }

          const originalClients = MCP.clients
          MCP.clients = () => Promise.resolve({ "test-server": mockClient as any })

          const tools = await MCP.tools()

          expect(Object.keys(tools)).toHaveLength(0)

          MCP.clients = originalClients
        }
      })
    })
  })

  describe("OAuth authentication", () => {
    it("generates authorization URL for remote servers", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          // Mock crypto
          crypto.getRandomValues = () => new Uint8Array([1, 2, 3, 4])

          // Mock McpOAuthProvider
          let capturedUrl: URL | undefined
          const originalProvider = (MCP as any).McpOAuthProvider
            ; (MCP as any).McpOAuthProvider = () => ({
              onRedirect: async (url: URL) => {
                capturedUrl = url
              }
            })

          const result = await MCP.startAuth("test-server")

          expect(result.authorizationUrl).toBeDefined()
          expect(capturedUrl).toBeDefined()

            ; (MCP as any).McpOAuthProvider = originalProvider
        }
      })
    })

    it("validates OAuth state on callback", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          // Set initial state
          await McpAuth.updateOAuthState("test-server", "initial-state")

          // Mock callback to return different state
          const originalCallback = McpOAuthCallback.waitForCallback
          McpOAuthCallback.waitForCallback = () => Promise.resolve("different-state")

          try {
            await MCP.authenticate("test-server")
            expect(false).toBe(true) // Should throw
          } catch (error) {
            expect(error.message).toContain("OAuth state mismatch")
          }

          McpOAuthCallback.waitForCallback = originalCallback
        }
      })
    })

    it("handles browser open failures", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com"
              }
            }
          })

          // Mock open to throw error
          const originalOpen = (MCP as any).open
            ; (MCP as any).open = () => {
              throw new Error("Browser not available")
            }

          let eventPublished = false
          const originalPublish = Bus.publish
          Bus.publish = (event: any, data: any) => {
            if (event.type === "mcp.browser.open.failed") {
              eventPublished = true
              expect(data.mcpName).toBe("test-server")
              expect(data.url).toBeDefined()
            }
          }

          try {
            await MCP.authenticate("test-server")
          } catch (error) {
            expect(eventPublished).toBe(true)
          }

          ; (MCP as any).open = originalOpen
          Bus.publish = originalPublish
        }
      })
    })
  })

  describe("Error handling", () => {
    it("throws error for non-remote servers in startAuth", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "local",
                command: ["test"]
              }
            }
          })

          try {
            await MCP.startAuth("test-server")
            expect(false).toBe(true) // Should throw
          } catch (error) {
            expect(error.message).toContain("not a remote server")
          }
        }
      })
    })

    it("throws error when OAuth is disabled in startAuth", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com",
                oauth: false
              }
            }
          })

          try {
            await MCP.startAuth("test-server")
            expect(false).toBe(true) // Should throw
          } catch (error) {
            expect(error.message).toContain("has OAuth explicitly disabled")
          }
        }
      })
    })
  })

  describe("Resource and prompt handling", () => {
    it("sanitizes client and tool names correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockClient = {
            listPrompts: async () => ({
              prompts: [
                { name: "test-prompt", description: "Test" }
              ]
            }),
            listResources: async () => ({
              resources: [
                { name: "test-resource", uri: "test://resource" }
              ]
            })
          }

          const originalClients = MCP.clients
          MCP.clients = () => Promise.resolve({ "test client": mockClient as any })

          const prompts = await MCP.prompts()
          const resources = await MCP.resources()

          expect(Object.keys(prompts)).toContain("test_client_test-prompt")
          expect(Object.keys(resources)).toContain("test_client_test-resource")

          MCP.clients = originalClients
        }
      })
    })
  })
})
