import { expect, test, describe, vi } from "bun:test"
import { lazy } from "../../src/util/lazy"

describe("lazy", () => {
  test("should only call fn once", () => {
    const fn = vi.fn().mockReturnValue(1)
    const get = lazy(fn)
    
    expect(fn).toHaveBeenCalledTimes(0)
    expect(get()).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(get()).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("should reset", () => {
    const fn = vi.fn().mockReturnValue(2)
    const get = lazy(fn)
    
    expect(get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(1)
    
    get.reset()
    expect(get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test("should handle undefined/null values", () => {
    const fn = vi.fn().mockReturnValue(null)
    const get = lazy(fn)
    
    expect(get()).toBe(null)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(get()).toBe(null)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
