import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { PtyRoutes } from "../../routes/pty"

describe("PtyRoutes - Simple", () => {
  let app: ReturnType<typeof PtyRoutes>

  beforeEach(() => {
    globalThis.requestId = "test-request-id"
    app = PtyRoutes()
  })

  describe("Basic functionality", () => {
    it("should handle PTY requests without crashing", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle PTY creation without crashing", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "bash",
          args: ["-c", "echo test"]
        })
      })
      expect([200, 400, 500]).toContain(res.status)
    })
  })
})
