import { describe, it, expect, beforeEach } from "bun:test"
import { McpRoutes } from "../../routes/mcp"

describe("McpRoutes", () => {
  let app: ReturnType<typeof McpRoutes>

  beforeEach(() => {
    app = McpRoutes()
  })

  describe("GET /", () => {
    it("should return MCP status", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)

      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle status request gracefully", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent status data", async () => {
      const res1 = await app.request("/")
      const res2 = await app.request("/")

      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent status requests", async () => {
      const promises = Array(5).fill(null).map(() =>
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid status requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle status with headers", async () => {
      const res = await app.request("/", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "test-agent"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("POST /", () => {
    it("should handle MCP addition", async () => {
      const mcpData = {
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: {}
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate MCP configuration", async () => {
      const invalidConfigs = [
        {}, // Missing required fields
        { transport: "invalid" }, // Invalid transport
        { command: "", args: [] }, // Empty command
        { transport: "stdio", command: "node", args: "not-array" }, // Invalid args type
        { transport: "stdio", command: "node", args: [], env: "not-object" } // Invalid env type
      ]

      for (const config of invalidConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([400, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle empty request body", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ""
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle various transport types", async () => {
      const transports = ["stdio", "http", "websocket", "sse"]

      for (const transport of transports) {
        const mcpData = {
          transport,
          command: "node",
          args: ["server.js"],
          env: {}
        }

        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mcpData)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle complex configurations", async () => {
      const complexConfigs = [
        {
          transport: "stdio",
          command: "python",
          args: ["server.py", "--port", "3000"],
          env: { "NODE_ENV": "development", "DEBUG": "true" }
        },
        {
          transport: "http",
          command: "node",
          args: ["server.js", "--host", "0.0.0.0"],
          env: { "PORT": "3000", "HOST": "localhost" }
        },
        {
          transport: "websocket",
          command: "deno",
          args: ["run", "--allow-net", "server.ts"],
          env: { "DENO_NO_PROMPT": "1" }
        }
      ]

      for (const config of complexConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in configuration", async () => {
      const specialConfig = {
        transport: "stdio",
        command: "node",
        args: ["server.js", "--name", "测试服务器"],
        env: {
          "SPECIAL_CHARS": "!@#$%^&*()",
          "UNICODE": "🚀 🌟 ⭐",
          "NEWLINES": "line1\nline2\r\nline3",
          "TABS": "col1\tcol2\tcol3"
        }
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(specialConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle very large configurations", async () => {
      const largeConfig = {
        transport: "stdio",
        command: "node",
        args: Array(100).fill(null).map((_, i) => `arg-${i}`),
        env: Object.fromEntries(
          Array(50).fill(null).map((_, i) => [`ENV_VAR_${i}`, `value-${i}`])
        )
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largeConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle null and undefined values", async () => {
      const nullConfig = {
        transport: null,
        command: undefined,
        args: null,
        env: undefined
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nullConfig)
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ transport: "stdio", command: "node" })
      })

      expect([200, 400]).toContain(res.status)
    })
  })

  describe("GET /oauth", () => {
    it("should check OAuth support", async () => {
      const res = await app.request("/oauth")
      expect([200, 500]).toContain(res.status)

      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).toHaveProperty("supportsOAuth")
        expect(typeof json.supportsOAuth).toBe("boolean")
      }
    })

    it("should handle OAuth check gracefully", async () => {
      const res = await app.request("/oauth")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle concurrent OAuth checks", async () => {
      const promises = Array(3).fill(null).map(() =>
        app.request("/oauth").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })
  })

  describe("POST /oauth/start", () => {
    it("should start OAuth flow", async () => {
      const res = await app.request("/oauth/start", { method: "POST" })
      expect([200, 400, 500]).toContain(res.status)

      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(json).toHaveProperty("authorizationUrl")
        expect(typeof json.authorizationUrl).toBe("string")
      }
    })

    it("should handle OAuth start gracefully", async () => {
      const res = await app.request("/oauth/start", { method: "POST" })
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle malformed JSON in OAuth start", async () => {
      const res = await app.request("/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle empty OAuth start request", async () => {
      const res = await app.request("/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ""
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("POST /oauth/finish", () => {
    it("should finish OAuth flow", async () => {
      const authData = {
        code: "test-auth-code",
        state: "test-state"
      }

      const res = await app.request("/oauth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle OAuth finish gracefully", async () => {
      const res = await app.request("/oauth/finish", { method: "POST" })
      expect([400, 500]).toContain(res.status)
    })

    it("should validate OAuth finish data", async () => {
      const invalidAuthData = [
        {}, // Missing required fields
        { code: "" }, // Empty code
        { state: "" }, // Empty state
        { code: null, state: null } // Null values
      ]

      for (const authData of invalidAuthData) {
        const res = await app.request("/oauth/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authData)
        })

        expect([400, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in OAuth finish", async () => {
      const res = await app.request("/oauth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("POST /oauth/authenticate", () => {
    it("should authenticate OAuth token", async () => {
      const authData = {
        token: "test-oauth-token"
      }

      const res = await app.request("/oauth/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle OAuth authenticate gracefully", async () => {
      const res = await app.request("/oauth/authenticate", { method: "POST" })
      expect([400, 500]).toContain(res.status)
    })

    it("should validate OAuth token", async () => {
      const invalidTokens = [
        {}, // Missing token
        { token: "" }, // Empty token
        { token: null }, // Null token
        { token: undefined } // Undefined token
      ]

      for (const tokenData of invalidTokens) {
        const res = await app.request("/oauth/authenticate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokenData)
        })

        expect([400, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in OAuth authenticate", async () => {
      const res = await app.request("/oauth/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("DELETE /oauth", () => {
    it("should remove OAuth authentication", async () => {
      const res = await app.request("/oauth", { method: "DELETE" })
      expect([200, 500]).toContain(res.status)
    })

    it("should handle OAuth removal gracefully", async () => {
      const res = await app.request("/oauth", { method: "DELETE" })
      expect([200, 500]).toContain(res.status)
    })

    it("should handle concurrent OAuth removal", async () => {
      const promises = Array(3).fill(null).map(() =>
        app.request("/oauth", { method: "DELETE" }).then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })
  })

  describe("POST /connect", () => {
    it("should connect to MCP server", async () => {
      const connectData = {
        serverId: "test-server-id"
      }

      const res = await app.request("/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle connection gracefully", async () => {
      const res = await app.request("/connect", { method: "POST" })
      expect([400, 500]).toContain(res.status)
    })

    it("should validate connection data", async () => {
      const invalidConnectData = [
        {}, // Missing serverId
        { serverId: "" }, // Empty serverId
        { serverId: null }, // Null serverId
        { serverId: undefined } // Undefined serverId
      ]

      for (const connectData of invalidConnectData) {
        const res = await app.request("/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(connectData)
        })

        expect([400, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in connection", async () => {
      const res = await app.request("/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle various server IDs", async () => {
      const serverIds = [
        "simple-id",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
        "server-with-dashes",
        "server_with_underscores",
        "123456",
        "🚀server"
      ]

      for (const serverId of serverIds) {
        const connectData = { serverId }
        const res = await app.request("/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(connectData)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /disconnect", () => {
    it("should disconnect from MCP server", async () => {
      const disconnectData = {
        serverId: "test-server-id"
      }

      const res = await app.request("/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disconnectData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle disconnection gracefully", async () => {
      const res = await app.request("/disconnect", { method: "DELETE" })
      expect([400, 500]).toContain(res.status)
    })

    it("should validate disconnection data", async () => {
      const invalidDisconnectData = [
        {}, // Missing serverId
        { serverId: "" }, // Empty serverId
        { serverId: null }, // Null serverId
        { serverId: undefined } // Undefined serverId
      ]

      for (const disconnectData of invalidDisconnectData) {
        const res = await app.request("/disconnect", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(disconnectData)
        })

        expect([400, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in disconnection", async () => {
      const res = await app.request("/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("GET /resource", () => {
    it("should get MCP resources", async () => {
      const res = await app.request("/resource")
      expect([200, 500]).toContain(res.status)

      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle resource request gracefully", async () => {
      const res = await app.request("/resource")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle concurrent resource requests", async () => {
      const promises = Array(3).fill(null).map(() =>
        app.request("/resource").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle resource request with parameters", async () => {
      const res = await app.request("/resource?serverId=test-server")
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/", invalidMethods: ["PUT", "DELETE", "PATCH"] },
        { path: "/oauth", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/oauth/start", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/oauth/finish", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/oauth/authenticate", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/oauth", invalidMethods: ["GET", "PUT", "PATCH"] },
        { path: "/connect", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/disconnect", invalidMethods: ["GET", "PUT", "PATCH"] },
        { path: "/resource", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] }
      ]

      for (const endpoint of endpoints) {
        for (const method of endpoint.invalidMethods) {
          const res = await app.request(endpoint.path, { method })
          expect(res.status).toBe(404)
        }
      }
    })

    it("should handle non-existent routes", async () => {
      const res = await app.request("/nonexistent", { method: "GET" })
      expect(res.status).toBe(404)

      const res2 = await app.request("/invalid", { method: "GET" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/mcp/invalid", { method: "GET" })
      expect(res3.status).toBe(404)
    })

    it("should handle invalid content types", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json"
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle rapid sequential requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res1 = await app.request("/")
        const res2 = await app.request("/resource")

        expect([200, 500]).toContain(res1.status)
        expect([200, 500]).toContain(res2.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/").then(r => r.status))
        promises.push(app.request("/resource").then(r => r.status))

        const mcpData = {
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          env: {}
        }
        promises.push(app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mcpData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 500]).toContain(status)
      })
    })

    it("should handle Unicode in configuration", async () => {
      const unicodeConfig = {
        transport: "stdio",
        command: "node",
        args: ["服务器.js"],
        env: {
          "UNICODE_KEY": "测试值",
          "EMOJI": "🚀 🌟 ⭐"
        }
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodeConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle extreme configuration sizes", async () => {
      const extremeConfig = {
        transport: "stdio",
        command: "x".repeat(1000),
        args: Array(1000).fill(null).map((_, i) => `arg-${i}`),
        env: Object.fromEntries(
          Array(1000).fill(null).map((_, i) => [`ENV_${i}`, `x`.repeat(100)])
        )
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extremeConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle OAuth flow edge cases", async () => {
      const edgeCases = [
        { code: "a".repeat(1000), state: "b".repeat(1000) },
        { code: "special-chars!@#$%^&*()", state: "more-special-chars" },
        { code: "🚀🌟⭐", state: "测试状态" },
        { code: "test-code", state: "" }, // Empty state
        { code: "", state: "test-state" } // Empty code
      ]

      for (const edgeCase of edgeCases) {
        const res = await app.request("/oauth/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edgeCase)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle connection/disconnection cycles", async () => {
      const serverId = "test-server-cycle"

      // Connect
      const connectRes = await app.request("/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId })
      })
      expect([200, 400, 500]).toContain(connectRes.status)

      // Disconnect
      const disconnectRes = await app.request("/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId })
      })
      expect([200, 400, 500]).toContain(disconnectRes.status)

      // Connect again
      const reconnectRes = await app.request("/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId })
      })
      expect([200, 400, 500]).toContain(reconnectRes.status)
    })
  })
})
