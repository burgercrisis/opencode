import { describe, expect, test } from "bun:test"

describe("SessionSummary", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./summary")
      expect(mod).toBeDefined()
      expect(mod.SessionSummary).toBeDefined()
    })
  })
})