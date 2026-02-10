import { expect, test, describe } from "bun:test"
import { signal } from "../../src/util/signal"

describe("signal", () => {
  test("should resolve wait when triggered", async () => {
    const s = signal()
    let resolved = false
    s.wait().then(() => { resolved = true })
    
    expect(resolved).toBe(false)
    s.trigger()
    await s.wait()
    expect(resolved).toBe(true)
  })
})
