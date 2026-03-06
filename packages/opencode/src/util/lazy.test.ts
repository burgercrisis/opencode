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
import { lazy } from "./lazy"

describe("lazy", () => {
  it("should return the value from the function", () => {
    const fn = lazy(() => 42)
    expect(fn()).toBe(42)
  })

  it("should only call the function once", () => {
    let callCount = 0
    const fn = lazy(() => {
      callCount++
      return "result"
    })
    
    expect(callCount).toBe(0)
    expect(fn()).toBe("result")
    expect(callCount).toBe(1)
    expect(fn()).toBe("result")
    expect(callCount).toBe(1)
  })

  it("should cache the result", () => {
    const fn = lazy(() => Math.random())
    const first = fn()
    const second = fn()
    expect(first).toBe(second)
  })

  it("should work with objects", () => {
    const fn = lazy(() => ({ key: "value" }))
    expect(fn()).toEqual({ key: "value" })
  })

  it("should work with async-like patterns", () => {
    const fn = lazy(() => Promise.resolve("async result"))
    expect(fn()).toBeInstanceOf(Promise)
  })

  it("should throw if the function throws", () => {
    const fn = lazy(() => {
      throw new Error("test error")
    })
    expect(() => fn()).toThrow("test error")
  })

  it("should not cache thrown errors", () => {
    let shouldThrow = true
    const fn = lazy(() => {
      if (shouldThrow) throw new Error("first error")
      return "success"
    })
    
    expect(() => fn()).toThrow("first error")
    
    shouldThrow = false
    expect(fn()).toBe("success")
  })

  it("should allow resetting the cached value", () => {
    let counter = 0
    const fn = lazy(() => ++counter)
    
    expect(fn()).toBe(1)
    expect(fn()).toBe(1)
    
    fn.reset()
    
    expect(fn()).toBe(2)
    expect(fn()).toBe(2)
  })

  it("should allow reset to be called multiple times", () => {
    let counter = 0
    const fn = lazy(() => ++counter)
    
    fn.reset()
    fn.reset()
    
    expect(fn()).toBe(1)
  })

  it("should work with undefined return value", () => {
    const fn = lazy(() => undefined)
    expect(fn()).toBeUndefined()
    expect(fn()).toBeUndefined()
  })

  it("should work with null return value", () => {
    const fn = lazy(() => null)
    expect(fn()).toBeNull()
    expect(fn()).toBeNull()
  })

  it("should work with complex objects and maintain reference", () => {
    const fn = lazy(() => ({ nested: { value: 123 } }))
    const result = fn()
    expect(result.nested.value).toBe(123)
    // Same reference on subsequent calls
    expect(fn()).toBe(result)
  })
})
import { lazy } from "./lazy"

describe("lazy", () => {
  it("should return the value from the function", () => {
    const fn = lazy(() => 42)
    expect(fn()).toBe(42)
  })

  it("should only call the function once", () => {
    let callCount = 0
    const fn = lazy(() => {
      callCount++
      return "result"
    })
    
    expect(callCount).toBe(0)
    expect(fn()).toBe("result")
    expect(callCount).toBe(1)
    expect(fn()).toBe("result")
    expect(callCount).toBe(1)
  })

  it("should cache the result", () => {
    const fn = lazy(() => Math.random())
    const first = fn()
    const second = fn()
    expect(first).toBe(second)
  })

  it("should work with objects", () => {
    const fn = lazy(() => ({ key: "value" }))
    expect(fn()).toEqual({ key: "value" })
  })

  it("should work with async-like patterns", () => {
    const fn = lazy(() => Promise.resolve("async result"))
    expect(fn()).toBeInstanceOf(Promise)
  })

  it("should throw if the function throws", () => {
    const fn = lazy(() => {
      throw new Error("test error")
    })
    expect(() => fn()).toThrow("test error")
  })

  it("should not cache thrown errors", () => {
    let shouldThrow = true
    const fn = lazy(() => {
      if (shouldThrow) throw new Error("first error")
      return "success"
    })
    
    expect(() => fn()).toThrow("first error")
    
    shouldThrow = false
    expect(fn()).toBe("success")
  })

  it("should allow resetting the cached value", () => {
    let counter = 0
    const fn = lazy(() => ++counter)
    
    expect(fn()).toBe(1)
    expect(fn()).toBe(1)
    
    fn.reset()
    
    expect(fn()).toBe(2)
    expect(fn()).toBe(2)
  })

  it("should allow reset to be called multiple times", () => {
    let counter = 0
    const fn = lazy(() => ++counter)
    
    fn.reset()
    fn.reset()
    
    expect(fn()).toBe(1)
  })

  it("should work with undefined return value", () => {
    const fn = lazy(() => undefined)
    expect(fn()).toBeUndefined()
    expect(fn()).toBeUndefined()
  })

  it("should work with null return value", () => {
    const fn = lazy(() => null)
    expect(fn()).toBeNull()
    expect(fn()).toBeNull()
  })

  it("should work with complex objects and maintain reference", () => {
    const fn = lazy(() => ({ nested: { value: 123 } }))
    const result = fn()
    expect(result.nested.value).toBe(123)
    // Same reference on subsequent calls
    expect(fn()).toBe(result)
  })
})

