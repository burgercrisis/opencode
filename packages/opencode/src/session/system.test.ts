import { describe, expect, test } from "bun:test"

describe("SystemPrompt", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./system")
      expect(mod).toBeDefined()
      expect(mod.SystemPrompt).toBeDefined()
    })
  })
})