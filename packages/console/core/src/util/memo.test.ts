import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { memo } from "./memo"

describe("memo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("basic functionality", () => {
    test("creates memoized function", () => {
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn)
      
      expect(typeof memoized).toBe("function")
      expect(typeof memoized.reset).toBe("function")
    })

    test("calls function only once for multiple invocations", () => {
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn)
      
      const result1 = memoized()
      const result2 = memoized()
      const result3 = memoized()
      
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe("result")
      expect(result2).toBe("result")
      expect(result3).toBe("result")
    })

    test("returns same result for multiple invocations", () => {
      const mockFn = vi.fn(() => ({ data: "test", id: 42 }))
      const memoized = memo(mockFn)
      
      const result1 = memoized()
      const result2 = memoized()
      
      expect(result1).toEqual({ data: "test", id: 42 })
      expect(result2).toEqual({ data: "test", id: 42 })
      expect(result1).toBe(result2) // Same reference
    })

    test("does not call original function after first call", () => {
      let callCount = 0
      const mockFn = vi.fn(() => {
        callCount++
        return `call-${callCount}`
      })
      const memoized = memo(mockFn)
      
      const result1 = memoized()
      const result2 = memoized()
      const result3 = memoized()
      
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(callCount).toBe(1)
      expect(result1).toBe("call-1")
      expect(result2).toBe("call-1")
      expect(result3).toBe("call-1")
    })
  })

  describe("reset functionality", () => {
    test("reset function clears cached value", () => {
      let callCount = 0
      const mockFn = vi.fn(() => {
        callCount++
        return `call-${callCount}`
      })
      const memoized = memo(mockFn)
      
      // First call
      const result1 = memoized()
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe("call-1")
      
      // Reset
      await memoized.reset()
      
      // Second call after reset
      const result2 = memoized()
      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(result2).toBe("call-2")
    })

    test("reset works without cleanup function", async () => {
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn)
      
      memoized()
      expect(mockFn).toHaveBeenCalledTimes(1)
      
      await memoized.reset()
      
      memoized()
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    test("reset calls cleanup function when provided", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockFn = vi.fn(() => ({ data: "test" }))
      const memoized = memo(mockFn, mockCleanup)
      
      // Call to cache value
      memoized()
      expect(mockFn).toHaveBeenCalledTimes(1)
      
      // Reset should call cleanup
      await memoized.reset()
      expect(mockCleanup).toHaveBeenCalledWith({ data: "test" })
      expect(mockCleanup).toHaveBeenCalledTimes(1)
    })

    test("reset does not call cleanup when no value is cached", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      // Reset without calling memoized first
      await memoized.reset()
      expect(mockCleanup).not.toHaveBeenCalled()
    })

    test("reset handles cleanup errors gracefully", async () => {
      const mockCleanup = vi.fn().mockRejectedValue(new Error("Cleanup failed"))
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      memoized()
      
      // Reset should not throw even if cleanup fails
      await expect(memoized.reset()).resolves.not.toThrow()
      expect(mockCleanup).toHaveBeenCalled()
    })

    test("reset allows new value to be computed", async () => {
      let callCount = 0
      const mockFn = vi.fn(() => {
        callCount++
        return `value-${callCount}`
      })
      const memoized = memo(mockFn)
      
      const result1 = memoized()
      expect(result1).toBe("value-1")
      
      await memoized.reset()
      
      const result2 = memoized()
      expect(result2).toBe("value-2")
      
      await memoized.reset()
      
      const result3 = memoized()
      expect(result3).toBe("value-3")
    })
  })

  describe("cleanup function", () => {
    test("cleanup function receives cached value", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockFn = vi.fn(() => ({ id: 123, name: "test" }))
      const memoized = memo(mockFn, mockCleanup)
      
      const value = memoized()
      expect(value).toEqual({ id: 123, name: "test" })
      
      await memoized.reset()
      expect(mockCleanup).toHaveBeenCalledWith({ id: 123, name: "test" })
    })

    test("cleanup function is called on reset", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      memoized()
      await memoized.reset()
      
      expect(mockCleanup).toHaveBeenCalledTimes(1)
      expect(mockCleanup).toHaveBeenCalledWith("result")
    })

    test("cleanup function handles async operations", async () => {
      let cleanupResolved = false
      const mockCleanup = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        cleanupResolved = true
      })
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      memoized()
      
      await memoized.reset()
      expect(cleanupResolved).toBe(true)
      expect(mockCleanup).toHaveBeenCalled()
    })

    test("cleanup function is not called if no value cached", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      // Reset without calling memoized
      await memoized.reset()
      expect(mockCleanup).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    test("handles function errors properly", () => {
      const mockError = new Error("Function failed")
      const mockFn = vi.fn(() => {
        throw mockError
      })
      const memoized = memo(mockFn)
      
      expect(() => memoized()).toThrow("Function failed")
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("does not cache error results", () => {
      const mockFn = vi.fn()
        .mockImplementationOnce(() => {
          throw new Error("First call failed")
        })
        .mockImplementationOnce(() => "success")
      
      const memoized = memo(mockFn)
      
      // First call throws
      expect(() => memoized()).toThrow("First call failed")
      expect(mockFn).toHaveBeenCalledTimes(1)
      
      // Second call should retry and succeed
      const result = memoized()
      expect(result).toBe("success")
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    test("handles cleanup function errors", async () => {
      const mockCleanup = vi.fn().mockRejectedValue(new Error("Cleanup failed"))
      const mockFn = vi.fn(() => "result")
      const memoized = memo(mockFn, mockCleanup)
      
      memoized()
      
      // Reset should not throw even if cleanup fails
      await expect(memoized.reset()).resolves.not.toThrow()
      expect(mockCleanup).toHaveBeenCalled()
    })
  })

  describe("different return types", () => {
    test("handles string return values", () => {
      const mockFn = vi.fn(() => "string result")
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBe("string result")
      expect(typeof result).toBe("string")
    })

    test("handles number return values", () => {
      const mockFn = vi.fn(() => 42)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBe(42)
      expect(typeof result).toBe("number")
    })

    test("handles boolean return values", () => {
      const mockFn = vi.fn(() => true)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBe(true)
      expect(typeof result).toBe("boolean")
    })

    test("handles object return values", () => {
      const mockFn = vi.fn(() => ({ key: "value", count: 10 }))
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toEqual({ key: "value", count: 10 })
      expect(typeof result).toBe("object")
    })

    test("handles array return values", () => {
      const mockFn = vi.fn(() => [1, 2, 3, 4, 5])
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toEqual([1, 2, 3, 4, 5])
      expect(Array.isArray(result)).toBe(true)
    })

    test("handles null return values", () => {
      const mockFn = vi.fn(() => null)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBeNull()
    })

    test("handles undefined return values", () => {
      const mockFn = vi.fn(() => undefined)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBeUndefined()
    })
  })

  describe("complex scenarios", () => {
    test("works with async functions", async () => {
      const mockFn = vi.fn().mockResolvedValue("async result")
      const memoized = memo(mockFn)
      
      const result = await memoized()
      expect(result).toBe("async result")
      expect(mockFn).toHaveBeenCalledTimes(1)
      
      // Second call should use cached value
      const result2 = await memoized()
      expect(result2).toBe("async result")
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("works with functions that return promises", () => {
      const mockFn = vi.fn(() => Promise.resolve("promise result"))
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBeInstanceOf(Promise)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("handles functions with side effects", () => {
      let sideEffectCount = 0
      const mockFn = vi.fn(() => {
        sideEffectCount++
        return `result-${sideEffectCount}`
      })
      const memoized = memo(mockFn)
      
      const result1 = memoized()
      const result2 = memoized()
      
      expect(sideEffectCount).toBe(1)
      expect(result1).toBe("result-1")
      expect(result2).toBe("result-1")
    })

    test("preserves function context", () => {
      const obj = {
        value: "test",
        getValue: function() {
          return this.value
        }
      }
      
      const memoized = memo(obj.getValue.bind(obj))
      const result = memoized()
      
      expect(result).toBe("test")
    })
  })

  describe("edge cases", () => {
    test("handles empty functions", () => {
      const mockFn = vi.fn(() => {})
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBeUndefined()
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("handles functions that return functions", () => {
      const innerFn = vi.fn(() => "inner result")
      const mockFn = vi.fn(() => innerFn)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(typeof result).toBe("function")
      expect(result).toBe(innerFn)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("handles functions that return Date objects", () => {
      const now = new Date()
      const mockFn = vi.fn(() => now)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBe(now)
      expect(result).toBeInstanceOf(Date)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test("handles functions that return RegExp objects", () => {
      const regex = /test/g
      const mockFn = vi.fn(() => regex)
      const memoized = memo(mockFn)
      
      const result = memoized()
      expect(result).toBe(regex)
      expect(result).toBeInstanceOf(RegExp)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })
})
