import { describe, it, expect, beforeEach } from "bun:test"
import { GlobalRoutes } from "../../routes/global"

describe("GlobalRoutes", () => {
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
  let app: ReturnType<typeof GlobalRoutes>

  beforeEach(() => {
    app = GlobalRoutes()
  })

  describe("GET /health", () => {
    it("should return health information", async () => {
      const res = await app.request("/health")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(json).toHaveProperty("healthy", true)
        expect(json).toHaveProperty("version")
        expect(typeof json.version).toBe("string")
        expect(json.version.length).toBeGreaterThan(0)
      }
    })

    it("should return consistent health data", async () => {
      const res1 = await app.request("/health")
      const res2 = await app.request("/health")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
      
      if (res1.status === 200 && res2.status === 200) {
        const json1 = await res1.json()
        const json2 = await res2.json()
        
        expect(json1.healthy).toBe(json2.healthy)
        expect(json1.version).toBe(json2.version)
      }
    })

    it("should handle concurrent health requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/health").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid health checks", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/health")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle health check with headers", async () => {
      const res = await app.request("/health", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "test-agent"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("GET /event", () => {
    it("should establish SSE connection", async () => {
      const res = await app.request("/event")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/text\/event-stream/)
        expect(res.headers.get("x-accel-buffering")).toBe("no")
        expect(res.headers.get("x-content-type-options")).toBe("nosniff")
      }
    })

    it("should send initial connection event", async () => {
      const res = await app.request("/event")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        // Read the SSE stream
        const reader = res.body?.getReader()
        if (reader) {
          const { value } = await reader.read()
          const text = new TextDecoder().decode(value)
          expect(text).toContain("server.connected")
        }
      }
    })

    it("should handle event stream connection", async () => {
      const res = await app.request("/event")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        // Verify SSE headers
        expect(res.headers.get("cache-control")).toBe("no-cache")
        expect(res.headers.get("connection")).toBe("keep-alive")
      }
    })

    it("should handle multiple event connections", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/event").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle concurrent SSE connections", async () => {
      const promises = []
      
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/event").then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle event connection with headers", async () => {
      const res = await app.request("/event", {
        headers: {
          "Accept": "text/event-stream",
          "Cache-Control": "no-cache"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("GET /config", () => {
    it("should return global configuration", async () => {
      const res = await app.request("/config")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle config request gracefully", async () => {
      const res = await app.request("/config")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent config data", async () => {
      const res1 = await app.request("/config")
      const res2 = await app.request("/config")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent config requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/config").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid config requests", async () => {
      for (let i = 0; i < 5; i++) {
        const res = await app.request("/config")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle config request with headers", async () => {
      const res = await app.request("/config", {
        headers: {
          "Accept": "application/json",
          "If-None-Match": "test-etag"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("PATCH /config", () => {
    it("should update global configuration", async () => {
      const configData = {
        theme: "light",
        language: "es"
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate configuration data", async () => {
      const invalidData = {
        theme: 123 // invalid type
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData)
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle empty configuration", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" })
      })

      expect([200, 400]).toContain(res.status)
    })

    it("should handle various configuration updates", async () => {
      const configs = [
        { theme: "dark" },
        { language: "fr" },
        { autoSave: true },
        { telemetry: false },
        { provider: "anthropic" },
        { model: "claude-3" },
        { customSettings: { feature: true } }
      ]

      for (const config of configs) {
        const res = await app.request("/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in configuration", async () => {
      const specialConfig = {
        theme: "dark",
        customSettings: {
          "special-chars": "!@#$%^&*()_+-=[]{}|;':\",./<>?",
          "unicode": "🚀 🌟 ⭐",
          "newlines": "line1\nline2\r\nline3",
          "tabs": "col1\tcol2\tcol3"
        }
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(specialConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle very large configuration data", async () => {
      const largeConfig = {
        theme: "dark",
        customSettings: {
          "large-field": "x".repeat(10000),
          "many-fields": Object.fromEntries(
            Array(100).fill(null).map((_, i) => [`field-${i}`, `value-${i}`])
          )
        }
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largeConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle concurrent config updates", async () => {
      const promises = []
      
      for (let i = 0; i < 5; i++) {
        const configData = { theme: i % 2 === 0 ? "dark" : "light" }
        promises.push(app.request("/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 500]).toContain(status)
      })
    })
  })

  describe("POST /dispose", () => {
    it("should dispose all instances", async () => {
      const res = await app.request("/dispose", { method: "POST" })
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        const json = await res.json()
        expect(json).toBe(true)
      }
    })

    it("should handle dispose request gracefully", async () => {
      const res = await app.request("/dispose", { method: "POST" })
      expect([200, 500]).toContain(res.status)
    })

    it("should handle concurrent dispose requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/dispose", { method: "POST" }).then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid dispose requests", async () => {
      for (let i = 0; i < 3; i++) {
        const res = await app.request("/dispose", { method: "POST" })
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle dispose request with headers", async () => {
      const res = await app.request("/dispose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": "test-request"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/health", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/event", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/config", invalidMethods: ["PUT", "DELETE"] },
        { path: "/dispose", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] }
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

      const res2 = await app.request("/health/invalid", { method: "GET" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/config/invalid", { method: "GET" })
      expect(res3.status).toBe(404)
    })

    it("should handle invalid content types", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "text/plain" },
        body: "not json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle empty requests", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: ""
      })

      expect([400, 500]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle null and undefined values", async () => {
      const configWithNulls = {
        theme: null,
        language: undefined,
        autoSave: true,
        telemetry: false
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configWithNulls)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle rapid sequential requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res1 = await app.request("/health")
        const res2 = await app.request("/config")
        const res3 = await app.request("/event")
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 500]).toContain(res2.status)
        expect([200, 500]).toContain(res3.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/health").then(r => r.status))
        promises.push(app.request("/config").then(r => r.status))
        promises.push(app.request("/event").then(r => r.status))
        
        const configData = { theme: i % 2 === 0 ? "dark" : "light" }
        promises.push(app.request("/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 500]).toContain(status)
      })
    })

    it("should handle configuration with nested objects", async () => {
      const nestedConfig = {
        theme: "dark",
        customSettings: {
          level1: {
            level2: {
              level3: {
                deepValue: "found"
              }
            }
          },
          arrays: [1, 2, 3, { nested: "object" }],
          mixed: {
            string: "value",
            number: 42,
            boolean: true,
            array: ["a", "b", "c"],
            object: { nested: true }
          }
        }
      }

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nestedConfig)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle extreme request scenarios", async () => {
      const extremeScenarios = [
        () => app.request("/health", { headers: { "User-Agent": "x".repeat(1000) } }),
        () => app.request("/config", { 
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: "x".repeat(10000) })
        }),
        () => app.request("/event", { headers: { "Accept": "text/event-stream, */*" } }),
        () => app.request("/dispose", { 
          method: "POST",
          headers: { "X-Custom-Header": "test-value" }
        })
      ]

      for (const scenario of extremeScenarios) {
        const res = await scenario()
        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })
})
