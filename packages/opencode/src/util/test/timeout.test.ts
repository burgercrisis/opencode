// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
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