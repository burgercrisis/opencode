import { expect, test, describe } from "bun:test"
import { defer } from "../../src/util/defer"

describe("defer", () => {
  test("should call fn on Symbol.dispose", () => {
    let called = false
    const fn = () => { called = true }
    
    {
      using _ = defer(fn)
      expect(called).toBe(false)
    }
    
    expect(called).toBe(true)
  })

  test("should call fn on Symbol.asyncDispose", async () => {
    let called = false
    const fn = async () => { called = true }
    
    {
      await using _ = defer(fn)
      expect(called).toBe(false)
    }
    
    expect(called).toBe(true)
  })

  test("should handle synchronous fn in asyncDispose", async () => {
    let called = false
    const fn = () => { called = true }
    
    {
      await using _ = defer(fn)
      expect(called).toBe(false)
    }
    
    expect(called).toBe(true)
  })
})
