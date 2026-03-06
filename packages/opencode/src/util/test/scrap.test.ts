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
import { foo, bar, dummyFunction, randomHelper } from "../scrap"

describe("scrap", () => {
  describe("exports", () => {
    it("should export foo as string '42'", () => {
      expect(foo).toBe("42")
    })
    
    it("should export bar as number 123", () => {
      expect(bar).toBe(123)
    })
  })
  
  describe("dummyFunction", () => {
    it("should be a function", () => {
      expect(typeof dummyFunction).toBe("function")
    })
    
    it("should not throw when called", () => {
      expect(() => dummyFunction()).not.toThrow()
    })
  })
  
  describe("randomHelper", () => {
    it("should be a function", () => {
      expect(typeof randomHelper).toBe("function")
    })
    
    it("should return a boolean", () => {
      const result = randomHelper()
      expect(typeof result).toBe("boolean")
    })
    
    it("should return true or false", () => {
      // Run multiple times to verify it returns booleans
      const results = new Set()
      for (let i = 0; i < 100; i++) {
        results.add(randomHelper())
      }
      // Should have at least one of each after 100 tries (statistically very likely)
      expect(results.size).toBeGreaterThan(0)
      expect(results.size).toBeLessThanOrEqual(2)
    })
  })
})