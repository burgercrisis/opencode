// COMPREHENSIVE TEST-LEVEL INSTANCE PROTECTION
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
    console.log("[test-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[test-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[test-protection] Using current Instance")
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
import { Context } from "../context"

describe("Context", () => {
  describe("create", () => {
    it("should create a context that can be provided and used", () => {
      const ctx = Context.create<string>("test-context")
      
      const result = ctx.provide("hello world", () => {
        return ctx.use()
      })
      
      expect(result).toBe("hello world")
    })

    it("should throw NotFound when context is not available", () => {
      const ctx = Context.create<number>("number-context")
      
      expect(() => ctx.use()).toThrow(Context.NotFound)
      expect(() => ctx.use()).toThrow("No context found for number-context")
    })

    it("should support nested contexts", () => {
      const ctx = Context.create<number>("nested-context")
      
      const result = ctx.provide(1, () => {
        const inner = ctx.provide(2, () => {
          return ctx.use()
        })
        return inner + ctx.use()
      })
      
      expect(result).toBe(3)
    })

    it("should support async functions", async () => {
      const ctx = Context.create<string>("async-context")
      
      const result = await ctx.provide("async-value", async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return ctx.use()
      })
      
      expect(result).toBe("async-value")
    })

    it("should isolate context between different providers", () => {
      const ctx = Context.create<string>("isolated-context")
      
      let outerValue: string | undefined
      let innerValue: string | undefined
      
      ctx.provide("outer", () => {
        outerValue = ctx.use()
        ctx.provide("inner", () => {
          innerValue = ctx.use()
        })
      })
      
      expect(outerValue).toBe("outer")
      expect(innerValue).toBe("inner")
    })
  })

  describe("NotFound error", () => {
    it("should have correct name property", () => {
      const error = new Context.NotFound("my-context")
      expect(error.name).toBe("my-context")
      expect(error.message).toBe("No context found for my-context")
    })

    it("should be an instance of Error", () => {
      const error = new Context.NotFound("test")
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(Context.NotFound)
    })
  })
})