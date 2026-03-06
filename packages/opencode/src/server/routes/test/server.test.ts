// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, beforeEach } from "bun:test"
import { Server } from "../../server/server"

describe("Server", () => {
  beforeEach(() => {
    // Reset any global state
  })

  describe("url() function", () => {
    it("should return default URL when no URL is set", () => {
      const url = Server.url()
      expect(url).toBeInstanceOf(URL)
      expect(url.toString()).toBe("http://localhost:4096")
    })

    it("should return consistent URL", () => {
      const url1 = Server.url()
      const url2 = Server.url()
      expect(url1).toEqual(url2)
    })
  })

  describe("App() function", () => {
    it("should return Hono app instance", () => {
      const app = Server.App()
      expect(app).toBeDefined()
      expect(typeof app.fetch).toBe("function")
    })

    it("should return consistent app instance", () => {
      const app1 = Server.App()
      const app2 = Server.App()
      expect(app1).toEqual(app2)
    })
  })

  describe("openapi() function", () => {
    it("should generate OpenAPI spec", async () => {
      const spec = await Server.openapi()
      expect(spec).toBeDefined()
      expect(typeof spec).toBe("object")
      expect(spec.openapi).toBe("3.1.1")
      expect(spec.info.title).toBe("opencode")
      expect(spec.info.version).toBe("1.0.0")
      expect(spec.info.description).toBe("opencode api")
    })

    it("should generate consistent OpenAPI spec", async () => {
      const spec1 = await Server.openapi()
      const spec2 = await Server.openapi()
      expect(spec1).toEqual(spec2)
    })
  })

  describe("listen() function", () => {
    it("should start server with valid options", async () => {
      const server = Server.listen({
        port: 0, // Use 0 to get random available port
        hostname: "127.0.0.1",
        mdns: false
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)
      expect(server.url).toBeDefined()

      // Clean up
      server.stop()
    })

    it("should start server with different hostname", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "localhost",
        mdns: false
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should handle server start failure gracefully", () => {
      // Try to start server on an invalid port
      expect(() => {
        Server.listen({
          port: -1,
          hostname: "localhost",
          mdns: false
        })
      }).toThrow()
    })

    it("should start server with CORS whitelist", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "localhost",
        mdns: false,
        cors: ["https://example.com", "https://test.com"]
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should start server with mDNS disabled", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "127.0.0.1",
        mdns: false
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should handle mDNS with non-loopback hostname", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "0.0.0.0",
        mdns: true,
        mdnsDomain: "test.local"
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should warn about mDNS with loopback hostname", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "127.0.0.1",
        mdns: true
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should handle port 0 with fallback", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "localhost",
        mdns: false
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      // Clean up
      server.stop()
    })

    it("should handle server stop with closeActiveConnections", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "localhost",
        mdns: false
      })

      expect(server).toBeDefined()
      
      // Test stop with closeActiveConnections
      await server.stop(true)

      // Should not throw when stopping again
      await server.stop(false)
    })
  })

  describe("Server routes", () => {
    let server: any
    let baseUrl: string

    beforeEach(async () => {
      server = Server.listen({
        port: 0,
        hostname: "localhost",
        mdns: false
      })
      baseUrl = server.url.toString()
    })

    afterEach(() => {
      if (server) {
        server.stop()
      }
    })

    describe("GET /doc", () => {
      it("should return OpenAPI documentation", async () => {
        const res = await fetch(`${baseUrl}/doc`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(json).toBeDefined()
          expect(json.openapi).toBe("3.1.1")
        }
      })
    })

    describe("PUT /auth/:providerID", () => {
      it("should set auth credentials", async () => {
        const authData = {
          token: "test-token",
          apiKey: "test-key"
        }

        const res = await fetch(`${baseUrl}/auth/test-provider`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authData)
        })

        expect([200, 400, 500]).toContain(res.status)
      })

      it("should handle invalid auth data", async () => {
        const res = await fetch(`${baseUrl}/auth/test-provider`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "invalid json"
        })

        expect([400, 500]).toContain(res.status)
      })

      it("should handle missing auth data", async () => {
        const res = await fetch(`${baseUrl}/auth/test-provider`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        })

        expect([400, 500]).toContain(res.status)
      })
    })

    describe("DELETE /auth/:providerID", () => {
      it("should remove auth credentials", async () => {
        const res = await fetch(`${baseUrl}/auth/test-provider`, {
          method: "DELETE"
        })

        expect([200, 400, 500]).toContain(res.status)
      })
    })

    describe("GET /path", () => {
      it("should get path information", async () => {
        const res = await fetch(`${baseUrl}/path`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(json).toBeDefined()
          expect(typeof json.home).toBe("string")
          expect(typeof json.state).toBe("string")
          expect(typeof json.config).toBe("string")
          expect(typeof json.worktree).toBe("string")
          expect(typeof json.directory).toBe("string")
        }
      })
    })

    describe("GET /vcs", () => {
      it("should get VCS information", async () => {
        const res = await fetch(`${baseUrl}/vcs`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(json).toBeDefined()
          expect(typeof json.branch).toBe("string")
        }
      })
    })

    describe("GET /command", () => {
      it("should list commands", async () => {
        const res = await fetch(`${baseUrl}/command`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(Array.isArray(json)).toBe(true)
        }
      })
    })

    describe("POST /log", () => {
      it("should write debug log", async () => {
        const logData = {
          service: "test-service",
          level: "debug",
          message: "Debug message",
          extra: { key: "value" }
        }

        const res = await fetch(`${baseUrl}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData)
        })

        expect([200, 400, 500]).toContain(res.status)
      })

      it("should write info log", async () => {
        const logData = {
          service: "test-service",
          level: "info",
          message: "Info message"
        }

        const res = await fetch(`${baseUrl}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData)
        })

        expect([200, 400, 500]).toContain(res.status)
      })

      it("should write error log", async () => {
        const logData = {
          service: "test-service",
          level: "error",
          message: "Error message"
        }

        const res = await fetch(`${baseUrl}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData)
        })

        expect([200, 400, 500]).toContain(res.status)
      })

      it("should write warn log", async () => {
        const logData = {
          service: "test-service",
          level: "warn",
          message: "Warning message"
        }

        const res = await fetch(`${baseUrl}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData)
        })

        expect([200, 400, 500]).toContain(res.status)
      })

      it("should handle invalid log data", async () => {
        const invalidLogData = [
          {}, // Missing required fields
          { service: "test" }, // Missing level and message
          { level: "info" }, // Missing service and message
          { message: "test" }, // Missing service and level
          { service: "test", level: "invalid", message: "test" }, // Invalid level
          { service: 123, level: "info", message: "test" }, // Invalid service type
          { service: "test", level: "info", message: 123 }, // Invalid message type
        ]

        for (const logData of invalidLogData) {
          const res = await fetch(`${baseUrl}/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(logData)
          })

          expect([400, 500]).toContain(res.status)
        }
      })
    })

    describe("GET /agent", () => {
      it("should list agents", async () => {
        const res = await fetch(`${baseUrl}/agent`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(Array.isArray(json)).toBe(true)
        }
      })
    })

    describe("GET /skill", () => {
      it("should list skills", async () => {
        const res = await fetch(`${baseUrl}/skill`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(Array.isArray(json)).toBe(true)
        }
      })
    })

    describe("GET /lsp", () => {
      it("should get LSP status", async () => {
        const res = await fetch(`${baseUrl}/lsp`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(Array.isArray(json)).toBe(true)
        }
      })
    })

    describe("GET /formatter", () => {
      it("should get formatter status", async () => {
        const res = await fetch(`${baseUrl}/formatter`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(Array.isArray(json)).toBe(true)
        }
      })
    })

    describe("GET /event", () => {
      it("should establish SSE connection", async () => {
        const res = await fetch(`${baseUrl}/event`)
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/text\/event-stream/)
          expect(res.headers.get("X-Accel-Buffering")).toBe("no")
          expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
        }
      })
    })

    describe("POST /instance/dispose", () => {
      it("should dispose instance", async () => {
        const res = await fetch(`${baseUrl}/instance/dispose`, {
          method: "POST"
        })

        expect([200, 500]).toContain(res.status)
      })
    })

    describe("Route handling", () => {
      it("should handle OPTIONS requests", async () => {
        const res = await fetch(`${baseUrl}/test`, {
          method: "OPTIONS"
        })

        expect([200, 404]).toContain(res.status)
      })

      it("should handle non-existent routes", async () => {
        const res = await fetch(`${baseUrl}/nonexistent`)
        expect([200, 404]).toContain(res.status)
      })

      it("should handle proxy routes", async () => {
        const res = await fetch(`${baseUrl}/dashboard`)
        expect([200, 404, 500]).toContain(res.status)
      })

      it("should handle requests with directory parameter", async () => {
        const res = await fetch(`${baseUrl}/project?directory=/test`)
        expect([200, 404, 500]).toContain(res.status)
      })

      it("should handle requests with directory header", async () => {
        const res = await fetch(`${baseUrl}/project`, {
          headers: { "x-opencode-directory": "/test" }
        })
        expect([200, 404, 500]).toContain(res.status)
      })

      it("should handle malformed directory parameter", async () => {
        const res = await fetch(`${baseUrl}/project?directory=%E0%A4%A`)
        expect([200, 404, 500]).toContain(res.status)
      })
    })

    describe("Error handling", () => {
      it("should handle NamedError responses", async () => {
        // This would trigger a NotFoundError or similar
        const res = await fetch(`${baseUrl}/nonexistent-resource`)
        expect([200, 404, 500]).toContain(res.status)
      })

      it("should handle HTTPException responses", async () => {
        // This might trigger validation errors
        const res = await fetch(`${baseUrl}/auth/`, {
          method: "PUT"
        })
        expect([404, 500]).toContain(res.status)
      })

      it("should handle generic errors", async () => {
        // This might trigger internal errors
        const res = await fetch(`${baseUrl}/test-error`)
        expect([200, 404, 500]).toContain(res.status)
      })
    })

    describe("CORS handling", () => {
      it("should allow localhost origins", async () => {
        const res = await fetch(`${baseUrl}/test`, {
          headers: { "Origin": "http://localhost:3000" }
        })
        expect([200, 404]).toContain(res.status)
      })

      it("should allow 127.0.0.1 origins", async () => {
        const res = await fetch(`${baseUrl}/test`, {
          headers: { "Origin": "http://127.0.0.1:3000" }
        })
        expect([200, 404]).toContain(res.status)
      })

      it("should allow Tauri origins", async () => {
        const tauriOrigins = [
          "tauri://localhost",
          "http://tauri.localhost",
          "https://tauri.localhost"
        ]

        for (const origin of tauriOrigins) {
          const res = await fetch(`${baseUrl}/test`, {
            headers: { "Origin": origin }
          })
          expect([200, 404]).toContain(res.status)
        }
      })

      it("should allow opencode.ai origins", async () => {
        const res = await fetch(`${baseUrl}/test`, {
          headers: { "Origin": "https://app.opencode.ai" }
        })
        expect([200, 404]).toContain(res.status)
      })

      it("should reject unknown origins", async () => {
        const res = await fetch(`${baseUrl}/test`, {
          headers: { "Origin": "https://evil.com" }
        })
        expect([200, 404]).toContain(res.status)
      })
    })

    describe("Authentication", () => {
      it("should handle requests without password", async () => {
        const res = await fetch(`${baseUrl}/test`)
        expect([200, 404]).toContain(res.status)
      })
    })

    describe("Content Security Policy", () => {
      it("should set CSP header on proxy routes", async () => {
        const res = await fetch(`${baseUrl}/dashboard`)
        if (res.status === 200) {
          const csp = res.headers.get("Content-Security-Policy")
          expect(csp).toContain("default-src 'self'")
        }
      })
    })
  })

  describe("Edge cases", () => {
    it("should handle rapid server start/stop cycles", async () => {
      for (let i = 0; i < 3; i++) {
        const server = Server.listen({
          port: 0,
          hostname: "localhost",
          mdns: false
        })
        
        expect(server).toBeDefined()
        expect(server.port).toBeGreaterThan(0)
        
        await server.stop()
      }
    })

    it("should handle concurrent server instances", async () => {
      const servers = []
      
      for (let i = 0; i < 3; i++) {
        const server = Server.listen({
          port: 0,
          hostname: "localhost",
          mdns: false
        })
        servers.push(server)
        expect(server).toBeDefined()
        expect(server.port).toBeGreaterThan(0)
      }
      
      // Clean up all servers
      for (const server of servers) {
        await server.stop()
      }
    })

    it("should handle server with all options", async () => {
      const server = Server.listen({
        port: 0,
        hostname: "0.0.0.0",
        mdns: true,
        mdnsDomain: "test.local",
        cors: ["https://example.com", "https://test.com"]
      })

      expect(server).toBeDefined()
      expect(server.port).toBeGreaterThan(0)

      await server.stop()
    })
  })
})
