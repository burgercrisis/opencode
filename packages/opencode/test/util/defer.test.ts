import { expect, test, describe } from "bun:test"
import { defer } from "../../src/util/defer"

describe("defer", () => {
  describe("Symbol.dispose", () => {
    test("should call fn on Symbol.dispose", () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    test("should call fn with correct context", () => {
      let thisArg: any = null
      const fn = function () { thisArg = this }

      {
        using _ = defer(fn)
      }

      // The function should be called with proper context
      expect(thisArg).toBeDefined()
    })

    test("should handle functions that return values", () => {
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

    test("should handle functions with parameters", () => {
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
    test("should call async fn on Symbol.asyncDispose", async () => {
      let called = false
      const fn = async () => { called = true }

      {
        await using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    test("should await async function", async () => {
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

    test("should handle sync fn in asyncDispose", async () => {
      let called = false
      const fn = () => { called = true }

      {
        await using _ = defer(fn)
        expect(called).toBe(false)
      }

      expect(called).toBe(true)
    })

    test("should handle async function that returns values", async () => {
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
    test("should handle errors in sync dispose", () => {
      const error = new Error("Test error")
      const fn = () => { throw error }

      expect(() => {
        using _ = defer(fn)
      }).toThrow("Test error")
    })

    test("should handle errors in async dispose", async () => {
      const error = new Error("Async test error")
      const fn = async () => { throw error }

      await expect(async () => {
        await using _ = defer(fn)
      }).rejects.toThrow("Async test error")
    })

    test("should handle promise rejections in async dispose", async () => {
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
    test("should infer correct return type for sync function", () => {
      const fn = () => { }
      const deferred = defer(fn)

      // Should have Symbol.dispose
      expect(deferred).toHaveProperty(Symbol.dispose)
      expect(typeof deferred[Symbol.dispose]).toBe('function')
      expect(deferred).toHaveProperty(Symbol.asyncDispose)
      expect(typeof deferred[Symbol.asyncDispose]).toBe('function')
    })

    test("should infer correct return type for async function", () => {
      const fn = async () => { }
      const deferred = defer(fn)

      // Should have both dispose symbols
      expect(deferred).toHaveProperty(Symbol.dispose)
      expect(deferred).toHaveProperty(Symbol.asyncDispose)
    })

    test("should handle function types correctly", () => {
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
    test("should handle multiple defers in same scope", () => {
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

    test("should handle nested scopes", () => {
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

    test("should handle defer with no operation", () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
        // Do nothing with the deferred object
      }

      expect(called).toBe(true)
    })

    test("should handle function that accesses external variables", () => {
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

    test("should handle arrow functions", () => {
      let called = false
      const fn = () => { called = true }

      {
        using _ = defer(fn)
      }

      expect(called).toBe(true)
    })

    test("should handle function expressions", () => {
      let called = false

      {
        using _ = defer(function () { called = true })
      }

      expect(called).toBe(true)
    })
  })

  describe("memory and performance", () => {
    test("should not create memory leaks", () => {
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

    test("should handle rapid creation and disposal", () => {
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
    test("should work with multiple using declarations", () => {
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

    test("should work with await using declarations", async () => {
      let calls = 0
      const asyncFn = async () => calls++

      {
        await using a = defer(asyncFn)
        await using b = defer(asyncFn)

        expect(calls).toBe(0)
      }

      expect(calls).toBe(2)
    })

    test("should work with mixed using and await using", async () => {
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
