import { expect, test, describe } from "bun:test"
import { withTimeout } from "../../src/util/timeout"

describe("withTimeout", () => {
  test("should resolve if promise finishes in time", async () => {
    const p = new Promise(r => setTimeout(() => r("ok"), 10))
    const result = await withTimeout(p, 50)
    expect(result).toBe("ok")
  })

  test("should reject if promise times out", async () => {
    const p = new Promise(r => setTimeout(() => r("ok"), 50))
    expect(withTimeout(p, 10)).rejects.toThrow("Operation timed out after 10ms")
  })
})
