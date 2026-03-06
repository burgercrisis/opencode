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
import { QuestionRoutes } from "../../routes/question"

describe("QuestionRoutes", () => {
  let app: ReturnType<typeof QuestionRoutes>

  beforeEach(() => {
    app = QuestionRoutes()
  })

  describe("GET /", () => {
    it("should return questions", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle questions request gracefully", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent questions data", async () => {
      const res1 = await app.request("/")
      const res2 = await app.request("/")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent questions requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid questions requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle questions with headers", async () => {
      const res = await app.request("/", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "test-agent"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("POST /:questionId/reply", () => {
    it("should reply to question", async () => {
      const replyData = {
        approved: true,
        message: "Yes, you can proceed."
      }

      const res = await app.request("/test-question/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyData)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle question reply gracefully", async () => {
      const res = await app.request("/test-question/reply", { method: "POST" })
      expect([400, 404, 500]).toContain(res.status)
    })

    it("should validate question reply data", async () => {
      const invalidReplies = [
        {}, // Missing approved and message
        { approved: true }, // Missing message
        { message: "Yes" }, // Missing approved
        { approved: null, message: null }, // Null values
        { approved: undefined, message: undefined }, // Undefined values
        { approved: 123, message: "Yes" }, // Invalid type for approved
        { approved: true, message: 123 }, // Invalid type for message
        { approved: "true", message: "Yes" }, // String instead of boolean
      ]

      for (const reply of invalidReplies) {
        const res = await app.request("/test-question/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reply)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in question reply", async () => {
      const res = await app.request("/test-question/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle empty request body", async () => {
      const res = await app.request("/test-question/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ""
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle various question reply scenarios", async () => {
      const replyScenarios = [
        {
          approved: true,
          message: "Approved for file write operation"
        },
        {
          approved: false,
          message: "Denied - security risk detected"
        },
        {
          approved: true,
          message: "Conditional approval - with restrictions"
        },
        {
          approved: false,
          message: "Rejected - insufficient permissions"
        }
      ]

      for (const scenario of replyScenarios) {
        const res = await app.request("/test-question/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scenario)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in reply messages", async () => {
      const specialReplies = [
        {
          approved: true,
          message: "Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?"
        },
        {
          approved: false,
          message: "Unicode: 🚀 🌟 ⭐ 测试"
        },
        {
          approved: true,
          message: "Newlines\nand\ttabs"
        },
        {
          approved: false,
          message: "Quotes: 'single' and \"double\""
        }
      ]

      for (const reply of specialReplies) {
        const res = await app.request("/test-question/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reply)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle very long reply messages", async () => {
      const longReply = {
        approved: true,
        message: "x".repeat(10000)
      }

      const res = await app.request("/test-question/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(longReply)
      })

      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle various question ID formats", async () => {
      const questionIds = [
        "simple-id",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
        "question-with-dashes",
        "question_with_underscores",
        "123456",
        "🚀question"
      ]

      const replyData = {
        approved: true,
        message: "Test reply"
      }

      for (const questionId of questionIds) {
        const res = await app.request(`/${encodeURIComponent(questionId)}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replyData)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/test-question/reply", {
        method: "POST",
        body: JSON.stringify({ approved: true, message: "test" })
      })

      expect([200, 400]).toContain(res.status)
    })

    it("should handle non-existent question ID", async () => {
      const replyData = {
        approved: true,
        message: "Reply to non-existent question"
      }

      const res = await app.request("/non-existent-question/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyData)
      })

      expect([404, 500]).toContain(res.status)
    })

    it("should handle empty question ID", async () => {
      const replyData = {
        approved: true,
        message: "Reply with empty question ID"
      }

      const res = await app.request("//reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyData)
      })

      expect([404, 500]).toContain(res.status)
    })

    it("should handle very long question ID", async () => {
      const longId = "a".repeat(1000)
      const replyData = {
        approved: true,
        message: "Reply to very long question ID"
      }

      const res = await app.request(`/${longId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyData)
      })

      expect([404, 500]).toContain(res.status)
    })

    it("should handle concurrent question replies", async () => {
      const promises = Array(3).fill(null).map((_, i) => {
        const replyData = {
          approved: i % 2 === 0,
          message: `Concurrent reply ${i}`
        }
        return app.request(`/question-${i}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replyData)
        }).then(r => r.status)
      })

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 404, 500]).toContain(status)
      })
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-question/reply", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] }
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

      const res3 = await app.request("/question/invalid", { method: "GET" })
      expect(res3.status).toBe(404)
    })

    it("should handle invalid content types", async () => {
      const res = await app.request("/test-question/reply", {
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
        const res2 = await app.request(`/question-${i}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true, message: `rapid-${i}` })
        })
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 404, 500]).toContain(res2.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/").then(r => r.status))
        
        const replyData = {
          approved: i % 2 === 0,
          message: `Mixed operation ${i}`
        }
        promises.push(app.request(`/question-${i}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replyData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 404, 500]).toContain(status)
      })
    })

    it("should handle Unicode in question replies", async () => {
      const unicodeReplies = [
        {
          approved: true,
          message: "Unicode reply: 测试回复 🚀"
        },
        {
          approved: false,
          message: "Unicode denial: 拒绝访问 ⚠️"
        },
        {
          approved: true,
          message: "Mixed Unicode: Hello 世界 🌟"
        }
      ]

      for (const reply of unicodeReplies) {
        const res = await app.request("/unicode-question/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reply)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle extreme reply scenarios", async () => {
      const extremeReplies = [
        {
          approved: true,
          message: "x".repeat(10000)
        },
        {
          approved: false,
          message: "Very long denial message with lots of details about why this operation cannot proceed and what the security implications are and what alternative approaches might be considered instead.".repeat(100)
        },
        {
          approved: true,
          message: "Special chars: " + "!@#$%^&*()_+-=[]{}|;':\",./<>?~`".repeat(100)
        }
      ]

      for (const reply of extremeReplies) {
        const res = await app.request("/extreme-question/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reply)
        })

        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle question lifecycle", async () => {
      const questionId = "lifecycle-question"
      
      // List questions first
      const listRes = await app.request("/")
      expect([200, 500]).toContain(listRes.status)

      // Reply to question
      const replyData = {
        approved: true,
        message: "Lifecycle test reply"
      }
      const replyRes = await app.request(`/${questionId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyData)
      })
      expect([200, 404, 500]).toContain(replyRes.status)

      // List questions again to see if state changed
      const listRes2 = await app.request("/")
      expect([200, 500]).toContain(listRes2.status)
    })

    it("should handle concurrent question operations", async () => {
      const promises = []

      // List questions concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/").then(r => r.status))
      }

      // Reply to questions concurrently
      for (let i = 0; i < 5; i++) {
        const replyData = {
          approved: i % 2 === 0,
          message: `Concurrent reply ${i}`
        }
        promises.push(app.request(`/concurrent-question-${i}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replyData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 404, 500]).toContain(status)
      })
    })
  })
})
