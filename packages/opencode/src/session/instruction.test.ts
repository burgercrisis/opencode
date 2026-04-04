import { describe, expect, test } from "bun:test"

describe("InstructionPrompt", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./instruction")
      expect(mod).toBeDefined()
      expect(mod.InstructionPrompt).toBeDefined()
    })
  })
})