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
import { iife } from "../iife"

describe("iife", () => {
  it("should immediately invoke the function and return result", () => {
    const result = iife(() => 42)
    expect(result).toBe(42)
  })

  it("should work with complex return values", () => {
    const result = iife(() => {
      const a = 1
      const b = 2
      return a + b
    })
    expect(result).toBe(3)
  })

  it("should work with objects", () => {
    const result = iife(() => ({
      name: "test",
      value: 123
    }))
    expect(result).toEqual({ name: "test", value: 123 })
  })

  it("should work with async functions", async () => {
    const result = await iife(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return "async result"
    })
    expect(result).toBe("async result")
  })

  it("should capture local variables in closure", () => {
    let counter = 0
    const result = iife(() => {
      counter++
      return counter
    })
    expect(result).toBe(1)
    expect(counter).toBe(1)
  })

  it("should work with functions that return undefined", () => {
    const result = iife(() => {
      // no return
    })
    expect(result).toBeUndefined()
  })

  it("should work with functions that throw", () => {
    expect(() => iife(() => {
      throw new Error("test error")
    })).toThrow("test error")
  })
})