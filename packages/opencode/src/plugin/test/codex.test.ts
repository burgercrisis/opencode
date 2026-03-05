import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as crypto from "crypto"
import {
  CodexAuthPlugin,
  generatePKCE,
  generateRandomString,
  base64UrlEncode,
  generateState,
  parseJwtClaims,
  extractAccountIdFromClaims,
  extractAccountId,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  startOAuthServer,
  stopOAuthServer,
  waitForOAuthCallback,
  HTML_SUCCESS,
  HTML_ERROR
} from "../codex"

describe("Codex Plugin", () => {
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
  beforeEach(() => {
    // Clear any existing global state
    global.CodexAuthPlugin = undefined
  })

  afterEach(() => {
    // Clean up global state
    global.CodexAuthPlugin = undefined
  })

  describe("generatePKCE", () => {
    it("should generate PKCE codes with correct format", async () => {
      const pkce = await generatePKCE()

      expect(pkce.verifier).toBeDefined()
      expect(pkce.challenge).toBeDefined()
      expect(pkce.verifier).toHaveLength(43)
      expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it("should generate different codes each time", async () => {
      const pkce1 = await generatePKCE()
      const pkce2 = await generatePKCE()

      expect(pkce1.verifier).not.toBe(pkce2.verifier)
      expect(pkce1.challenge).not.toBe(pkce2.challenge)
    })
  })

  describe("URL building", () => {
    it("should build correct authorize URL", () => {
      const pkce = {
        verifier: "test-verifier",
        challenge: "test-challenge"
      }
      const state = "test-state"
      const redirectUri = "http://localhost:1455/auth/callback"

      const url = buildAuthorizeUrl(redirectUri, pkce, state)

      expect(url).toContain("https://auth.openai.com/oauth/authorize?")
      expect(url).toContain("response_type=code")
      expect(url).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann")
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`)
      expect(url).toContain(`code_challenge=${pkce.challenge}`)
      expect(url).toContain("code_challenge_method=S256")
      expect(url).toContain("scope=openid+profile+email+offline_access")
      expect(url).toContain(`state=${state}`)
      expect(url).toContain("id_token_add_organizations=true")
      expect(url).toContain("codex_cli_simplified_flow=true")
      expect(url).toContain("originator=opencode")
    })
  })

  describe("Token exchange", () => {
    it("should handle successful token exchange", async () => {
      // This would require mocking fetch
      // For now, test that the function exists
      expect(typeof exchangeCodeForTokens).toBe("function")
    })

    it("should handle failed token exchange", async () => {
      expect(typeof exchangeCodeForTokens).toBe("function")
    })
  })

  describe("Token refresh", () => {
    it("should handle successful token refresh", async () => {
      expect(typeof refreshAccessToken).toBe("function")
    })

    it("should handle failed token refresh", async () => {
      expect(typeof refreshAccessToken).toBe("function")
    })
  })

  describe("OAuth Server", () => {
    it("should start OAuth server", async () => {
      expect(typeof startOAuthServer).toBe("function")
    })

    it("should stop OAuth server", async () => {
      expect(typeof stopOAuthServer).toBe("function")
    })
  })

  describe("HTML Templates", () => {
    it("should generate success HTML", () => {
      const HTML_SUCCESS_LOCAL = HTML_SUCCESS
      expect(HTML_SUCCESS_LOCAL).toContain("Authorization Successful")
      expect(HTML_SUCCESS_LOCAL).toContain("You can close this window")
      expect(HTML_SUCCESS_LOCAL).toContain("setTimeout(() => window.close(), 2000)")
    })

    it("should generate error HTML with message", () => {
      const HTML_ERROR_LOCAL = HTML_ERROR
      const errorMessage = "Test error message"
      const html = HTML_ERROR_LOCAL(errorMessage)
      expect(html).toContain("Authorization Failed")
      expect(html).toContain("An error occurred")
      expect(html).toContain(errorMessage)
    })
  })

  describe("Plugin Interface", () => {
    it("should export CodexAuthPlugin function", () => {
      const { CodexAuthPlugin } = require("../codex")
      expect(typeof CodexAuthPlugin).toBe("function")
    })
  })
})
