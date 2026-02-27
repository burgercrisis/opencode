import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { Context } from "./context"

describe("Context", () => {
  describe("NotFound", () => {
    test("creates NotFound error", () => {
      const error = new Context.NotFound()
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(Context.NotFound)
      expect(error.name).toBe("Error") // Error class uses "Error" as name
      expect(error.message).toBe("")
    })

    test("creates NotFound error with message", () => {
      const error = new Context.NotFound("Context not found")
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(Context.NotFound)
      expect(error.name).toBe("Error") // Error class uses "Error" as name
      expect(error.message).toBe("Context not found")
    })

    test("has stack trace", () => {
      const error = new Context.NotFound("test")
      expect(error.stack).toBeDefined()
      expect(typeof error.stack).toBe("string")
    })
  })

  describe("create", () => {
    let context: ReturnType<typeof Context.create<string>>

    beforeEach(() => {
      context = Context.create<string>()
    })

    test("creates context with use and provide methods", () => {
      expect(typeof context.use).toBe("function")
      expect(typeof context.provide).toBe("function")
    })

    test("use throws NotFound when no context is set", () => {
      expect(() => context.use()).toThrow(Context.NotFound)
      expect(() => context.use()).toThrow("Context not found")
    })

    test("provide returns the result of the callback", () => {
      const result = context.provide("test-value", () => {
        return "callback-result"
      })
      expect(result).toBe("callback-result")
    })

    test("provide makes context available via use", () => {
      context.provide("test-value", () => {
        expect(context.use()).toBe("test-value")
      })
    })

    test("provide isolates context to callback scope", () => {
      context.provide("outer-value", () => {
        expect(context.use()).toBe("outer-value")

        context.provide("inner-value", () => {
          expect(context.use()).toBe("inner-value")
        })

        expect(context.use()).toBe("outer-value")
      })

      expect(() => context.use()).toThrow(Context.NotFound)
    })

    test("nested provide calls work correctly", () => {
      const results: string[] = []

      context.provide("level-1", () => {
        results.push(context.use())

        context.provide("level-2", () => {
          results.push(context.use())

          context.provide("level-3", () => {
            results.push(context.use())
          })

          results.push(context.use())
        })

        results.push(context.use())
      })

      expect(results).toEqual(["level-1", "level-2", "level-3", "level-2", "level-1"])
    })

    test("provide handles async callbacks", async () => {
      const result = await context.provide("async-value", async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return context.use()
      })
      expect(result).toBe("async-value")
    })

    test("provide handles promises in callbacks", async () => {
      const result = await context.provide("promise-value", () => {
        return Promise.resolve(context.use())
      })
      expect(result).toBe("promise-value")
    })

    test("use returns the same value within the same context", () => {
      context.provide("consistent-value", () => {
        const first = context.use()
        const second = context.use()
        const third = context.use()
        expect(first).toBe("consistent-value")
        expect(second).toBe("consistent-value")
        expect(third).toBe("consistent-value")
        expect(first).toBe(second).toBe(third)
      })
    })

    test("context isolation between different instances", () => {
      const context1 = Context.create<string>()
      const context2 = Context.create<string>()

      context1.provide("value-1", () => {
        expect(context1.use()).toBe("value-1")
        expect(() => context2.use()).toThrow(Context.NotFound)
      })

      context2.provide("value-2", () => {
        expect(context2.use()).toBe("value-2")
        expect(() => context1.use()).toThrow(Context.NotFound)
      })
    })

    test("provide with complex data types", () => {
      const objectContext = Context.create<{ user: string; id: number }>()

      const data = { user: "test-user", id: 123 }
      objectContext.provide(data, () => {
        const result = objectContext.use()
        expect(result).toEqual(data)
        expect(result.user).toBe("test-user")
        expect(result.id).toBe(123)
      })
    })

    test("provide with null and undefined values", () => {
      const nullContext = Context.create<string | null>()
      const undefinedContext = Context.create<string | undefined>()

      nullContext.provide(null, () => {
        expect(nullContext.use()).toBeNull()
      })

      undefinedContext.provide(undefined, () => {
        expect(undefinedContext.use()).toBeUndefined()
      })
    })

    test("provide with number types", () => {
      const numberContext = Context.create<number>()

      numberContext.provide(42, () => {
        expect(numberContext.use()).toBe(42)
      })
    })

    test("provide with boolean types", () => {
      const booleanContext = Context.create<boolean>()

      booleanContext.provide(true, () => {
        expect(booleanContext.use()).toBe(true)
      })

      booleanContext.provide(false, () => {
        expect(booleanContext.use()).toBe(false)
      })
    })

    test("provide with array types", () => {
      const arrayContext = Context.create<string[]>()

      const array = ["item1", "item2", "item3"]
      arrayContext.provide(array, () => {
        const result = arrayContext.use()
        expect(result).toEqual(array)
        expect(result).toHaveLength(3)
        expect(result[0]).toBe("item1")
      })
    })

    test("error handling in callbacks", () => {
      expect(() => {
        context.provide("test-value", () => {
          throw new Error("Callback error")
        })
      }).toThrow("Callback error")

      // Context should still be unavailable after error
      expect(() => context.use()).toThrow(Context.NotFound)
    })

    test("provide returns callback return value even if it's falsy", () => {
      expect(context.provide("test", () => false)).toBe(false)
      expect(context.provide("test", () => null)).toBe(null)
      expect(context.provide("test", () => undefined)).toBeUndefined()
      expect(context.provide("test", () => 0)).toBe(0)
      expect(context.provide("test", () => "")).toBe("")
    })

    test("context works with try-catch blocks", () => {
      try {
        context.provide("try-catch-value", () => {
          expect(context.use()).toBe("try-catch-value")
          throw new Error("Test error")
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe("Test error")
      }

      // Context should be unavailable after try-catch
      expect(() => context.use()).toThrow(Context.NotFound)
    })

    test("multiple provide calls with same context instance", () => {
      const results: string[] = []

      context.provide("first", () => {
        results.push(context.use())
      })

      context.provide("second", () => {
        results.push(context.use())
      })

      context.provide("third", () => {
        results.push(context.use())
      })

      expect(results).toEqual(["first", "second", "third"])
    })

    test("context with function values", () => {
      const functionContext = Context.create<() => string>()

      const fn = () => "hello from function"
      functionContext.provide(fn, () => {
        const result = functionContext.use()
        expect(result).toBe(fn)
        expect(result()).toBe("hello from function")
      })
    })
  })

  describe("AsyncLocalStorage integration", () => {
    test("context works across async boundaries", async () => {
      const asyncContext = Context.create<string>()

      const result = await asyncContext.provide("async-test", async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10))
        return asyncContext.use()
      })

      expect(result).toBe("async-test")
    })

    test("context preserved in setTimeout", async () => {
      const timeoutContext = Context.create<string>()

      const result = await new Promise<string>((resolve) => {
        timeoutContext.provide("timeout-test", () => {
          setTimeout(() => {
            resolve(timeoutContext.use())
          }, 10)
        })
      })

      expect(result).toBe("timeout-test")
    })

    test("context preserved in Promise chains", async () => {
      const promiseContext = Context.create<string>()

      const result = await promiseContext
        .provide("promise-test", () => {
          return Promise.resolve()
            .then(() => promiseContext.use())
            .then(value => value.toUpperCase())
        })

      expect(result).toBe("PROMISE-TEST")
    })
  })

  describe("type safety", () => {
    test("maintains type safety for string contexts", () => {
      const stringContext = Context.create<string>()

      stringContext.provide("typed-string", () => {
        const value: string = stringContext.use()
        expect(value).toBe("typed-string")
      })
    })

    test("maintains type safety for object contexts", () => {
      interface TestObject {
        name: string
        count: number
      }

      const objectContext = Context.create<TestObject>()

      const testObj: TestObject = { name: "test", count: 42 }
      objectContext.provide(testObj, () => {
        const value: TestObject = objectContext.use()
        expect(value.name).toBe("test")
        expect(value.count).toBe(42)
      })
    })

    test("maintains type safety for union types", () => {
      const unionContext = Context.create<string | number>()

      unionContext.provide("string-value", () => {
        const value: string | number = unionContext.use()
        expect(typeof value).toBe("string")
        expect(value).toBe("string-value")
      })

      unionContext.provide(123, () => {
        const value: string | number = unionContext.use()
        expect(typeof value).toBe("number")
        expect(value).toBe(123)
      })
    })
  })
})
