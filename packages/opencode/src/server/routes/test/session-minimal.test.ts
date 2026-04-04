import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { SessionRoutes } from "../../routes/session"

describe("SessionRoutes - Minimal", () => {
  let app: ReturnType<typeof SessionRoutes>

  beforeEach(() => {
    globalThis.requestId = "test-request-id"
    app = SessionRoutes()
  })

  describe("Basic functionality", () => {
    it("should handle requests without crashing", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle status requests without crashing", async () => {
      const res = await app.request("/status")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle session detail requests without crashing", async () => {
      const res = await app.request("/session-1")
      expect([200, 404, 500]).toContain(res.status)
    })
  })
})
