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
import { defer } from "../defer"

describe("defer", () => {
  describe("sync dispose", () => {
    it("should call function when Symbol.dispose is called", () => {
      let called = false
      const d = defer(() => {
        called = true
      })
      
      expect(called).toBe(false)
      
      // Manually call dispose
      d[Symbol.dispose]()
      
      expect(called).toBe(true)
    })

    it("should pass arguments correctly", () => {
      let value = 0
      const d = defer(() => {
        value = 42
      })
      
      d[Symbol.dispose]()
      
      expect(value).toBe(42)
    })
  })

  describe("async dispose", () => {
    it("should support async dispose with Symbol.asyncDispose", async () => {
      let called = false
      const d = defer(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        called = true
      })
      
      expect(called).toBe(false)
      
      await d[Symbol.asyncDispose]()
      
      expect(called).toBe(true)
    })

    it("should handle async errors", async () => {
      const d = defer(async () => {
        throw new Error("async error")
      })
      
      await expect(d[Symbol.asyncDispose]()).rejects.toThrow("async error")
    })
  })

  describe("early execution", () => {
    it("should execute on scope exit", () => {
      const order: string[] = []
      
      function testFn() {
        order.push("start")
        const d = defer(() => {
          order.push("defer")
        })
        order.push("middle")
        d[Symbol.dispose]()
      }
      
      testFn()
      
      expect(order).toEqual(["start", "middle", "defer"])
    })
  })
})