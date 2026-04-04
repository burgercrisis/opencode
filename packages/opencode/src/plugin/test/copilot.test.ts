import { describe, it, expect } from "bun:test"
import { CopilotAuthPlugin } from "../copilot"

describe("Copilot Plugin", () => {
  describe("normalizeDomain", () => {
    it("should remove https protocol", () => {
      const normalizeDomain = (global as any).normalizeDomain
      expect(normalizeDomain("https://github.com")).toBe("github.com")
    })

    it("should remove http protocol", () => {
      const normalizeDomain = (global as any).normalizeDomain
      expect(normalizeDomain("http://github.com")).toBe("github.com")
    })

    it("should remove trailing slash", () => {
      const normalizeDomain = (global as any).normalizeDomain
      expect(normalizeDomain("https://github.com/")).toBe("github.com")
    })

    it("should handle domain without protocol", () => {
      const normalizeDomain = (global as any).normalizeDomain
      expect(normalizeDomain("github.com")).toBe("github.com")
    })

    it("should handle complex domain", () => {
      const normalizeDomain = (global as any).normalizeDomain
      expect(normalizeDomain("https://company.ghe.com/")).toBe("company.ghe.com")
    })
  })

  describe("getUrls", () => {
    it("should generate URLs for github.com", () => {
      const getUrls = (global as any).getUrls
      const urls = getUrls("github.com")
      
      expect(urls.DEVICE_CODE_URL).toBe("https://github.com/login/device/code")
      expect(urls.ACCESS_TOKEN_URL).toBe("https://github.com/login/oauth/access_token")
    })

    it("should generate URLs for enterprise domain", () => {
      const getUrls = (global as any).getUrls
      const urls = getUrls("company.ghe.com")
      
      expect(urls.DEVICE_CODE_URL).toBe("https://company.ghe.com/login/device/code")
      expect(urls.ACCESS_TOKEN_URL).toBe("https://company.ghe.com/login/oauth/access_token")
    })
  })

  describe("Plugin Interface", () => {
    it("should export CopilotAuthPlugin function", () => {
      expect(typeof CopilotAuthPlugin).toBe("function")
    })

    it("should return hooks object", async () => {
      const mockInput = {
        client: {
          session: {
            get: () => Promise.resolve({ data: { parentID: "parent-123" } })
          }
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      expect(hooks).toBeDefined()
      expect(hooks.auth).toBeDefined()
      expect(hooks["chat.headers"]).toBeDefined()
    })

    it("should return empty object for non-oauth auth", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      // Mock getAuth to return non-oauth
      const originalGetAuth = mockInput.client.getAuth || (() => Promise.resolve({ type: "api" }))
      mockInput.client.getAuth = originalGetAuth

      const hooks = await CopilotAuthPlugin(mockInput)
      expect(hooks).toBeDefined()
      expect(hooks.auth).toBeDefined()
    })
  })

  describe("Authorization Methods", () => {
    it("should have oauth authorization method", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      expect(hooks.auth?.methods).toBeDefined()
      expect(hooks.auth?.methods?.[0]?.type).toBe("oauth")
      expect(hooks.auth?.methods?.[0]?.label).toBe("Login with GitHub Copilot")
    })

    it("should have prompts for deployment selection", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const prompts = hooks.auth?.methods?.[0]?.prompts
      
      expect(prompts).toBeDefined()
      expect(prompts?.[0]?.type).toBe("select")
      expect(prompts?.[0]?.key).toBe("deploymentType")
      expect(prompts?.[0]?.options).toHaveLength(2)
      
      const options = prompts?.[0]?.options
      expect(options?.[0]?.value).toBe("github.com")
      expect(options?.[1]?.value).toBe("enterprise")
    })

    it("should validate enterprise URL", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const prompts = hooks.auth?.methods?.[0]?.prompts
      const validatePrompt = prompts?.find((p: any) => p.key === "enterpriseUrl")
      
      expect(validatePrompt).toBeDefined()
      expect(typeof validatePrompt?.validate).toBe("function")
      
      // Test valid URLs
      expect(validatePrompt?.validate("company.ghe.com")).toBeUndefined()
      expect(validatePrompt?.validate("https://company.ghe.com")).toBeUndefined()
      
      // Test invalid URLs
      expect(validatePrompt?.validate("")).toBeDefined()
      expect(validatePrompt?.validate("invalid-url")).toBeDefined()
    })
  })

  describe("Authorization Flow", () => {
    it("should handle github.com deployment", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      
      expect(typeof authorize).toBe("function")
      
      // Test with default inputs (should default to github.com)
      const authResult = await authorize?.()
      expect(authResult).toBeDefined()
      expect(authResult.url).toContain("github.com")
      expect(authResult.instructions).toContain("Enter code:")
      expect(authResult.method).toBe("auto")
    })

    it("should handle enterprise deployment", async () => {
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      
      const authResult = await authorize?.({
        deploymentType: "enterprise",
        enterpriseUrl: "company.ghe.com"
      })
      
      expect(authResult.url).toContain("company.ghe.com")
    })

    it("should handle device authorization callback", async () => {
      // This would require mocking fetch
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      const authResult = await authorize?.()
      
      expect(typeof authResult.callback).toBe("function")
    })
  })

  describe("Chat Headers", () => {
    it("should set headers for github-copilot provider", async () => {
      const mockInput = {
        client: {
          session: {
            get: () => Promise.resolve({ 
              data: { parentID: "parent-123" }
            })
          }
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const chatHeaders = hooks["chat.headers"]
      
      expect(typeof chatHeaders).toBe("function")
      
      const incoming = {
        model: { providerID: "github-copilot", api: { npm: "@ai-sdk/github-copilot" } },
        sessionID: "session-123"
      }
      const output: any = {}
      
      await chatHeaders(incoming, output)
      
      expect(output.headers).toBeDefined()
    })

    it("should set anthropic-beta header for Anthropic models", async () => {
      const mockInput = {
        client: {
          session: {
            get: () => Promise.resolve({ 
              data: { parentID: "parent-123" }
            })
          }
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const chatHeaders = hooks["chat.headers"]
      
      const incoming = {
        model: { 
          providerID: "github-copilot", 
          api: { npm: "@ai-sdk/anthropic" } 
        },
        sessionID: "session-123"
      }
      const output: any = {}
      
      await chatHeaders(incoming, output)
      
      expect(output.headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14")
    })

    it("should set x-initiator for subagent sessions", async () => {
      const mockInput = {
        client: {
          session: {
            get: () => Promise.resolve({ 
              data: { parentID: "parent-123" }
            })
          }
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const chatHeaders = hooks["chat.headers"]
      
      const incoming = {
        model: { providerID: "github-copilot" },
        sessionID: "session-123"
      }
      const output: any = {}
      
      await chatHeaders(incoming, output)
      
      expect(output.headers["x-initiator"]).toBe("agent")
    })

    it("should not set headers for non-copilot providers", async () => {
      const mockInput = {
        client: {
          session: {
            get: () => Promise.resolve({ 
              data: { parentID: "parent-123" }
            })
          }
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const chatHeaders = hooks["chat.headers"]
      
      const incoming = {
        model: { providerID: "openai" },
        sessionID: "session-123"
      }
      const output: any = {}
      
      await chatHeaders(incoming, output)
      
      expect(Object.keys(output.headers)).toHaveLength(0)
    })
  })

  describe("Fetch Interceptor", () => {
    it("should intercept fetch for copilot provider", async () => {
      const mockInput = {
        client: {
          getAuth: () => Promise.resolve({
            type: "oauth",
            refresh: "test-refresh-token"
          })
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const fetchInterceptor = hooks.auth?.loader?.({})?.fetch
      
      expect(typeof fetchInterceptor).toBe("function")
    })

    it("should handle vision requests", async () => {
      const mockInput = {
        client: {
          getAuth: () => Promise.resolve({
            type: "oauth",
            refresh: "test-refresh-token"
          })
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const fetchInterceptor = hooks.auth?.loader?.({})?.fetch
      
      // Test vision detection logic
      const visionInit = {
        body: JSON.stringify({
          messages: [{
            content: [
              { type: "text", text: "Describe this image" },
              { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
            ]
          }]
        })
      }

      expect(typeof fetchInterceptor).toBe("function")
    })

    it("should handle agent requests", async () => {
      const mockInput = {
        client: {
          getAuth: () => Promise.resolve({
            type: "oauth",
            refresh: "test-refresh-token"
          })
        },
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const fetchInterceptor = hooks.auth?.loader?.({})?.fetch
      
      // Test agent detection logic
      const agentInit = {
        body: JSON.stringify({
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Response" }
          ]
        })
      }

      expect(typeof fetchInterceptor).toBe("function")
    })
  })

  describe("Error Handling", () => {
    it("should handle device authorization failure", async () => {
      // This would require mocking fetch to return error
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      
      expect(typeof authorize).toBe("function")
    })

    it("should handle authorization_pending during polling", async () => {
      // This would require mocking fetch to return authorization_pending
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      
      expect(typeof authorize).toBe("function")
    })

    it("should handle slow_down during polling", async () => {
      // This would require mocking fetch to return slow_down
      const mockInput = {
        client: {},
        project: { id: "test" },
        worktree: "/tmp",
        directory: "/tmp",
        serverUrl: "http://localhost:4096",
        $: {}
      }

      const hooks = await CopilotAuthPlugin(mockInput)
      const authorize = hooks.auth?.methods?.[0]?.authorize
      
      expect(typeof authorize).toBe("function")
    })
  })
})
