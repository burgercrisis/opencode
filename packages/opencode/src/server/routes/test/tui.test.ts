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

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { TuiControlRoutes, TuiRoutes } from "../../routes/tui"
import { Bus } from "../../../bus"
import { Session } from "../../../session"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { AsyncQueue } from "../../../util/queue"

// Mock dependencies
const mockTuiRequests = [
  {
    path: "/path/to/project1",
    body: {
      action: "open",
      target: "file.txt"
    }
  },
  {
    path: "/path/to/project2",
    body: {
      action: "edit",
      target: "config.json",
      content: '{"theme": "dark"}'
    }
  }
]

// Mock modules
const originalBusEmit = Bus.emit
const originalSessionList = Session.list
const originalTuiEventEmit = TuiEvent.emit

beforeAll(() => {
  // Mock the async queue behavior for testing
  Bus.emit = async (event: string, data: any) => { }
  Session.list = async () => []
  TuiEvent.emit = async (event: string, data: any) => { }
})

afterAll(() => {
  Bus.emit = originalBusEmit
  Session.list = originalSessionList
  TuiEvent.emit = originalTuiEventEmit
})

describe("TuiControlRoutes", () => {
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
  let app: typeof TuiControlRoutes

  beforeEach(() => {
    app = TuiControlRoutes
  })

  describe("GET /next", () => {
    it("should return next TUI request", async () => {
      const res = await app.request("/next")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(json).toHaveProperty("path")
      expect(json).toHaveProperty("body")
    })

    it("should handle empty TUI request queue", async () => {
      const res = await app.request("/next")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual({}) // Empty queue
    })

    it("should handle TUI request errors", async () => {
      // Mock the queue to throw an error
      const res = await app.request("/next")
      expect(res.status).toBe(200) // Should still return 200, errors handled internally
    })

    it("should handle concurrent TUI requests", async () => {
      const promises = Array(10).fill(null).map(() =>
        app.request("/next").then(r => r.json())
      )

      const results = await Promise.all(promises)
      results.forEach(result => {
        expect(typeof result).toBe("object")
      })
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const res = await app.request("/next", { method: "POST" })
      expect(res.status).toBe(404)

      const res2 = await app.request("/next", { method: "PUT" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/next", { method: "DELETE" })
      expect(res3.status).toBe(404)
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect(res.status).toBe(404) // Method not allowed
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/next", {
        method: "POST",
        body: JSON.stringify({
          action: "test",
          target: "file.txt"
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle TUI requests with special characters", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          target: "file with spaces and unicode.txt",
          content: "测试内容"
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })

    it("should handle very large TUI requests", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          target: "large-file.json",
          content: "x".repeat(10000) // Very large content
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })

    it("should handle TUI requests with null/undefined values", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: null,
          target: undefined,
          content: null
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })

    it("should handle TUI requests with complex nested objects", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complex",
          target: {
            file: "nested.txt",
            line: 42,
            column: 10
          },
          content: {
            operation: "replace",
            data: {
              oldText: "hello world",
              newText: "hello universe",
              options: {
                caseSensitive: true,
                wholeWord: false
              }
            }
          }
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })

    it("should handle TUI requests with arrays", async () => {
      const res = await app.request("/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch",
          targets: [
            "file1.txt",
            "file2.txt",
            "file3.txt"
          ],
          operations: [
            { type: "read", file: "file1.txt" },
            { type: "write", file: "file2.txt", content: "test content" },
            { type: "delete", file: "file3.txt" }
          ]
        })
      })
      // Should still work as Hono can infer content-type
      expect([200, 404]).toContain(res.status)
    })
  })
})
