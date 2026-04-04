import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { McpAuth } from "../auth"
import { Global } from "../../global"
import { tmpdir } from "../../../test/fixture/fixture"
import path from "path"
import { Filesystem } from "../../util/filesystem"

describe("MCP Auth - Comprehensive Coverage Tests", () => {
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

  describe("get function", () => {
    it("returns undefined when no auth data exists", async () => {
      const result = await McpAuth.get("nonexistent-server")
      expect(result).toBeUndefined()
    })

    it("returns existing auth entry", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: {
            accessToken: "test-token",
            refreshToken: "refresh-token",
            expiresAt: 1234567890,
            scope: "read write"
          },
          clientInfo: {
            clientId: "client-id",
            clientSecret: "client-secret",
            clientIdIssuedAt: 1234567890,
            clientSecretExpiresAt: 1234567890
          },
          codeVerifier: "verifier",
          oauthState: "state",
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const result = await McpAuth.get("test-server")
      expect(result).toEqual(testData["test-server"])
    })

    it("handles malformed JSON gracefully", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      await Bun.write(authFile, "invalid json")

      const result = await McpAuth.get("test-server")
      expect(result).toBeUndefined()
    })
  })

  describe("getForUrl function", () => {
    it("returns undefined when no auth data exists", async () => {
      const result = await McpAuth.getForUrl("nonexistent-server", "https://example.com")
      expect(result).toBeUndefined()
    })

    it("returns undefined when serverUrl is not stored", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: { accessToken: "test-token" }
          // Missing serverUrl
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const result = await McpAuth.getForUrl("test-server", "https://example.com")
      expect(result).toBeUndefined()
    })

    it("returns undefined when serverUrl has changed", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: { accessToken: "test-token" },
          serverUrl: "https://old-url.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const result = await McpAuth.getForUrl("test-server", "https://new-url.com")
      expect(result).toBeUndefined()
    })

    it("returns entry when serverUrl matches", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "test-server": {
          tokens: { accessToken: "test-token" },
          serverUrl: "https://example.com"
        }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const result = await McpAuth.getForUrl("test-server", "https://example.com")
      expect(result).toEqual(testData["test-server"])
    })
  })

  describe("all function", () => {
    it("returns empty object when no auth file exists", async () => {
      const result = await McpAuth.all()
      expect(result).toEqual({})
    })

    it("returns all auth data", async () => {
      const authFile = path.join(tmp.path, "mcp-auth.json")
      const testData = {
        "server1": { tokens: { accessToken: "token1" } },
        "server2": { tokens: { accessToken: "token2" } },
        "server3": { tokens: { accessToken: "token3" } }
      }
      await Bun.write(authFile, JSON.stringify(testData))

      const result = await McpAuth.all()
      expect(result).toEqual(testData)
    })

    it("handles file read errors gracefully", async () => {
      // Mock Filesystem.readJson to throw an error
      const originalReadJson = Filesystem.readJson
      Filesystem.readJson = () => Promise.reject(new Error("Read error"))

      const result = await McpAuth.all()
      expect(result).toEqual({})

      Filesystem.readJson = originalReadJson
    })
  })

  describe("set function", () => {
    it("creates new auth entry", async () => {
      const entry = {
        tokens: { accessToken: "new-token" },
        clientInfo: { clientId: "new-client" }
      }
      const serverUrl = "https://new-server.com"

      await McpAuth.set("new-server", entry, serverUrl)

      const result = await McpAuth.get("new-server")
      expect(result.tokens).toEqual(entry.tokens)
      expect(result.clientInfo).toEqual(entry.clientInfo)
      expect(result.serverUrl).toBe(serverUrl)
    })

    it("updates existing auth entry", async () => {
      // Create initial entry
      const initialEntry = {
        tokens: { accessToken: "initial-token" },
        clientInfo: { clientId: "initial-client" }
      }
      await McpAuth.set("test-server", initialEntry, "https://initial.com")

      // Update entry
      const updatedEntry = {
        tokens: { accessToken: "updated-token" },
        clientInfo: { clientId: "updated-client" }
      }
      await McpAuth.set("test-server", updatedEntry, "https://updated.com")

      const result = await McpAuth.get("test-server")
      expect(result.tokens).toEqual(updatedEntry.tokens)
      expect(result.clientInfo).toEqual(updatedEntry.clientInfo)
      expect(result.serverUrl).toBe("https://updated.com")
    })

    it("updates serverUrl when provided", async () => {
      const entry = { tokens: { accessToken: "token" } }
      const initialUrl = "https://initial.com"
      const newUrl = "https://new.com"

      // Set with initial URL
      await McpAuth.set("test-server", entry, initialUrl)

      // Update with new URL
      await McpAuth.set("test-server", entry, newUrl)

      const result = await McpAuth.get("test-server")
      expect(result.serverUrl).toBe(newUrl)
    })

    it("preserves existing data when updating partial entry", async () => {
      const initialEntry = {
        tokens: { accessToken: "token" },
        clientInfo: { clientId: "client" },
        codeVerifier: "verifier",
        oauthState: "state"
      }
      await McpAuth.set("test-server", initialEntry)

      // Update only tokens
      const updatedTokens = { accessToken: "new-token" }
      await McpAuth.set("test-server", { tokens: updatedTokens })

      const result = await McpAuth.get("test-server")
      expect(result.tokens).toEqual(updatedTokens)
      expect(result.clientInfo).toEqual(initialEntry.clientInfo)
      expect(result.codeVerifier).toBe(initialEntry.codeVerifier)
      expect(result.oauthState).toBe(initialEntry.oauthState)
    })

    it("writes file with correct permissions", async () => {
      const entry = { tokens: { accessToken: "test-token" } }

      // Mock Filesystem.writeJson to capture the mode parameter
      let capturedMode: number | undefined
      const originalWriteJson = Filesystem.writeJson
      Filesystem.writeJson = (filepath: string, data: any, mode?: number) => {
        capturedMode = mode
        return originalWriteJson(filepath, data, mode)
      }

      await McpAuth.set("test-server", entry)

      expect(capturedMode).toBe(0o600)

      Filesystem.writeJson = originalWriteJson
    })
  })

  describe("remove function", () => {
    it("removes existing auth entry", async () => {
      // Create initial entry
      const entry = { tokens: { accessToken: "test-token" } }
      await McpAuth.set("test-server", entry)

      // Verify it exists
      let result = await McpAuth.get("test-server")
      expect(result).toBeDefined()

      // Remove it
      await McpAuth.remove("test-server")

      // Verify it's gone
      result = await McpAuth.get("test-server")
      expect(result).toBeUndefined()
    })

    it("handles removing non-existent entry", async () => {
      // Should not throw
      await McpAuth.remove("non-existent-server")

      const result = await McpAuth.all()
      expect(result).toEqual({})
    })
  })

  describe("updateTokens function", () => {
    it("updates tokens for existing entry", async () => {
      // Create initial entry
      const initialEntry = {
        tokens: { accessToken: "initial-token" },
        clientInfo: { clientId: "client" }
      }
      await McpAuth.set("test-server", initialEntry)

      // Update tokens
      const newTokens = {
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: 1234567890,
        scope: "new-scope"
      }
      await McpAuth.updateTokens("test-server", newTokens)

      const result = await McpAuth.get("test-server")
      expect(result.tokens).toEqual(newTokens)
      expect(result.clientInfo).toEqual(initialEntry.clientInfo) // Should preserve other data
    })

    it("creates new entry when none exists", async () => {
      const newTokens = { accessToken: "new-token" }
      await McpAuth.updateTokens("new-server", newTokens)

      const result = await McpAuth.get("new-server")
      expect(result.tokens).toEqual(newTokens)
    })

    it("updates serverUrl when provided", async () => {
      const tokens = { accessToken: "token" }
      const serverUrl = "https://example.com"

      await McpAuth.updateTokens("test-server", tokens, serverUrl)

      const result = await McpAuth.get("test-server")
      expect(result.serverUrl).toBe(serverUrl)
    })
  })

  describe("updateClientInfo function", () => {
    it("updates client info for existing entry", async () => {
      // Create initial entry
      const initialEntry = {
        tokens: { accessToken: "token" },
        clientInfo: { clientId: "initial-client" }
      }
      await McpAuth.set("test-server", initialEntry)

      // Update client info
      const newClientInfo = {
        clientId: "new-client",
        clientSecret: "new-secret",
        clientIdIssuedAt: 1234567890,
        clientSecretExpiresAt: 1234567890
      }
      await McpAuth.updateClientInfo("test-server", newClientInfo)

      const result = await McpAuth.get("test-server")
      expect(result.clientInfo).toEqual(newClientInfo)
      expect(result.tokens).toEqual(initialEntry.tokens) // Should preserve other data
    })

    it("creates new entry when none exists", async () => {
      const newClientInfo = { clientId: "new-client" }
      await McpAuth.updateClientInfo("new-server", newClientInfo)

      const result = await McpAuth.get("new-server")
      expect(result.clientInfo).toEqual(newClientInfo)
    })

    it("updates serverUrl when provided", async () => {
      const clientInfo = { clientId: "client" }
      const serverUrl = "https://example.com"

      await McpAuth.updateClientInfo("test-server", clientInfo, serverUrl)

      const result = await McpAuth.get("test-server")
      expect(result.serverUrl).toBe(serverUrl)
    })
  })

  describe("updateCodeVerifier function", () => {
    it("updates code verifier for existing entry", async () => {
      // Create initial entry
      const initialEntry = {
        tokens: { accessToken: "token" },
        clientInfo: { clientId: "client" }
      }
      await McpAuth.set("test-server", initialEntry)

      // Update code verifier
      const codeVerifier = "new-verifier"
      await McpAuth.updateCodeVerifier("test-server", codeVerifier)

      const result = await McpAuth.get("test-server")
      expect(result.codeVerifier).toBe(codeVerifier)
      expect(result.tokens).toEqual(initialEntry.tokens) // Should preserve other data
      expect(result.clientInfo).toEqual(initialEntry.clientInfo)
    })

    it("creates new entry when none exists", async () => {
      const codeVerifier = "new-verifier"
      await McpAuth.updateCodeVerifier("new-server", codeVerifier)

      const result = await McpAuth.get("new-server")
      expect(result.codeVerifier).toBe(codeVerifier)
    })
  })

  describe("clearCodeVerifier function", () => {
    it("clears code verifier for existing entry", async () => {
      // Create initial entry with code verifier
      const initialEntry = {
        tokens: { accessToken: "token" },
        codeVerifier: "verifier"
      }
      await McpAuth.set("test-server", initialEntry)

      // Verify it exists
      let result = await McpAuth.get("test-server")
      expect(result.codeVerifier).toBe("verifier")

      // Clear it
      await McpAuth.clearCodeVerifier("test-server")

      // Verify it's gone
      result = await McpAuth.get("test-server")
      expect(result.codeVerifier).toBeUndefined()
      expect(result.tokens).toEqual(initialEntry.tokens) // Should preserve other data
    })

    it("handles clearing non-existent entry", async () => {
      // Should not throw
      await McpAuth.clearCodeVerifier("non-existent-server")
    })

    it("handles entry without code verifier", async () => {
      // Create entry without code verifier
      const entry = { tokens: { accessToken: "token" } }
      await McpAuth.set("test-server", entry)

      // Should not throw
      await McpAuth.clearCodeVerifier("test-server")

      const result = await McpAuth.get("test-server")
      expect(result.codeVerifier).toBeUndefined()
    })
  })

  describe("updateOAuthState function", () => {
    it("updates OAuth state for existing entry", async () => {
      // Create initial entry
      const initialEntry = {
        tokens: { accessToken: "token" },
        clientInfo: { clientId: "client" }
      }
      await McpAuth.set("test-server", initialEntry)

      // Update OAuth state
      const oauthState = "new-state"
      await McpAuth.updateOAuthState("test-server", oauthState)

      const result = await McpAuth.get("test-server")
      expect(result.oauthState).toBe(oauthState)
      expect(result.tokens).toEqual(initialEntry.tokens) // Should preserve other data
      expect(result.clientInfo).toEqual(initialEntry.clientInfo)
    })

    it("creates new entry when none exists", async () => {
      const oauthState = "new-state"
      await McpAuth.updateOAuthState("new-server", oauthState)

      const result = await McpAuth.get("new-server")
      expect(result.oauthState).toBe(oauthState)
    })
  })

  describe("getOAuthState function", () => {
    it("returns OAuth state for existing entry", async () => {
      const oauthState = "test-state"
      const entry = { oauthState }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.getOAuthState("test-server")
      expect(result).toBe(oauthState)
    })

    it("returns undefined for non-existent entry", async () => {
      const result = await McpAuth.getOAuthState("non-existent-server")
      expect(result).toBeUndefined()
    })

    it("returns undefined when OAuth state is not set", async () => {
      const entry = { tokens: { accessToken: "token" } }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.getOAuthState("test-server")
      expect(result).toBeUndefined()
    })
  })

  describe("clearOAuthState function", () => {
    it("clears OAuth state for existing entry", async () => {
      // Create initial entry with OAuth state
      const initialEntry = {
        tokens: { accessToken: "token" },
        oauthState: "state"
      }
      await McpAuth.set("test-server", initialEntry)

      // Verify it exists
      let result = await McpAuth.get("test-server")
      expect(result.oauthState).toBe("state")

      // Clear it
      await McpAuth.clearOAuthState("test-server")

      // Verify it's gone
      result = await McpAuth.get("test-server")
      expect(result.oauthState).toBeUndefined()
      expect(result.tokens).toEqual(initialEntry.tokens) // Should preserve other data
    })

    it("handles clearing non-existent entry", async () => {
      // Should not throw
      await McpAuth.clearOAuthState("non-existent-server")
    })

    it("handles entry without OAuth state", async () => {
      // Create entry without OAuth state
      const entry = { tokens: { accessToken: "token" } }
      await McpAuth.set("test-server", entry)

      // Should not throw
      await McpAuth.clearOAuthState("test-server")

      const result = await McpAuth.get("test-server")
      expect(result.oauthState).toBeUndefined()
    })
  })

  describe("isTokenExpired function", () => {
    beforeEach(() => {
      // Mock current time
      const mockTime = 1234567890
      const originalDateNow = Date.now
      Date.now = () => mockTime * 1000 // Convert to milliseconds
    })

    afterEach(() => {
      // Restore Date.now
      const originalDateNow = Date.now
      Date.now = originalDateNow
    })

    it("returns null when no entry exists", async () => {
      const result = await McpAuth.isTokenExpired("non-existent-server")
      expect(result).toBeNull()
    })

    it("returns null when no tokens exist", async () => {
      const entry = { clientInfo: { clientId: "client" } }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.isTokenExpired("test-server")
      expect(result).toBeNull()
    })

    it("returns false when tokens have no expiry", async () => {
      const entry = {
        tokens: { accessToken: "token" } // No expiresAt
      }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.isTokenExpired("test-server")
      expect(result).toBe(false)
    })

    it("returns false when tokens are not expired", async () => {
      const entry = {
        tokens: {
          accessToken: "token",
          expiresAt: 1234567900 // Future time
        }
      }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.isTokenExpired("test-server")
      expect(result).toBe(false)
    })

    it("returns true when tokens are expired", async () => {
      const entry = {
        tokens: {
          accessToken: "token",
          expiresAt: 1234567880 // Past time
        }
      }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.isTokenExpired("test-server")
      expect(result).toBe(true)
    })

    it("returns false when expiry time is exactly current time", async () => {
      const entry = {
        tokens: {
          accessToken: "token",
          expiresAt: 1234567890 // Current time
        }
      }
      await McpAuth.set("test-server", entry)

      const result = await McpAuth.isTokenExpired("test-server")
      expect(result).toBe(false)
    })
  })

  describe("Schema validation", () => {
    it("validates tokens schema correctly", () => {
      const validTokens = {
        accessToken: "test-token",
        refreshToken: "refresh-token",
        expiresAt: 1234567890,
        scope: "read write"
      }

      expect(() => McpAuth.Tokens.parse(validTokens)).not.toThrow()
      expect(McpAuth.Tokens.safeParse(validTokens).success).toBe(true)
    })

    it("rejects invalid tokens schema", () => {
      const invalidTokens = {
        // Missing required accessToken
        refreshToken: "refresh-token"
      }

      expect(() => McpAuth.Tokens.parse(invalidTokens)).toThrow()
      expect(McpAuth.Tokens.safeParse(invalidTokens).success).toBe(false)
    })

    it("validates clientInfo schema correctly", () => {
      const validClientInfo = {
        clientId: "test-client",
        clientSecret: "test-secret",
        clientIdIssuedAt: 1234567890,
        clientSecretExpiresAt: 1234567890
      }

      expect(() => McpAuth.ClientInfo.parse(validClientInfo)).not.toThrow()
      expect(McpAuth.ClientInfo.safeParse(validClientInfo).success).toBe(true)
    })

    it("rejects invalid clientInfo schema", () => {
      const invalidClientInfo = {
        // Missing required clientId
        clientSecret: "test-secret"
      }

      expect(() => McpAuth.ClientInfo.parse(invalidClientInfo)).toThrow()
      expect(McpAuth.ClientInfo.safeParse(invalidClientInfo).success).toBe(false)
    })

    it("validates entry schema correctly", () => {
      const validEntry = {
        tokens: { accessToken: "test-token" },
        clientInfo: { clientId: "test-client" },
        codeVerifier: "verifier",
        oauthState: "state",
        serverUrl: "https://example.com"
      }

      expect(() => McpAuth.Entry.parse(validEntry)).not.toThrow()
      expect(McpAuth.Entry.safeParse(validEntry).success).toBe(true)
    })

    it("allows all fields to be optional in entry", () => {
      const emptyEntry = {}

      expect(() => McpAuth.Entry.parse(emptyEntry)).not.toThrow()
      expect(McpAuth.Entry.safeParse(emptyEntry).success).toBe(true)
    })
  })
})
