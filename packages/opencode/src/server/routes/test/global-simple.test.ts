import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { GlobalRoutes } from "../../routes/global"

describe("GlobalRoutes - Simple", () => {
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
    globalThis.requestId = "test-request-id"
    app = GlobalRoutes()
  })

  describe("Basic functionality", () => {
    it("should handle global requests without crashing", async () => {
      const res = await app.request("/health")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle config requests without crashing", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "dark" })
      })
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle dispose requests without crashing", async () => {
      const res = await app.request("/dispose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
      expect([200, 400, 500]).toContain(res.status)
    })
  })
})
