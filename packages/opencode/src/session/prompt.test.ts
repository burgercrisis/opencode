import { describe, expect, test } from "bun:test"

describe("SessionPrompt", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./prompt")
      expect(mod).toBeDefined()
      expect(mod.SessionPrompt).toBeDefined()
    })
  })
})