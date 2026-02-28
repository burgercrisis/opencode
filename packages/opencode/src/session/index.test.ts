import { describe, expect, test } from "bun:test"

describe("Session", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./index")
      expect(mod).toBeDefined()
      expect(mod.Session).toBeDefined()
    })
  })
})