import { describe, expect, test } from "bun:test"

describe("SessionRetry", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./retry")
      expect(mod).toBeDefined()
      expect(mod.SessionRetry).toBeDefined()
    })
  })
})