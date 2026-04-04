import { describe, test, expect } from "bun:test"

describe("Basic Test Framework Test", () => {
  test("should run basic test", () => {
    expect(1 + 1).toBe(2)
  })

  test("should handle async test", async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(true).toBe(true)
  })
})
