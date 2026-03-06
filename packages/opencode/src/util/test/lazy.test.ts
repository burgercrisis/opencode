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
import { lazy } from "../lazy"

describe("lazy", () => {
  it("should lazily evaluate the function", () => {
    let called = false
    const getValue = lazy(() => {
      called = true
      return 42
    })
    
    expect(called).toBe(false)
    
    const value = getValue()
    
    expect(called).toBe(true)
    expect(value).toBe(42)
  })
  
  it("should cache the result", () => {
    let callCount = 0
    const getValue = lazy(() => {
      callCount++
      return { value: Math.random() }
    })
    
    const result1 = getValue()
    const result2 = getValue()
    
    expect(callCount).toBe(1)
    expect(result1).toBe(result2)
  })
  
  it("should allow resetting the cached value", () => {
    let callCount = 0
    const getValue = lazy(() => {
      callCount++
      return callCount
    })
    
    expect(getValue()).toBe(1)
    expect(getValue()).toBe(1)
    
    getValue.reset()
    
    expect(getValue()).toBe(2)
    expect(getValue()).toBe(2)
  })
  
  it("should not cache failed initialization", () => {
    let callCount = 0
    const getValue = lazy(() => {
      callCount++
      throw new Error("failed")
    })
    
    expect(() => getValue()).toThrow("failed")
    expect(callCount).toBe(1)
    
    // Should try again after failure
    expect(() => getValue()).toThrow("failed")
    expect(callCount).toBe(2)
  })
  
  it("should work with complex objects", () => {
    const getObj = lazy(() => ({
      nested: {
        value: "test"
      },
      array: [1, 2, 3]
    }))
    
    const obj = getObj()
    expect(obj.nested.value).toBe("test")
    expect(obj.array).toEqual([1, 2, 3])
  })
  
  it("should work with async functions", async () => {
    const getAsync = lazy(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return "async result"
    })
    
    const result = await getAsync()
    expect(result).toBe("async result")
  })
  
  it("should handle undefined return values", () => {
    const getUndefined = lazy(() => undefined)
    
    expect(getUndefined()).toBeUndefined()
    // Should still cache undefined
    expect(getUndefined()).toBeUndefined()
  })
  
  it("should handle null return values", () => {
    const getNull = lazy(() => null)
    
    expect(getNull()).toBeNull()
  })
})