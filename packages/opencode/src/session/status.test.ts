import { describe, expect, test } from "bun:test"

describe("SessionStatus", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./status")
      expect(mod).toBeDefined()
      expect(mod.SessionStatus).toBeDefined()
    })
  })
})