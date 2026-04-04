import { describe, expect, test } from "bun:test"

describe("MessageV2", () => {
  describe("module", () => {
    test("can be imported", async () => {
      const mod = await import("./message-v2")
      expect(mod).toBeDefined()
      expect(mod.MessageV2).toBeDefined()
    })
  })
})