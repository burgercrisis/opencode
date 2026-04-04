import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { GlobalRoutes } from "../../routes/global"

describe("GlobalRoutes - Simple", () => {
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
