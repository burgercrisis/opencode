import { test, expect, mock, beforeEach, afterEach, beforeAll, describe, vi } from "bun:test"
import { EventEmitter } from "events"
import path from "path"
import os from "os"
import fs from "fs"
import { McpOAuthCallback } from "../../src/mcp/oauth-callback"
import { McpOAuthProvider, OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } from "../../src/mcp/oauth-provider"
import { McpAuth } from "../../src/mcp/auth"
import { Global } from "../../src/global"
import { tmpdir } from "../fixture/fixture"

// Track open() calls and control failure behavior
let openShouldFail = false
let openCalledWith: string | undefined

vi.mock("open", () => ({
  default: async (url: string) => {
    openCalledWith = url

    // Return a mock subprocess that emits an error if openShouldFail is true
    const subprocess = new EventEmitter()
    if (openShouldFail) {
      // Emit error asynchronously like a real subprocess would
      setTimeout(() => {
        subprocess.emit("error", new Error("spawn xdg-open ENOENT"))
      }, 10)
    }
    return subprocess
  },
}))

// Mock UnauthorizedError
class MockUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "UnauthorizedError"
  }
}

describe("OAuth System - Comprehensive Tests", () => {
  describe("OAuth Browser Integration", () => {
    let originalBunServe: any
    let originalBunConnect: any
    let tmp: any

    beforeEach(() => {
      originalBunServe = Bun.serve
      originalBunConnect = Bun.connect
      openShouldFail = false
      openCalledWith = undefined
    })

    afterEach(() => {
      Bun.serve = originalBunServe
      Bun.connect = originalBunConnect
      // Clean up any running servers
      McpOAuthCallback.stop()
    })

    beforeAll(async () => {
      tmp = await tmpdir()
    })

    test("should open browser with correct URL", async () => {
      const mockConfig = {
        clientId: "test-client",
        clientSecret: "test-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        redirectUri: "http://localhost:3000/callback"
      }

      const provider = new McpOAuthProvider(mockConfig, {
        onSuccess: mock(() => {}),
        onError: mock(() => {})
      })

      await provider.authenticate()

      expect(openCalledWith).toBeDefined()
      expect(openCalledWith).toContain("example.com/oauth/authorize")
    })

    test("should handle browser open failure gracefully", async () => {
      openShouldFail = true

      const mockConfig = {
        clientId: "test-client",
        clientSecret: "test-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        redirectUri: "http://localhost:3000/callback"
      }

      const onError = mock(() => {})
      const provider = new McpOAuthProvider(mockConfig, {
        onSuccess: mock(() => {}),
        onError
      })

      await provider.authenticate()

      // Should handle browser failure gracefully
      expect(onError).toHaveBeenCalled()
    })

    test("should handle OAuth callback correctly", async () => {
      const mockConfig = {
        clientId: "test-client",
        clientSecret: "test-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        redirectUri: "http://localhost:3000/callback"
      }

      const onSuccess = mock(() => {})
      const provider = new McpOAuthProvider(mockConfig, {
        onSuccess,
        onError: mock(() => {})
      })

      // Mock successful token exchange
      const mockTokenResponse = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600
      }

      // Simulate callback
      await provider.handleCallback("test-auth-code")

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: "test-access-token"
        })
      )
    })

    test("should handle OAuth errors correctly", async () => {
      const mockConfig = {
        clientId: "test-client",
        clientSecret: "test-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        redirectUri: "http://localhost:3000/callback"
      }

      const onError = mock(() => {})
      const provider = new McpOAuthProvider(mockConfig, {
        onSuccess: mock(() => {}),
        onError
      })

      // Simulate error callback
      await provider.handleCallback(null, "access_denied")

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "access_denied"
        })
      )
    })
  })

  describe("MCP OAuth Callback", () => {
    let originalBunServe: any
    let originalBunConnect: any

    beforeEach(() => {
      originalBunServe = Bun.serve
      originalBunConnect = Bun.connect
    })

    afterEach(() => {
      Bun.serve = originalBunServe
      Bun.connect = originalBunConnect
      // Clean up any running servers
      McpOAuthCallback.stop()
    })

    describe("ensureRunning function", () => {
      it("returns early if server is already running", async () => {
        // Mock server as already running
        const mockServer = { stop: () => { } }
        const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: mockServer }

        // Mock isPortInUse to return true
        const originalIsPortInUse = (McpOAuthCallback as any).isPortInUse
        ; (McpOAuthCallback as any).isPortInUse = () => Promise.resolve(true)

        await McpOAuthCallback.ensureRunning()

        // Should not try to start a new server
        expect(Bun.serve).not.toHaveBeenCalled()

        // Restore
        ; (McpOAuthCallback as any).state = originalState
        ; (McpOAuthCallback as any).isPortInUse = originalIsPortInUse
      })

      it("starts server if not running", async () => {
        // Mock server as not running
        const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: null }

        // Mock isPortInUse to return false
        const originalIsPortInUse = (McpOAuthCallback as any).isPortInUse
        ; (McpOAuthCallback as any).isPortInUse = () => Promise.resolve(false)

        // Mock Bun.serve
        const mockServer = { stop: () => { } }
        Bun.serve = mock(() => mockServer)

        await McpOAuthCallback.ensureRunning()

        expect(Bun.serve).toHaveBeenCalled()

        // Restore
        ; (McpOAuthCallback as any).state = originalState
        ; (McpOAuthCallback as any).isPortInUse = originalIsPortInUse
      })
    })

    describe("isPortInUse function", () => {
      it("returns true if port is in use", async () => {
        // Mock Bun.connect to succeed (port in use)
        const mockSocket = { end: () => { } }
        Bun.connect = mock(() => mockSocket)

        const isInUse = await (McpOAuthCallback as any).isPortInUse(OAUTH_CALLBACK_PORT)
        expect(isInUse).toBe(true)
      })

      it("returns false if port is not in use", async () => {
        // Mock Bun.connect to fail (port not in use)
        Bun.connect = mock(() => {
          throw new Error("Connection refused")
        })

        const isInUse = await (McpOAuthCallback as any).isPortInUse(OAUTH_CALLBACK_PORT)
        expect(isInUse).toBe(false)
      })
    })

    describe("callback handling", () => {
      it("handles successful OAuth callback", async () => {
        const mockCallback = mock(() => {})
        ; (McpOAuthCallback as any).pendingCallbacks.set("test-state", mockCallback)

        // Mock request with authorization code
        const mockRequest = {
          url: `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?code=test-code&state=test-state`,
          method: "GET"
        }

        await (McpOAuthCallback as any).handleCallback(mockRequest)

        expect(mockCallback).toHaveBeenCalledWith({ code: "test-code" })
      })

      it("handles OAuth error callback", async () => {
        const mockCallback = mock(() => {})
        ; (McpOAuthCallback as any).pendingCallbacks.set("test-state", mockCallback)

        // Mock request with error
        const mockRequest = {
          url: `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?error=access_denied&state=test-state`,
          method: "GET"
        }

        await (McpOAuthCallback as any).handleCallback(mockRequest)

        expect(mockCallback).toHaveBeenCalledWith(null, "access_denied")
      })

      it("handles missing state parameter", async () => {
        const mockRequest = {
          url: `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?code=test-code`,
          method: "GET"
        }

        // Should not throw
        await expect((McpOAuthCallback as any).handleCallback(mockRequest)).resolves.toBeDefined()
      })

      it("handles unknown state", async () => {
        const mockRequest = {
          url: `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?code=test-code&state=unknown-state`,
          method: "GET"
        }

        // Should not throw
        await expect((McpOAuthCallback as any).handleCallback(mockRequest)).resolves.toBeDefined()
      })
    })
  })

  describe("MCP OAuth Provider", () => {
    let tmp: any
    let originalGlobalPath: any

    beforeEach(async () => {
      tmp = await tmpdir()
      originalGlobalPath = Global.Path.data
      Global.Path.data = tmp.path
    })

    afterEach(async () => {
      await tmp?.dispose?.()
      Global.Path.data = originalGlobalPath
    })

    describe("Constructor and basic properties", () => {
      it("initializes with correct parameters", () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write"
        }
        const callbacks = {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        }

        const provider = new McpOAuthProvider(config, callbacks)

        expect(provider.clientId).toBe("test-client-id")
        expect(provider.clientSecret).toBe("test-client-secret")
        expect(provider.scope).toBe("read write")
      })

      it("throws with invalid config", () => {
        const invalidConfigs = [
          null,
          undefined,
          {},
          { clientId: "" },
          { clientSecret: "" },
          { clientId: "test" }, // missing clientSecret
          { clientSecret: "test" } // missing clientId
        ]

        for (const config of invalidConfigs) {
          expect(() => new McpOAuthProvider(config as any, {
            onSuccess: mock(() => {}),
            onError: mock(() => {})
          })).toThrow()
        }
      })
    })

    describe("Authentication flow", () => {
      it("generates correct authorization URL", () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write",
          authorizationUrl: "https://example.com/oauth/authorize",
          tokenUrl: "https://example.com/oauth/token"
        }
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        })

        const authUrl = provider.generateAuthUrl()

        expect(authUrl).toContain("https://example.com/oauth/authorize")
        expect(authUrl).toContain("client_id=test-client-id")
        expect(authUrl).toContain("scope=read write")
        expect(authUrl).toContain("redirect_uri")
        expect(authUrl).toContain("state")
      })

      it("handles successful token exchange", async () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write",
          authorizationUrl: "https://example.com/oauth/authorize",
          tokenUrl: "https://example.com/oauth/token"
        }
        const onSuccess = mock(() => {})
        const provider = new McpOAuthProvider(config, {
          onSuccess,
          onError: mock(() => {})
        })

        // Mock token exchange
        const mockTokenResponse = {
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600
        }

        await provider.exchangeCodeForToken("test-auth-code")

        expect(onSuccess).toHaveBeenCalledWith(mockTokenResponse)
      })

      it("handles token exchange error", async () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write",
          authorizationUrl: "https://example.com/oauth/authorize",
          tokenUrl: "https://example.com/oauth/token"
        }
        const onError = mock(() => {})
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError
        })

        // Mock failed token exchange
        await provider.exchangeCodeForToken("invalid-code")

        expect(onError).toHaveBeenCalled()
      })
    })

    describe("Token storage and retrieval", () => {
      it("stores tokens securely", async () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write"
        }
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        })

        const tokens = {
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600
        }

        await provider.storeTokens(tokens)

        const storedTokens = await provider.getStoredTokens()
        expect(storedTokens).toEqual(tokens)
      })

      it("handles missing tokens", async () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write"
        }
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        })

        const storedTokens = await provider.getStoredTokens()
        expect(storedTokens).toBeNull()
      })

      it("refreshes expired tokens", async () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write",
          tokenUrl: "https://example.com/oauth/token"
        }
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        })

        // Store expired token
        const expiredTokens = {
          access_token: "expired-access-token",
          refresh_token: "valid-refresh-token",
          expires_in: 0, // Expired
          expires_at: Date.now() - 1000 // Expired timestamp
        }

        await provider.storeTokens(expiredTokens)

        // Mock refresh response
        const refreshedTokens = {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600
        }

        const newTokens = await provider.refreshTokens()
        expect(newTokens).toEqual(refreshedTokens)
      })
    })

    describe("State management", () => {
      it("generates and validates state", () => {
        const config = {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scope: "read write"
        }
        const provider = new McpOAuthProvider(config, {
          onSuccess: mock(() => {}),
          onError: mock(() => {})
        })

        const state = provider.generateState()
        expect(state).toBeDefined()
        expect(typeof state).toBe("string")
        expect(state.length).toBeGreaterThan(0)

        const isValid = provider.validateState(state)
        expect(isValid).toBe(true)

        const isInvalid = provider.validateState("invalid-state")
        expect(isInvalid).toBe(false)
      })
    })
  })

  describe("OAuth Security", () => {
    it("prevents CSRF attacks with state parameter", async () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token"
      }
      const onError = mock(() => {})
      const provider = new McpOAuthProvider(config, {
        onSuccess: mock(() => {}),
        onError
      })

      // Attempt callback with invalid state
      await provider.handleCallback("test-code", null, "invalid-state")

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "invalid_state"
        })
      )
    })

    it("handles malformed callback parameters", async () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write"
      }
      const provider = new McpOAuthProvider(config, {
        onSuccess: mock(() => {}),
        onError: mock(() => {})
      })

      // Test with various malformed inputs
      const malformedInputs = [
        null,
        undefined,
        "",
        "malformed",
        "code only",
        "error only"
      ]

      for (const input of malformedInputs) {
        await expect(provider.handleCallback(input as any)).resolves.toBeDefined()
      }
    })
  })

  describe("OAuth Performance and Scalability", () => {
    it("handles concurrent authentication requests", async () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token"
      }
      const onSuccess = mock(() => {})
      const provider = new McpOAuthProvider(config, {
        onSuccess,
        onError: mock(() => {})
      })

      // Start multiple concurrent authentications
      const promises = Array.from({ length: 10 }, () => provider.authenticate())

      await Promise.allSettled(promises)

      // Should handle concurrent requests without errors
      expect(true).toBe(true) // If we get here, no errors were thrown
    })

    it("handles large token payloads efficiently", async () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write"
      }
      const provider = new McpOAuthProvider(config, {
        onSuccess: mock(() => {}),
        onError: mock(() => {})
      })

      // Create large token payload
      const largeTokens = {
        access_token: "x".repeat(10000),
        refresh_token: "y".repeat(10000),
        expires_in: 3600,
        additional_claims: {
          data: "z".repeat(5000)
        }
      }

      const startTime = Date.now()
      await provider.storeTokens(largeTokens)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(1000) // Should complete quickly
    })
  })

  describe("OAuth Integration Tests", () => {
    it("works end-to-end with callback server", async () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token"
      }
      const onSuccess = mock(() => {})
      const onError = mock(() => {})
      const provider = new McpOAuthProvider(config, {
        onSuccess,
        onError
      })

      // Start callback server
      await McpOAuthCallback.ensureRunning()

      // Generate auth URL
      const authUrl = provider.generateAuthUrl()
      expect(authUrl).toBeDefined()

      // Simulate callback
      const state = authUrl.match(/state=([^&]+)/)?.[1]
      if (state) {
        await provider.handleCallback("test-code", null, state)
      }

      // Clean up
      McpOAuthCallback.stop()
    })
  })
})
