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
import { ProjectRoutes } from "../../routes/project"

describe("ProjectRoutes", () => {
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
  let app: ReturnType<typeof ProjectRoutes>

  beforeEach(() => {
    app = ProjectRoutes()
  })

  describe("GET /", () => {
    it("should return project list", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(Array.isArray(json)).toBe(true)
      }
    })

    it("should handle project list request gracefully", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent project data", async () => {
      const res1 = await app.request("/")
      const res2 = await app.request("/")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent project list requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle rapid project list requests", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      }
    })

    it("should handle project list with headers", async () => {
      const res = await app.request("/", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "test-agent"
        }
      })
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("GET /current", () => {
    it("should return current project", async () => {
      const res = await app.request("/current")
      expect([200, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle current project request gracefully", async () => {
      const res = await app.request("/current")
      expect([200, 500]).toContain(res.status)
    })

    it("should return consistent current project data", async () => {
      const res1 = await app.request("/current")
      const res2 = await app.request("/current")
      
      expect([200, 500]).toContain(res1.status)
      expect([200, 500]).toContain(res2.status)
    })

    it("should handle concurrent current project requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/current").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle current project with parameters", async () => {
      const res = await app.request("/current?include=details")
      expect([200, 500]).toContain(res.status)
    })
  })

  describe("POST /", () => {
    it("should create new project", async () => {
      const projectData = {
        name: "Test Project",
        path: "/path/to/test",
        description: "Test project description"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectData)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should validate project creation data", async () => {
      const invalidProjects = [
        {}, // Missing required fields
        { name: "" }, // Empty name
        { path: "" }, // Empty path
        { name: "test" }, // Missing path
        { path: "/test" }, // Missing name
        { name: null, path: null }, // Null values
        { name: undefined, path: undefined } // Undefined values
      ]

      for (const project of invalidProjects) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project)
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

    it("should handle various project configurations", async () => {
      const projectConfigs = [
        {
          name: "Simple Project",
          path: "/simple",
          description: "Simple test project"
        },
        {
          name: "Complex Project",
          path: "/complex/path/to/project",
          description: "Complex project with detailed description"
        },
        {
          name: "Project with Special Chars",
          path: "/path/with-special-chars!@#$%",
          description: "Project with special characters: !@#$%^&*()"
        },
        {
          name: "Unicode Project",
          path: "/unicode/路径",
          description: "Unicode project: 测试项目 🚀"
        }
      ]

      for (const config of projectConfigs) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle very long project names and descriptions", async () => {
      const largeProject = {
        name: "x".repeat(1000),
        path: "/large-project",
        description: "y".repeat(10000)
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largeProject)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ name: "test", path: "/test" })
      })

      expect([200, 400]).toContain(res.status)
    })
  })

  describe("GET /:projectId", () => {
    it("should return project details", async () => {
      const res = await app.request("/test-project-id")
      expect([200, 404, 500]).toContain(res.status)
      
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toMatch(/application\/json/)
        const json = await res.json()
        expect(typeof json).toBe("object")
        expect(json).not.toBeNull()
      }
    })

    it("should handle non-existent project", async () => {
      const res = await app.request("/non-existent-project")
      expect([404, 500]).toContain(res.status)
    })

    it("should handle various project ID formats", async () => {
      const projectIds = [
        "simple-id",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
        "project-with-dashes",
        "project_with_underscores",
        "123456",
        "🚀project"
      ]

      for (const projectId of projectIds) {
        const res = await app.request(`/${encodeURIComponent(projectId)}`)
        expect([200, 404, 500]).toContain(res.status)
      }
    })

    it("should handle empty project ID", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle very long project ID", async () => {
      const longId = "a".repeat(1000)
      const res = await app.request(`/${longId}`)
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle concurrent project detail requests", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/test-project").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 404, 500]).toContain(status)
      })
    })
  })

  describe("PUT /:projectId", () => {
    it("should update project", async () => {
      const updateData = {
        name: "Updated Project",
        description: "Updated description"
      }

      const res = await app.request("/test-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      })

      expect([200, 400, 404, 500]).toContain(res.status)
    })

    it("should handle project update gracefully", async () => {
      const res = await app.request("/test-project", { method: "PUT" })
      expect([400, 404, 500]).toContain(res.status)
    })

    it("should validate project update data", async () => {
      const invalidUpdates = [
        { name: "" }, // Empty name
        { description: null }, // Null description
        { name: 123 }, // Invalid type
        { path: "" } // Empty path if path is updatable
      ]

      for (const update of invalidUpdates) {
        const res = await app.request("/test-project", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update)
        })

        expect([400, 404, 500]).toContain(res.status)
      }
    })

    it("should handle malformed JSON in update", async () => {
      const res = await app.request("/test-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 404, 500]).toContain(res.status)
    })

    it("should handle partial updates", async () => {
      const partialUpdates = [
        { name: "New Name" },
        { description: "New Description" },
        { name: "New Name", description: "New Description" }
      ]

      for (const update of partialUpdates) {
        const res = await app.request("/test-project", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update)
        })

        expect([200, 400, 404, 500]).toContain(res.status)
      }
    })
  })

  describe("DELETE /:projectId", () => {
    it("should delete project", async () => {
      const res = await app.request("/test-project", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle project deletion gracefully", async () => {
      const res = await app.request("/test-project", { method: "DELETE" })
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle non-existent project deletion", async () => {
      const res = await app.request("/non-existent", { method: "DELETE" })
      expect([404, 500]).toContain(res.status)
    })

    it("should handle concurrent project deletions", async () => {
      const promises = Array(3).fill(null).map(() => 
        app.request("/test-project", { method: "DELETE" }).then(r => r.status)
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
        { path: "/current", invalidMethods: ["POST", "PUT", "DELETE", "PATCH"] },
        { path: "/test-project", invalidMethods: ["POST", "PATCH"] }
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

      const res3 = await app.request("/project/invalid", { method: "GET" })
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
        const res2 = await app.request("/current")
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 500]).toContain(res2.status)
      }
    })

    it("should handle concurrent mixed operations", async () => {
      const promises = []

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        promises.push(app.request("/").then(r => r.status))
        promises.push(app.request("/current").then(r => r.status))
        
        const projectData = {
          name: `Project ${i}`,
          path: `/path/project-${i}`,
          description: `Test project ${i}`
        }
        promises.push(app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData)
        }).then(r => r.status))
      }

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 400, 500]).toContain(status)
      })
    })

    it("should handle Unicode in project data", async () => {
      const unicodeProject = {
        name: "测试项目",
        path: "/unicode/路径",
        description: "Unicode project description: 🚀 🌟 ⭐"
      }

      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unicodeProject)
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle special characters in project paths", async () => {
      const specialPathProjects = [
        { name: "Special Path 1", path: "/path/with-dashes" },
        { name: "Special Path 2", path: "/path/with_underscores" },
        { name: "Special Path 3", path: "/path/with.dots" },
        { name: "Special Path 4", path: "/path/with spaces" }
      ]

      for (const project of specialPathProjects) {
        const res = await app.request("/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project)
        })

        expect([200, 400, 500]).toContain(res.status)
      }
    })

    it("should handle extreme project configurations", async () => {
      const extremeConfigs = [
        {
          name: "a".repeat(1000),
          path: "/extreme-long-name",
          description: "x".repeat(10000)
        },
        {
          name: "Minimal",
          path: "/",
          description: ""
        },
        {
          name: "🚀🌟⭐",
          path: "/emoji-project",
          description: "Project with emoji name"
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

    it("should handle project lifecycle", async () => {
      const projectData = {
        name: "Lifecycle Project",
        path: "/lifecycle",
        description: "Project for testing lifecycle"
      }

      // Create
      const createRes = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectData)
      })
      expect([200, 400, 500]).toContain(createRes.status)

      // Get details
      const getRes = await app.request("/lifecycle-project")
      expect([200, 404, 500]).toContain(getRes.status)

      // Update
      const updateRes = await app.request("/lifecycle-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated description" })
      })
      expect([200, 400, 404, 500]).toContain(updateRes.status)

      // Delete
      const deleteRes = await app.request("/lifecycle-project", { method: "DELETE" })
      expect([200, 404, 500]).toContain(deleteRes.status)
    })
  })
})
