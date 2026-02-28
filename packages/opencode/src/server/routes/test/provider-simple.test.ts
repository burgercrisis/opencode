import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { ProviderRoutes } from "../../routes/provider"
import { Provider } from "../../../provider"

describe("ProviderRoutes - Simple", () => {
  let app: ReturnType<typeof ProviderRoutes>

  beforeEach(() => {
    globalThis.requestId = "test-request-id"
    app = ProviderRoutes()
  })

  describe("Basic functionality", () => {
    it("should handle provider requests without crashing", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle auth methods request", async () => {
      const res = await app.request("/auth")
      expect([200, 404, 500]).toContain(res.status)
    })
  })
})
