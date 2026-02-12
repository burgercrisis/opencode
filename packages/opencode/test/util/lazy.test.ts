import { expect, test, describe } from "bun:test"
import { lazy } from "../../src/util/lazy"

describe("util.lazy", () => {
  test("lazy should initialize once", () => {
    let calls = 0
    const l = lazy(() => {
      calls++
      return "foo"
    })
    
    expect(calls).toBe(0)
    expect(l()).toBe("foo")
    expect(calls).toBe(1)
    expect(l()).toBe("foo")
    expect(calls).toBe(1)
  })

  test("lazy should reset", () => {
    let calls = 0
    const l = lazy(() => {
      calls++
      return "foo"
    })
    
    l()
    expect(calls).toBe(1)
    l.reset()
    expect(l()).toBe("foo")
    expect(calls).toBe(2)
  })
})
