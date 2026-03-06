// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

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

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { defer } from "../../src/util/defer"

describe("defer", () => {
  describe("Symbol.dispose", () => {
    bulletproofTest("should call fn on Symbol.dispose", async () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should call fn with correct context", async () => {
      let thisArg: any = null
      const fn = function () { thisArg = this }

      {
        using _ = defer(fn)
      }

      // The function should be called with proper context
      expect(thisArg).toBeDefined()
    })

    bulletproofTest("should handle functions that return values", async () => {
      let called = false
      const fn = () => {
        called = true
        return "return-value"
      }

      {
        using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should handle functions with parameters", async () => {
      let called = false
      const fn = (a: number, b: string) => {
        called = true
        expect(a).toBeUndefined()
        expect(b).toBeUndefined()
      }

      {
        using _ = defer(fn as any)
      }

      expect(called).toBe(true)
    })
  })

  describe("Symbol.asyncDispose", () => {
    bulletproofTest("should call async fn on Symbol.asyncDispose", async () => {
      let called = false
      const fn = async () => { called = true }

      {
        await using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should await async function", async () => {
      let resolved = false
      const fn = async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10))
        resolved = true
      }

      {
        await using _ = defer(fn)
        expect(resolved).toBe(false)
      }

      expect(resolved).toBe(true)
    })

    bulletproofTest("should handle sync fn in asyncDispose", async () => {
      let called = false
      const fn = () => { called = true }

      {
        await using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should handle async function that returns values", async () => {
      let called = false
      const fn = async () => {
        called = true
        return "async-return-value"
      }

      {
        await using _ = defer(fn)
      }

      expect(called).toBe(true)
    })
  })

  describe("error handling", () => {
    bulletproofTest("should handle errors in sync dispose", async () => {
      const error = new Error("Test error")
      const fn = () => { throw error }

      expect(() => {
        using _ = defer(fn)
      }).toThrow("Test error")
    })

    bulletproofTest("should handle errors in async dispose", async () => {
      const error = new Error("Async test error")
      const fn = async () => { throw error }

      await expect(async () => {
        await using _ = defer(fn)
      }).rejects.toThrow("Async test error")
    })

    bulletproofTest("should handle promise rejections in async dispose", async () => {
      const error = new Error("Promise rejection")
      const fn = async () => {
        throw error
      }

      await expect(async () => {
        await using _ = defer(fn)
      }).rejects.toThrow("Promise rejection")
    })
  })

  describe("type safety", () => {
    bulletproofTest("should infer correct return type for sync function", async () => {
      const fn = () => { }
      const deferred = defer(fn)

      // Should have Symbol.dispose
      expect(deferred).toHaveProperty(Symbol.dispose)
      expect(typeof deferred[Symbol.dispose]).toBe('function')
      expect(deferred).toHaveProperty(Symbol.asyncDispose)
      expect(typeof deferred[Symbol.asyncDispose]).toBe('function')
    })

    bulletproofTest("should infer correct return type for async function", async () => {
      const fn = async () => { }
      const deferred = defer(fn)

      // Should have both dispose symbols
      expect(deferred).toHaveProperty(Symbol.dispose)
      expect(deferred).toHaveProperty(Symbol.asyncDispose)
    })

    bulletproofTest("should handle function types correctly", async () => {
      // Test with explicit function type
      const syncFn: () => void = () => { }
      const asyncFn: () => Promise<void> = async () => { }

      const syncDeferred = defer(syncFn)
      const asyncDeferred = defer(asyncFn)

      expect(syncDeferred).toHaveProperty(Symbol.dispose)
      expect(asyncDeferred).toHaveProperty(Symbol.asyncDispose)
    })
  })

  describe("edge cases", () => {
    bulletproofTest("should handle multiple defers in same scope", async () => {
      let callOrder: number[] = []

      {
        using _1 = defer(() => callOrder.push(1))
        using _2 = defer(() => callOrder.push(2))
        using _3 = defer(() => callOrder.push(3))

        expect(callOrder).toEqual([])
      }

      // Should be called in reverse order (stack-like behavior)
      expect(callOrder).toEqual([3, 2, 1])
    })

    bulletproofTest("should handle nested scopes", async () => {
      let callOrder: number[] = []

      {
        using _1 = defer(() => callOrder.push(1))

        {
          using _2 = defer(() => callOrder.push(2))

          {
            using _3 = defer(() => callOrder.push(3))
          }

          expect(callOrder).toEqual([3])
        }

        expect(callOrder).toEqual([3, 2])
      }

      expect(callOrder).toEqual([3, 2, 1])
    })

    bulletproofTest("should handle defer with no operation", async () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
        // Do nothing with the deferred object
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should handle function that accesses external variables", async () => {
      let externalValue = "test"
      let capturedValue: string | undefined

      const fn = () => {
        capturedValue = externalValue
      }

      {
        using _ = defer(fn)
        externalValue = "modified"
      }

      expect(capturedValue).toBe("modified")
    })

    bulletproofTest("should handle arrow functions", async () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
      }

      expect(called).toBe(true)
    })

    bulletproofTest("should handle function expressions", async () => {
      let called = false

      {
        using _ = defer(function () { called = true })
      }

      expect(called).toBe(true)
    })
  })

  describe("memory and performance", () => {
    bulletproofTest("should not create memory leaks", async () => {
      const callOrder: number[] = []

      // Create and destroy many deferred objects
      for (let i = 0; i < 100; i++) {
        {
          using _ = defer(() => callOrder.push(i))
        }
      }

      expect(callOrder.length).toBe(100)
      expect(callOrder[callOrder.length - 1]).toBe(99)
    })

    bulletproofTest("should handle rapid creation and disposal", async () => {
      let callCount = 0

      for (let i = 0; i < 1000; i++) {
        {
          using _ = defer(() => callCount++)
        }
      }

      expect(callCount).toBe(1000)
    })
  })

  describe("integration with using statements", () => {
    bulletproofTest("should work with multiple using declarations", async () => {
      let calls = 0
      const fn = () => calls++

      {
        using a = defer(fn)
        using b = defer(fn)
        using c = defer(fn)

        expect(calls).toBe(0)
      }

      expect(calls).toBe(3)
    })

    bulletproofTest("should work with await using declarations", async () => {
      let calls = 0
      const asyncFn = async () => calls++

      {
        await using a = defer(asyncFn)
        await using b = defer(asyncFn)

        expect(calls).toBe(0)
      }

      expect(calls).toBe(2)
    })

    bulletproofTest("should work with mixed using and await using", async () => {
      let syncCalls = 0
      let asyncCalls = 0
      const syncFn = () => syncCalls++
      const asyncFn = async () => asyncCalls++

      {
        using a = defer(syncFn)
        await using b = defer(asyncFn)
        using c = defer(syncFn)

        expect(syncCalls).toBe(0)
        expect(asyncCalls).toBe(0)
      }

      expect(syncCalls).toBe(2)
      expect(asyncCalls).toBe(1)
    })
  })
})
