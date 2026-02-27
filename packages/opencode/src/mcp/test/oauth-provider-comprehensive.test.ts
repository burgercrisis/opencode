import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { McpOAuthProvider, OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } from "../oauth-provider"
import { McpAuth } from "../auth"
import { Global } from "../../global"
import { tmpdir } from "../../../test/fixture/fixture"
import path from "path"

describe("MCP OAuth Provider - Comprehensive Coverage Tests", () => {
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
        onRedirect: async (url: URL) => { }
      }

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        config,
        callbacks
      )

      expect(provider).toBeDefined()
    })

    it("returns correct redirect URL", () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const redirectUrl = provider.redirectUrl
      expect(redirectUrl).toBe(`http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`)
    })

    it("returns correct client metadata", () => {
      const config = { clientSecret: "secret" }
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        config,
        { onRedirect: async () => { } }
      )

      const metadata = provider.clientMetadata
      expect(metadata.redirect_uris).toEqual([provider.redirectUrl])
      expect(metadata.client_name).toBe("OpenCode")
      expect(metadata.client_uri).toBe("https://opencode.ai")
      expect(metadata.grant_types).toEqual(["authorization_code", "refresh_token"])
      expect(metadata.response_types).toEqual(["code"])
      expect(metadata.token_endpoint_auth_method).toBe("client_secret_post")
    })

    it("uses 'none' auth method when no client secret", () => {
      const config = {}
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        config,
        { onRedirect: async () => { } }
      )

      const metadata = provider.clientMetadata
      expect(metadata.token_endpoint_auth_method).toBe("none")
    })
  })

  describe("clientInformation method", () => {
    it("returns config client ID when provided", async () => {
      const config = {
        clientId: "config-client-id",
        clientSecret: "config-client-secret"
      }
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        config,
        { onRedirect: async () => { } }
      )

      const clientInfo = await provider.clientInformation()
      expect(clientInfo).toEqual({
        client_id: "config-client-id",
        client_secret: "config-client-secret"
      })
    })

    it("returns stored client info when valid", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          clientInfo: {
            clientId: "stored-client-id",
            clientSecret: "stored-client-secret",
            clientIdIssuedAt: 1234567890,
            clientSecretExpiresAt: Date.now() / 1000 + 3600 // Expires in 1 hour
          },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const clientInfo = await provider.clientInformation()
      expect(clientInfo).toEqual({
        client_id: "stored-client-id",
        client_secret: "stored-client-secret"
      })
    })

    it("returns undefined when stored client secret is expired", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          clientInfo: {
            clientId: "expired-client-id",
            clientSecret: "expired-client-secret",
            clientIdIssuedAt: 1234567890,
            clientSecretExpiresAt: Date.now() / 1000 - 3600 // Expired 1 hour ago
          },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const clientInfo = await provider.clientInformation()
      expect(clientInfo).toBeUndefined()
    })

    it("returns undefined when server URL has changed", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          clientInfo: {
            clientId: "stored-client-id",
            clientSecret: "stored-client-secret"
          },
          serverUrl: "https://old-url.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://new-url.com", // Different URL
        {},
        { onRedirect: async () => { } }
      )

      const clientInfo = await provider.clientInformation()
      expect(clientInfo).toBeUndefined()
    })

    it("returns undefined when no client info exists", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const clientInfo = await provider.clientInformation()
      expect(clientInfo).toBeUndefined()
    })
  })

  describe("saveClientInformation method", () => {
    it("saves client information correctly", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const clientInfo = {
        client_id: "new-client-id",
        client_secret: "new-client-secret",
        client_id_issued_at: 1234567890,
        client_secret_expires_at: 1234567890 + 3600
      }

      await provider.saveClientInformation(clientInfo)

      const savedEntry = await McpAuth.get("test-server")
      expect(savedEntry?.clientInfo).toEqual({
        clientId: "new-client-id",
        clientSecret: "new-client-secret",
        clientIdIssuedAt: 1234567890,
        clientSecretExpiresAt: 1234567890 + 3600
      })
      expect(savedEntry?.serverUrl).toBe("https://example.com")
    })
  })

  describe("tokens method", () => {
    it("returns stored tokens when valid", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-access-token",
            refreshToken: "test-refresh-token",
            expiresAt: Date.now() / 1000 + 3600, // Expires in 1 hour
            scope: "read write"
          },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = await provider.tokens()
      expect(tokens).toEqual({
        access_token: "test-access-token",
        token_type: "Bearer",
        refresh_token: "test-refresh-token",
        expires_in: expect.any(Number),
        scope: "read write"
      })
      expect(tokens?.expires_in).toBeGreaterThan(0)
    })

    it("returns undefined when no tokens exist", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = await provider.tokens()
      expect(tokens).toBeUndefined()
    })

    it("returns undefined when server URL has changed", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-access-token",
            refreshToken: "test-refresh-token"
          },
          serverUrl: "https://old-url.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://new-url.com", // Different URL
        {},
        { onRedirect: async () => { } }
      )

      const tokens = await provider.tokens()
      expect(tokens).toBeUndefined()
    })

    it("calculates expires_in correctly", async () => {
      const futureExpiry = Date.now() / 1000 + 7200 // 2 hours from now
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-access-token",
            expiresAt: futureExpiry
          },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = await provider.tokens()
      expect(tokens?.expires_in).toBeGreaterThan(3600) // More than 1 hour
      expect(tokens?.expires_in).toBeLessThan(7200) // Less than 2 hours
    })

    it("returns undefined expires_in when not set", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-access-token",
            refreshToken: "test-refresh-token"
            // No expiresAt
          },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = await provider.tokens()
      expect(tokens?.expires_in).toBeUndefined()
    })
  })

  describe("saveTokens method", () => {
    it("saves tokens correctly", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = {
        access_token: "new-access-token",
        token_type: "Bearer",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
        scope: "read write"
      }

      await provider.saveTokens(tokens)

      const savedEntry = await McpAuth.get("test-server")
      expect(savedEntry?.tokens).toEqual({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: expect.any(Number),
        scope: "read write"
      })
      expect(savedEntry?.serverUrl).toBe("https://example.com")
    })

    it("handles tokens without expires_in", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const tokens = {
        access_token: "new-access-token",
        token_type: "Bearer"
        // No expires_in
      }

      await provider.saveTokens(tokens)

      const savedEntry = await McpAuth.get("test-server")
      expect(savedEntry?.tokens.expiresAt).toBeUndefined()
    })
  })

  describe("redirectToAuthorization method", () => {
    it("calls onRedirect callback", async () => {
      let redirectUrl: URL | undefined
      const callbacks = {
        onRedirect: async (url: URL) => {
          redirectUrl = url
        }
      }

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        callbacks
      )

      const authUrl = new URL("https://auth.example.com/authorize")
      await provider.redirectToAuthorization(authUrl)

      expect(redirectUrl).toBe(authUrl)
    })
  })

  describe("codeVerifier methods", () => {
    it("saves and retrieves code verifier", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const codeVerifier = "test-code-verifier"
      await provider.saveCodeVerifier(codeVerifier)

      const retrieved = await provider.codeVerifier()
      expect(retrieved).toBe(codeVerifier)
    })

    it("throws error when no code verifier saved", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      try {
        await provider.codeVerifier()
        expect(false).toBe(true) // Should throw
      } catch (error) {
        expect(error.message).toContain("No code verifier saved for MCP server: test-server")
      }
    })
  })

  describe("state methods", () => {
    it("saves and retrieves state", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      const state = "test-oauth-state"
      await provider.saveState(state)

      const retrieved = await provider.state()
      expect(retrieved).toBe(state)
    })

    it("throws error when no state saved", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      try {
        await provider.state()
        expect(false).toBe(true) // Should throw
      } catch (error) {
        expect(error.message).toContain("No OAuth state saved for MCP server: test-server")
      }
    })
  })

  describe("invalidateCredentials method", () => {
    beforeEach(async () => {
      // Set up test data
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-access-token",
            refreshToken: "test-refresh-token"
          },
          clientInfo: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret"
          },
          codeVerifier: "test-verifier",
          oauthState: "test-state",
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))
    })

    it("invalidates all credentials", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      await provider.invalidateCredentials("all")

      const entry = await McpAuth.get("test-server")
      expect(entry).toBeUndefined()
    })

    it("invalidates only client credentials", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      await provider.invalidateCredentials("client")

      const entry = await McpAuth.get("test-server")
      expect(entry?.clientInfo).toBeUndefined()
      expect(entry?.tokens).toBeDefined()
      expect(entry?.codeVerifier).toBeDefined()
      expect(entry?.oauthState).toBeDefined()
    })

    it("invalidates only tokens", async () => {
      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      await provider.invalidateCredentials("tokens")

      const entry = await McpAuth.get("test-server")
      expect(entry?.tokens).toBeUndefined()
      expect(entry?.clientInfo).toBeDefined()
      expect(entry?.codeVerifier).toBeDefined()
      expect(entry?.oauthState).toBeDefined()
    })

    it("handles invalidation when no entry exists", async () => {
      // Remove the entry first
      await McpAuth.remove("test-server")

      const provider = new McpOAuthProvider(
        "test-server",
        "https://example.com",
        {},
        { onRedirect: async () => { } }
      )

      // Should not throw
      await provider.invalidateCredentials("all")
      expect(true).toBe(true)
    })
  })

  describe("Constants", () => {
    it("exports correct constants", () => {
      expect(OAUTH_CALLBACK_PORT).toBe(19876)
      expect(OAUTH_CALLBACK_PATH).toBe("/mcp/oauth/callback")
    })
  })
})
