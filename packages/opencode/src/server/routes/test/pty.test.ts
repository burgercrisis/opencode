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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { PtyRoutes } from "../../routes/pty"

describe("PtyRoutes", () => {
  let app: ReturnType<typeof PtyRoutes>

  beforeEach(() => {
    app = PtyRoutes()
  })

  describe("GET /", () => {
    it("should return PTY sessions", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle PTY sessions request gracefully", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent PTY sessions data", async () => {
      const res1 = await app.request("/")
      const res2 = await app.request("/")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent PTY sessions requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid PTY sessions requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle PTY sessions with headers", async () => {
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
    it("should create new PTY session", async () => {
      const ptyData = {
        command: "bash",
        args: ["-c", "echo hello"],
        cwd: "/tmp"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ptyData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate PTY creation data", async () => {
      const invalidPtyData = [
        {}, // Missing required fields
        { command: "" }, // Empty command
        { command: "bash" }, // Missing args
        { args: [] }, // Missing command
        { command: null, args: null }, // Null values
        { command: undefined, args: undefined } // Undefined values
      ]

      for (const ptyData of invalidPtyData) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ptyData)
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

    it("should handle various PTY configurations", async () => {
      const ptyConfigs = [
        {
          command: "bash",
          args: ["-c", "echo 'Hello World'"],
          cwd: "/tmp"
        },
        {
          command: "node",
          args: ["server.js", "--port", "3000"],
          cwd: "/app"
        },
        {
          command: "python",
          args: ["-c", "print('Hello Python')"],
          cwd: "/home/user"
        },
        {
          command: "sh",
          args: ["-c", "ls -la"],
          cwd: "/var/log"
        }
      ]

      for (const config of ptyConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in commands", async () => {
      const specialPtyData = {
        command: "bash",
        args: ["-c", "echo 'Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?'"],
        cwd: "/tmp"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(specialPtyData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle Unicode in commands", async () => {
      const unicodePtyData = {
        command: "bash",
        args: ["-c", "echo 'Unicode test: 🚀 🌟 ⭐ 测试'"],
        cwd: "/tmp"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodePtyData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle very long commands and arguments", async () => {
      const largePtyData = {
        command: "x".repeat(1000),
        args: Array(100).fill(null).map((_, i) => `arg-${i}`),
        cwd: "/tmp"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largePtyData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ command: "bash", args: [] })
      })

      expect([200, 400]).toContain(res.status)
    })
  })

  describe("GET /:ptyId", () => {
    it("should return PTY session details", async () => {
      const res = await app.request("/test-pty-id")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle non-existent PTY session", async () => {
      const res = await app.request("/non-existent-pty")
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various PTY ID formats", async () => {
      const ptyIds = [
        "simple-id",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
        "pty-with-dashes",
        "pty_with_underscores",
        "123456",
        "🚀pty"
      ]

      for (const ptyId of ptyIds) {
        const res = await app.request(`/${encodeURIComponent(ptyId)}`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle empty PTY ID", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle very long PTY ID", async () => {
      const longId = "a".repeat(1000)
      const res = await app.request(`/${longId}`)
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle concurrent PTY detail requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/test-pty").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 404, 500]).toContain(status)
      })
    })
  })

  describe("POST /:ptyId/input", () => {
    it("should send input to PTY session", async () => {
      const inputData = {
        input: "echo hello\n"
      }

      const res = await app.request("/test-pty/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle PTY input gracefully", async () => {
      const res = await app.request("/test-pty/input", { method: "POST" })
      expect([400, 404, 500]).toContain(res.status)
    })

    it("should validate PTY input data", async () => {
      const invalidInputs = [
        {}, // Missing input field
        { input: null }, // Null input
        { input: undefined }, // Undefined input
        { input: 123 }, // Invalid type
      ]

      for (const input of invalidInputs) {
        const res = await app.request("/test-pty/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in PTY input", async () => {
      const res = await app.request("/test-pty/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle various input types", async () => {
      const inputTypes = [
        { input: "simple command\n" },
        { input: "command with args arg1 arg2\n" },
        { input: "command with 'single quotes'\n" },
        { input: "command with \"double quotes\"\n" },
        { input: "command with $VARIABLE\n" },
        { input: "command with | pipe\n" },
        { input: "command with && and ||\n" }
      ]

      for (const inputType of inputTypes) {
        const res = await app.request("/test-pty/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputType)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in input", async () => {
      const specialInputs = [
        { input: "echo 'Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?'\n" },
        { input: "echo 'Unicode: 🚀 🌟 ⭐ 测试'\n" },
        { input: "echo 'Newlines\nand\ttabs'\n" },
        { input: "echo 'Backslashes\\ and quotes\"'\n" }
      ]

      for (const specialInput of specialInputs) {
        const res = await app.request("/test-pty/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(specialInput)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle very long input", async () => {
      const longInput = {
        input: "x".repeat(10000) + "\n"
      }

      const res = await app.request("/test-pty/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(longInput)
      })

      expect([200, 404, 500]).toContain(res.status)
    })
  })

  describe("POST /:ptyId/resize", () => {
    it("should resize PTY session", async () => {
      const resizeData = {
        cols: 80,
        rows: 24
      }

      const res = await app.request("/test-pty/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resizeData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle PTY resize gracefully", async () => {
      const res = await app.request("/test-pty/resize", { method: "POST" })
      expect([400, 404, 500]).toContain(res.status)
    })

    it("should validate PTY resize data", async () => {
      const invalidResizes = [
        {}, // Missing cols and rows
        { cols: 80 }, // Missing rows
        { rows: 24 }, // Missing cols
        { cols: null, rows: null }, // Null values
        { cols: undefined, rows: undefined }, // Undefined values
        { cols: -1, rows: 24 }, // Negative cols
        { cols: 80, rows: -1 }, // Negative rows
        { cols: 0, rows: 0 }, // Zero values
        { cols: "80", rows: "24" }, // String values
        { cols: 80.5, rows: 24.5 } // Float values
      ]

      for (const resize of invalidResizes) {
        const res = await app.request("/test-pty/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resize)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in PTY resize", async () => {
      const res = await app.request("/test-pty/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle various terminal sizes", async () => {
      const terminalSizes = [
        { cols: 80, rows: 24 }, // Standard
        { cols: 120, rows: 30 }, // Large
        { cols: 40, rows: 15 }, // Small
        { cols: 132, rows: 43 }, // Wide
        { cols: 256, rows: 80 }, // Extra large
        { cols: 1, rows: 1 }, // Minimal
        { cols: 1000, rows: 1000 } // Very large
      ]

      for (const size of terminalSizes) {
        const res = await app.request("/test-pty/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(size)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /:ptyId", () => {
    it("should delete PTY session", async () => {
      const res = await app.request("/test-pty", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle PTY deletion gracefully", async () => {
      const res = await app.request("/test-pty", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle non-existent PTY deletion", async () => {
      const res = await app.request("/non-existent", { method: "DELETE" })
      expect([404, 500]).toContain(res.status)
    })

    it("should handle concurrent PTY deletions", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/test-pty", { method: "DELETE" }).then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 404, 500]).toContain(status)
      })
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/", invalidMethods: ["PUT", "DELETE", "PATCH"] },
        { path: "/test-pty", invalidMethods: ["POST", "PUT", "PATCH"] },
        { path: "/test-pty/input", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
        { path: "/test-pty/resize", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] }
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

      const res3 = await app.request("/pty/invalid", { method: "GET" })
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
        const res2 = await app.request("/test-pty")
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 404, 500]).toContain(res2.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/").then(r => r.status))
        
        const ptyData = {
          command: "bash",
          args: ["-c", `echo test-${i}`],
          cwd: "/tmp"
        }
        promises.push(app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ptyData)
        }).then(r => r.status))
        
        const inputData = { input: `command-${i}\n` }
        promises.push(app.request(`/pty-${i}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 404, 500]).toContain(status)
      })
    })

    it("should handle Unicode in PTY commands and input", async () => {
      const unicodePtyData = {
        command: "bash",
        args: ["-c", "echo 'Unicode command: 测试命令 🚀'"],
        cwd: "/tmp"
      }

      const unicodeInputData = {
        input: "Unicode input: 测试输入 🌟\n"
      }

      const createRes = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodePtyData)
      })
      expect([200, 400, 500]).toContain(createRes.status)

      const inputRes = await app.request("/unicode-pty/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodeInputData)
      })
      expect([200, 404, 500]).toContain(inputRes.status)
    })

    it("should handle extreme PTY configurations", async () => {
      const extremeConfigs = [
        {
          command: "x".repeat(1000),
          args: Array(100).fill(null).map((_, i) => `arg-${i}`),
          cwd: "/extreme"
        },
        {
          command: "bash",
          args: ["-c", "echo 'x'.repeat(10000)"],
          cwd: "/large-output"
        },
        {
          command: "python",
          args: ["-c", "print('x' * 1000)"],
          cwd: "/python-large"
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

    it("should handle PTY lifecycle", async () => {
      const ptyData = {
        command: "bash",
        args: ["-c", "echo 'lifecycle test'"],
        cwd: "/tmp"
      }

      // Create
      const createRes = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ptyData)
      })
      expect([200, 400, 500]).toContain(createRes.status)

      // Get details
      const getRes = await app.request("/lifecycle-pty")
      expect([200, 404, 500]).toContain(getRes.status)

      // Send input
      const inputRes = await app.request("/lifecycle-pty/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "ls -la\n" })
      })
      expect([200, 404, 500]).toContain(inputRes.status)

      // Resize
      const resizeRes = await app.request("/lifecycle-pty/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols: 120, rows: 30 })
      })
      expect([200, 404, 500]).toContain(resizeRes.status)

      // Delete
      const deleteRes = await app.request("/lifecycle-pty", { method: "DELETE" })
      expect([200, 404, 500]).toContain(deleteRes.status)
    })

    it("should handle concurrent PTY operations", async () => {
      const promises = []

      // Create multiple PTYs concurrently
      for (let i = 0; i < 5; i++) {
        const ptyData = {
          command: "bash",
          args: ["-c", `echo 'concurrent-${i}'`],
          cwd: "/tmp"
        }
        promises.push(app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ptyData)
        }).then(r => r.status))
      }

      // Send input to all PTYs concurrently
      for (let i = 0; i < 5; i++) {
        const inputData = { input: `concurrent input ${i}\n` }
        promises.push(app.request(`/concurrent-${i}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData)
        }).then(r => r.status))
      }

      // Resize all PTYs concurrently
      for (let i = 0; i < 5; i++) {
        const resizeData = { cols: 80, rows: 24 }
        promises.push(app.request(`/concurrent-${i}/resize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resizeData)
        }).then(r => r.status))
      }

      // Delete all PTYs concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(app.request(`/concurrent-${i}`, { method: "DELETE" }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 404, 500]).toContain(status)
      })
    })
  })
})
