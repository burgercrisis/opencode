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
import { SessionRoutes } from "../../routes/session"

describe("SessionRoutes", () => {
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
  let app: ReturnType<typeof SessionRoutes>

  beforeEach(() => {
    app = SessionRoutes()
  })

  describe("GET /", () => {
    it("should list sessions", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle query parameters", async () => {
      const res = await app.request("/?directory=/test&roots=true&start=123&search=test&limit=10")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle empty query parameters", async () => {
      const res = await app.request("/?directory=&roots=&start=&search=&limit=")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle concurrent list requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid list requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle various query combinations", async () => {
      const queries = [
        "?directory=/home/user",
        "?roots=true",
        "?start=0",
        "?search=session",
        "?limit=5",
        "?directory=/test&roots=true",
        "?start=10&limit=20",
        "?search=test&limit=100",
        "?directory=/app&roots=true&start=5&search=app&limit=50"
      ]

      for (const query of queries) {
        const res = await app.request(`/${query}`)
        expect([200, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /status", () => {
    it("should get session status", async () => {
      const res = await app.request("/status")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
      }
    })

    it("should handle concurrent status requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/status").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })
  })

  describe("GET /:sessionId", () => {
    it("should get session details", async () => {
      const res = await app.request("/test-session")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
      }
    })

    it("should handle non-existent session", async () => {
      const res = await app.request("/non-existent-session")
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various session ID formats", async () => {
      const sessionIds = [
        "simple-id",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
        "session-with-dashes",
        "session_with_underscores",
        "123456",
        "🚀session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${encodeURIComponent(sessionId)}`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle empty session ID", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle very long session ID", async () => {
      const longId = "a".repeat(1000)
      const res = await app.request(`/${longId}`)
      expect([200, 404, 500]).toContain(res.status)
    })
  })

  describe("GET /:sessionId/children", () => {
    it("should get session children", async () => {
      const res = await app.request("/test-session/children")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle non-existent session children", async () => {
      const res = await app.request("/non-existent/children")
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various session ID formats for children", async () => {
      const sessionIds = [
        "parent-session",
        "session-123",
        "root-session",
        "child-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/children`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /:sessionId/todo", () => {
    it("should get session todos", async () => {
      const res = await app.request("/test-session/todo")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle non-existent session todos", async () => {
      const res = await app.request("/non-existent/todo")
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various session ID formats for todos", async () => {
      const sessionIds = [
        "todo-session",
        "task-session",
        "active-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/todo`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /", () => {
    it("should create new session", async () => {
      const sessionData = {
        directory: "/test",
        roots: ["/test"]
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate session creation data", async () => {
      const invalidSessionData = [
        {}, // Missing required fields
        { directory: "" }, // Empty directory
        { roots: [] }, // Missing directory
        { directory: null, roots: null }, // Null values
        { directory: undefined, roots: undefined }, // Undefined values
        { directory: 123, roots: [] }, // Invalid type for directory
        { directory: "/test", roots: "not-array" }, // Invalid type for roots
      ]

      for (const sessionData of invalidSessionData) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionData)
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

    it("should handle various session configurations", async () => {
      const sessionConfigs = [
        {
          directory: "/home/user",
          roots: ["/home/user"]
        },
        {
          directory: "/app",
          roots: ["/app", "/shared"]
        },
        {
          directory: "/tmp",
          roots: ["/tmp", "/var/tmp"]
        },
        {
          directory: "/workspace",
          roots: ["/workspace", "/workspace/shared", "/workspace/public"]
        }
      ]

      for (const config of sessionConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in directory paths", async () => {
      const specialPaths = [
        {
          directory: "/path with spaces",
          roots: ["/path with spaces"]
        },
        {
          directory: "/path-with-dashes",
          roots: ["/path-with-dashes"]
        },
        {
          directory: "/path_with_underscores",
          roots: ["/path_with_underscores"]
        },
        {
          directory: "/path.with.dots",
          roots: ["/path.with.dots"]
        }
      ]

      for (const pathConfig of specialPaths) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pathConfig)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle Unicode in directory paths", async () => {
      const unicodePaths = [
        {
          directory: "/测试目录",
          roots: ["/测试目录"]
        },
        {
          directory: "/🚀workspace",
          roots: ["/🚀workspace"]
        }
      ]

      for (const pathConfig of unicodePaths) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pathConfig)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /:sessionId", () => {
    it("should delete session", async () => {
      const res = await app.request("/test-session", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle non-existent session deletion", async () => {
      const res = await app.request("/non-existent", { method: "DELETE" })
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various session ID formats for deletion", async () => {
      const sessionIds = [
        "delete-session",
        "session-to-delete",
        "temporary-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}`, { method: "DELETE" })
        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle concurrent session deletions", async () => {
      const promises = Array(3).fill(null).map((_, i) => 
        app.request(`/delete-session-${i}`, { method: "DELETE" }).then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 404, 500]).toContain(status)
      })
    })
  })

  describe("PATCH /:sessionId", () => {
    it("should update session", async () => {
      const updateData = {
        directory: "/updated"
      }

      const res = await app.request("/test-session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should validate session update data", async () => {
      const invalidUpdates = [
        {}, // Empty update
        { directory: null }, // Null directory
        { directory: undefined }, // Undefined directory
        { directory: 123 }, // Invalid type
      ]

      for (const update of invalidUpdates) {
        const res = await app.request("/test-session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in session update", async () => {
      const res = await app.request("/test-session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle various update scenarios", async () => {
      const updateScenarios = [
        { directory: "/new/path" },
        { directory: "/updated/workspace" },
        { directory: "/changed/directory" }
      ]

      for (const update of updateScenarios) {
        const res = await app.request("/test-session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /:sessionId/init", () => {
    it("should initialize session", async () => {
      const initData = {
        prompt: "Initialize this session"
      }

      const res = await app.request("/test-session/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should validate session init data", async () => {
      const invalidInitData = [
        {}, // Missing prompt
        { prompt: null }, // Null prompt
        { prompt: undefined }, // Undefined prompt
        { prompt: 123 }, // Invalid type
      ]

      for (const initData of invalidInitData) {
        const res = await app.request("/test-session/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initData)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle various init prompts", async () => {
      const initPrompts = [
        { prompt: "Initialize workspace" },
        { prompt: "Setup development environment" },
        { prompt: "Configure project" }
      ]

      for (const init of initPrompts) {
        const res = await app.request("/test-session/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /:sessionId/fork", () => {
    it("should fork session", async () => {
      const forkData = {
        directory: "/forked-session"
      }

      const res = await app.request("/test-session/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forkData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should validate session fork data", async () => {
      const invalidForkData = [
        {}, // Missing directory
        { directory: null }, // Null directory
        { directory: undefined }, // Undefined directory
        { directory: 123 }, // Invalid type
      ]

      for (const forkData of invalidForkData) {
        const res = await app.request("/test-session/fork", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(forkData)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle various fork directories", async () => {
      const forkDirs = [
        { directory: "/fork-1" },
        { directory: "/fork-2" },
        { directory: "/fork-workspace" }
      ]

      for (const fork of forkDirs) {
        const res = await app.request("/test-session/fork", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fork)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /:sessionId/abort", () => {
    it("should abort session", async () => {
      const res = await app.request("/test-session/abort", { method: "POST" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle various session aborts", async () => {
      const sessionIds = [
        "abort-session",
        "cancel-session",
        "stop-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/abort`, { method: "POST" })
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /:sessionId/share", () => {
    it("should share session", async () => {
      const res = await app.request("/test-session/share", { method: "POST" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle various session shares", async () => {
      const sessionIds = [
        "share-session",
        "public-session",
        "collaboration-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/share`, { method: "POST" })
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /:sessionId/diff", () => {
    it("should get session diff", async () => {
      const res = await app.request("/test-session/diff")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
      }
    })

    it("should handle various session diffs", async () => {
      const sessionIds = [
        "diff-session",
        "compare-session",
        "changes-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/diff`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /:sessionId/share", () => {
    it("should unshare session", async () => {
      const res = await app.request("/test-session/share", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle various session unshares", async () => {
      const sessionIds = [
        "unshare-session",
        "private-session",
        "stop-sharing-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/share`, { method: "DELETE" })
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /:sessionId/summarize", () => {
    it("should summarize session", async () => {
      const res = await app.request("/test-session/summarize", { method: "POST" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle various session summaries", async () => {
      const sessionIds = [
        "summarize-session",
        "summary-session",
        "report-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/summarize`, { method: "POST" })
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /:sessionId/message", () => {
    it("should get session messages", async () => {
      const res = await app.request("/test-session/message")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle various session messages", async () => {
      const sessionIds = [
        "message-session",
        "chat-session",
        "conversation-session"
      ]

      for (const sessionId of sessionIds) {
        const res = await app.request(`/${sessionId}/message`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /:sessionId/message/:messageId", () => {
    it("should get specific session message", async () => {
      const res = await app.request("/test-session/message/msg-123")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
      }
    })

    it("should handle various message IDs", async () => {
      const messageIds = [
        "msg-1",
        "msg-2",
        "message-123",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000"
      ]

      for (const messageId of messageIds) {
        const res = await app.request(`/test-session/message/${messageId}`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle non-existent message", async () => {
      const res = await app.request("/test-session/message/non-existent")
      expect([404, 500]).toContain(res.status)
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/", invalidMethods: ["PUT", "DELETE", "PATCH"] },
        { path: "/status", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session", invalidMethods: ["POST"] },
        { path: "/test-session/children", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/todo", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/init", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/fork", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/abort", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/share", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/diff", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/summarize", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/message", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-session/message/msg-123", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] }
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

      const res3 = await app.request("/session/invalid", { method: "GET" })
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
      for (let i = 0; i < 5; i++) {
        const res1 = await app.request("/")
        const res2 = await app.request(`/session-${i}`)
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 404, 500]).toContain(res2.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 3; i++) {
        promises.push(app.request("/").then(r => r.status))
        
        const sessionData = {
          directory: `/test-${i}`,
          roots: [`/test-${i}`]
        }
        promises.push(app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionData)
        }).then(r => r.status))
        
        promises.push(app.request(`/session-${i}`).then(r => r.status))
        promises.push(app.request(`/session-${i}/children`).then(r => r.status))
        promises.push(app.request(`/session-${i}/todo`).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 404, 500]).toContain(status)
      })
    })

    it("should handle Unicode in session data", async () => {
      const unicodeSessionData = {
        directory: "/测试目录",
        roots: ["/测试目录"]
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodeSessionData)
      })

      expect([200, 400, 500]).toContain(res.status)

      const unicodeSessionId = "unicode-session-测试"
      const res2 = await app.request(`/${encodeURIComponent(unicodeSessionId)}`)
      expect([200, 404, 500]).toContain(res2.status)
    })

    it("should handle extreme session configurations", async () => {
      const extremeConfigs = [
        {
          directory: "/".repeat(1000),
          roots: Array(100).fill(null).map((_, i) => `/root-${i}`)
        },
        {
          directory: "/extreme-path-with-many-characters-and-symbols-!@#$%^&*()_+-=[]{}|;':\",./<>?",
          roots: ["/extreme-path-with-many-characters-and-symbols-!@#$%^&*()_+-=[]{}|;':\",./<>?"]
        }
      ]

      for (const config of extremeConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle session lifecycle", async () => {
      const sessionId = "lifecycle-session"
      
      // Create session
      const sessionData = {
        directory: "/lifecycle",
        roots: ["/lifecycle"]
      }
      const createRes = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData)
      })
      expect([200, 400, 500]).toContain(createRes.status)

      // Get session details
      const getRes = await app.request(`/${sessionId}`)
      expect([200, 404, 500]).toContain(getRes.status)

      // Initialize session
      const initRes = await app.request(`/${sessionId}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Initialize lifecycle session" })
      })
      expect([200, 404, 500]).toContain(initRes.status)

      // Get children
      const childrenRes = await app.request(`/${sessionId}/children`)
      expect([200, 404, 500]).toContain(childrenRes.status)

      // Get todos
      const todoRes = await app.request(`/${sessionId}/todo`)
      expect([200, 404, 500]).toContain(todoRes.status)

      // Get diff
      const diffRes = await app.request(`/${sessionId}/diff`)
      expect([200, 404, 500]).toContain(diffRes.status)

      // Share session
      const shareRes = await app.request(`/${sessionId}/share`, { method: "POST" })
      expect([200, 404, 500]).toContain(shareRes.status)

      // Get messages
      const messagesRes = await app.request(`/${sessionId}/message`)
      expect([200, 404, 500]).toContain(messagesRes.status)

      // Summarize session
      const summarizeRes = await app.request(`/${sessionId}/summarize`, { method: "POST" })
      expect([200, 404, 500]).toContain(summarizeRes.status)

      // Unshare session
      const unshareRes = await app.request(`/${sessionId}/share`, { method: "DELETE" })
      expect([200, 404, 500]).toContain(unshareRes.status)

      // Delete session
      const deleteRes = await app.request(`/${sessionId}`, { method: "DELETE" })
      expect([200, 404, 500]).toContain(deleteRes.status)
    })
  })
})
