import { describe, it, expect } from "bun:test"
import { withTimeout } from "../timeout"

describe("withTimeout", () => {
  it("should resolve if promise completes before timeout", async () => {
    const quickPromise = Promise.resolve("result")
    
    const result = await withTimeout(quickPromise, 1000)
    
    expect(result).toBe("result")
  })

  it("should reject if promise takes too long", async () => {
    const slowPromise = new Promise<string>(resolve => {
      setTimeout(() => resolve("too late"), 200)
    })
    
    await expect(withTimeout(slowPromise, 50)).rejects.toThrow("Operation timed out after 50ms")
  })

  it("should reject with original error if promise rejects", async () => {
    const failingPromise = Promise.reject(new Error("original error"))
    
    await expect(withTimeout(failingPromise, 1000)).rejects.toThrow("original error")
  })

  it("should clear timeout when promise resolves", async () => {
    const quickPromise = Promise.resolve(42)
    
    // This should complete without hanging
    const result = await withTimeout(quickPromise, 100)
    
    expect(result).toBe(42)
  })

  it("should work with async functions", async () => {
    const asyncFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return "async result"
    }
    
    const result = await withTimeout(asyncFn(), 1000)
    
    expect(result).toBe("async result")
  })

  it("should handle zero timeout", async () => {
    const immediatePromise = Promise.resolve("immediate")
    
    // Even with 0 timeout, immediate promise should resolve
    const result = await withTimeout(immediatePromise, 0)
    
    expect(result).toBe("immediate")
  })

  it("should timeout on slow async operations", async () => {
    const slowOperation = new Promise<string>(resolve => {
      setTimeout(() => resolve("done"), 500)
    })
    
    await expect(withTimeout(slowOperation, 10)).rejects.toThrow("Operation timed out after 10ms")
  })
})