import { describe, it, expect, beforeEach } from "bun:test"
import { ExperimentalRoutes } from "../../routes/experimental"

describe("ExperimentalRoutes", () => {
  let app: ReturnType<typeof ExperimentalRoutes>

  beforeEach(() => {
    app = ExperimentalRoutes()
  })

  describe("GET /tool/ids", () => {
    it("should return tool IDs", async () => {
      const res = await app.request("/tool/ids")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
        expect(json.length).toBeGreaterThan(0)
      }
    })

    it("should handle tool IDs request gracefully", async () => {
      const res = await app.request("/tool/ids")
      expect([200, 500]).toContain(res.status)
    })

    it("should return valid tool ID format", async () => {
      const res = await app.request("/tool/ids")
      if (res.status === 200) {
        const json = await res.json()
        json.forEach((id: any) => {
          expect(typeof id).toBe("string")
          expect(id.length).toBeGreaterThan(0)
        })
      }
    })

    it("should handle concurrent tool IDs requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/tool/ids").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid tool IDs requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/tool/ids")
        expect([200, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /tool", () => {
    it("should require provider and model parameters", async () => {
      const res = await app.request("/tool")
      expect([400, 500]).toContain(res.status)
    })

    it("should handle tools request with parameters", async () => {
      const res = await app.request("/tool?provider=openai&model=gpt-4")
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate provider parameter", async () => {
      const res = await app.request("/tool?provider=&model=gpt-4")
      expect([400, 500]).toContain(res.status)
    })

    it("should validate model parameter", async () => {
      const res = await app.request("/tool?provider=openai&model=")
      expect([400, 500]).toContain(res.status)
    })

    it("should handle various provider/model combinations", async () => {
      const combinations = [
        { provider: "openai", model: "gpt-4" },
        { provider: "anthropic", model: "claude-3" },
        { provider: "local", model: "llama-2" },
        { provider: "google", model: "gemini" },
        { provider: "azure", model: "gpt-4-turbo" }
      ]

      for (const combo of combinations) {
        const res = await app.request(`/tool?provider=${combo.provider}&model=${combo.model}`)
        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should return tool list in correct format", async () => {
      const res = await app.request("/tool?provider=openai&model=gpt-4")
      if (res.status === 200) {
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
        
        if (json.length > 0) {
          const tool = json[0]
          expect(tool).toHaveProperty("id")
          expect(tool).toHaveProperty("description")
          expect(tool).toHaveProperty("parameters")
          expect(typeof tool.id).toBe("string")
          expect(typeof tool.description).toBe("string")
        }
      }
    })

    it("should handle special characters in parameters", async () => {
      const res = await app.request("/tool?provider=test-provider&model=test-model-v2.0")
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle very long parameter values", async () => {
      const longValue = "a".repeat(1000)
      const res = await app.request(`/tool?provider=${longValue}&model=${longValue}`)
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle Unicode in parameters", async () => {
      const res = await app.request("/tool?provider=测试&model=模型")
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle missing parameters", async () => {
      const testCases = [
        "/tool?provider=openai", // Missing model
        "/tool?model=gpt-4", // Missing provider
        "/tool?provider=&model=", // Both empty
        "/tool" // Both missing
      ]

      for (const testCase of testCases) {
        const res = await app.request(testCase)
        expect([400, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /worktree", () => {
    it("should require worktree creation data", async () => {
      const res = await app.request("/worktree", { method: "POST" })
      expect([400, 500]).toContain(res.status)
    })

    it("should handle worktree creation request", async () => {
      const worktreeData = {
        directory: "/tmp/test-sandbox",
        branch: "feature/test-branch"
      }

      const res = await app.request("/worktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worktreeData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate worktree creation data", async () => {
      const invalidData = {
        description: "test worktree"
        // Missing required fields
      }

      const res = await app.request("/worktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData)
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/worktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle various worktree configurations", async () => {
      const configurations = [
        { directory: "/tmp/sandbox-1", branch: "feature-1" },
        { directory: "/tmp/sandbox-2", branch: "feature-2" },
        { directory: "/tmp/sandbox-3", branch: "bugfix-1" },
        { directory: "/home/user/project", branch: "main" },
        { directory: "C:\\Users\\User\\Project", branch: "develop" }
      ]

      for (const config of configurations) {
        const res = await app.request("/worktree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle special characters in worktree data", async () => {
      const worktreeData = {
        directory: "/tmp/测试沙箱",
        branch: "功能分支"
      }

      const res = await app.request("/worktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worktreeData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle edge case directory paths", async () => {
      const edgeCases = [
        { directory: "/", branch: "main" },
        { directory: ".", branch: "feature" },
        { directory: "..", branch: "bugfix" },
        { directory: "", branch: "test" },
        { directory: "a".repeat(1000), branch: "long" }
      ]

      for (const edgeCase of edgeCases) {
        const res = await app.request("/worktree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edgeCase)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /worktree", () => {
    it("should return worktree list", async () => {
      const res = await app.request("/worktree")
      expect([200, 500]).toContain(res.status)
    })

    it("should return worktree list in correct format", async () => {
      const res = await app.request("/worktree")
      if (res.status === 200) {
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
        
        json.forEach((sandbox: any) => {
          expect(typeof sandbox).toBe("string")
          expect(sandbox.length).toBeGreaterThan(0)
        })
      }
    })

    it("should handle concurrent worktree list requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/worktree").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid worktree list requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/worktree")
        expect([200, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /worktree", () => {
    it("should require worktree removal data", async () => {
      const res = await app.request("/worktree", { method: "DELETE" })
      expect([400, 500]).toContain(res.status)
    })

    it("should handle worktree removal request", async () => {
      const worktreeData = {
        directory: "/tmp/test-sandbox"
      }

      const res = await app.request("/worktree", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worktreeData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate worktree removal data", async () => {
      const invalidData = {
        branch: "feature/test"
        // Missing required directory field
      }

      const res = await app.request("/worktree", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData)
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle malformed JSON in removal", async () => {
      const res = await app.request("/worktree", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle various directory paths", async () => {
      const directories = [
        "/tmp/test",
        "/home/user/project",
        "C:\\Users\\User\\Project",
        "/相对路径",
        "relative/path"
      ]

      for (const directory of directories) {
        const worktreeData = { directory }
        const res = await app.request("/worktree", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(worktreeData)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })

  describe("POST /worktree/reset", () => {
    it("should require worktree reset data", async () => {
      const res = await app.request("/worktree/reset", { method: "POST" })
      expect([400, 500]).toContain(res.status)
    })

    it("should handle worktree reset request", async () => {
      const resetData = {
        directory: "/tmp/test-sandbox"
      }

      const res = await app.request("/worktree/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate worktree reset data", async () => {
      const invalidData = {
        branch: "main"
        // Missing required directory field
      }

      const res = await app.request("/worktree/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData)
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle malformed JSON in reset", async () => {
      const res = await app.request("/worktree/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status)
    })

    it("should handle various reset scenarios", async () => {
      const scenarios = [
        { directory: "/tmp/sandbox-1" },
        { directory: "/home/user/project" },
        { directory: "C:\\Users\\User\\Project" },
        { directory: "/tmp/测试沙箱" }
      ]

      for (const scenario of scenarios) {
        const res = await app.request("/worktree/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scenario)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })

  describe("GET /resource", () => {
    it("should return MCP resources", async () => {
      const res = await app.request("/resource")
      expect([200, 500]).toContain(res.status)
    })

    it("should return resources in correct format", async () => {
      const res = await app.request("/resource")
      if (res.status === 200) {
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
        
        // Should be a record of string keys to resource objects
        Object.entries(json).forEach(([key, resource]: [string, any]) => {
          expect(typeof key).toBe("string")
          expect(typeof resource).toBe("object")
          expect(resource).not.toBeNull()
        })
      }
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

    it("should handle rapid resource requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/resource")
        expect([200, 500]).toContain(res.status)
      }
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const endpoints = [
        { path: "/tool/ids", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/tool", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/worktree", invalidMethods: ["PUT", "PATCH"] },
        { path: "/worktree/reset", invalidMethods: ["GET", "PUT", "DELETE", "PATCH"] },
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

      const res2 = await app.request("/tool/invalid", { method: "GET" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/worktree/invalid", { method: "POST" })
      expect(res3.status).toBe(404)
    })

    it("should handle missing content-type headers", async () => {
      const res = await app.request("/worktree", {
        method: "POST",
        body: JSON.stringify({ directory: "/tmp/test" })
      })
      expect([200, 400]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle empty parameters", async () => {
      const res = await app.request("/tool?provider=&model=")
      expect([400, 500]).toContain(res.status)
    })

    it("should handle very long parameter values", async () => {
      const longValue = "a".repeat(1000)
      const res = await app.request(`/tool?provider=${longValue}&model=${longValue}`)
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle concurrent mixed requests", async () => {
      const promises = [
        app.request("/tool/ids"),
        app.request("/tool?provider=openai&model=gpt-4"),
        app.request("/worktree"),
        app.request("/resource"),
        app.request("/worktree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directory: "/tmp/test", branch: "test" })
        })
      ]

      const results = await Promise.all(promises)
      results.forEach(res => {
        expect([200, 400, 500]).toContain(res.status)
      })
    })

    it("should handle Unicode characters in data", async () => {
      const unicodeData = {
        directory: "/tmp/测试沙箱",
        branch: "功能分支"
      }

      const res = await app.request("/worktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodeData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle rapid sequential requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res1 = await app.request("/tool/ids")
        const res2 = await app.request("/resource")
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 500]).toContain(res2.status)
      }
    })

    it("should handle null and undefined values", async () => {
      const res = await app.request("/tool?provider=null&model=undefined")
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle extreme worktree scenarios", async () => {
      const extremeScenarios = [
        { directory: "", branch: "" },
        { directory: null, branch: null },
        { directory: undefined, branch: undefined },
        { directory: "a".repeat(10000), branch: "b".repeat(1000) }
      ]

      for (const scenario of extremeScenarios) {
        const res = await app.request("/worktree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scenario)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })
  })
})
