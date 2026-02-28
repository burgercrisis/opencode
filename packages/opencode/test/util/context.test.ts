import { expect, test, describe } from "bun:test"
import { Context } from "../../src/util/context"

describe("Context", () => {
  describe("create", () => {
    test("should create context with name", () => {
      const context = Context.create<string>("test-context")
      expect(context).toHaveProperty('use')
      expect(context).toHaveProperty('provide')
      expect(typeof context.use).toBe('function')
      expect(typeof context.provide).toBe('function')
    })

    test("should create context with different names", () => {
      const context1 = Context.create<string>("context1")
      const context2 = Context.create<number>("context2")
      const context3 = Context.create<object>("context3")

      expect(context1).toBeDefined()
      expect(context2).toBeDefined()
      expect(context3).toBeDefined()
    })
  })

  describe("provide and use", () => {
    test("should provide and use simple values", () => {
      const context = Context.create<string>("test")

      context.provide("hello", () => {
        expect(context.use()).toBe("hello")
      })
    })

    test("should provide and use complex objects", () => {
      const context = Context.create<{ user: string; id: number }>("test")
      const value = { user: "john", id: 123 }

      context.provide(value, () => {
        expect(context.use()).toEqual(value)
        expect(context.use().user).toBe("john")
        expect(context.use().id).toBe(123)
      })
    })

    test("should provide and use arrays", () => {
      const context = Context.create<string[]>("test")
      const value = ["item1", "item2", "item3"]

      context.provide(value, () => {
        expect(context.use()).toEqual(value)
        expect(context.use().length).toBe(3)
      })
    })

    test("should provide and use null and undefined", () => {
      const nullContext = Context.create<string | null>("null-test")
      const undefinedContext = Context.create<string | undefined>("undefined-test")

      nullContext.provide(null, () => {
        expect(nullContext.use()).toBe(null)
      })

      undefinedContext.provide(undefined, () => {
        expect(undefinedContext.use()).toBe(undefined)
      })
    })

    test("should return value from provide function", () => {
      const context = Context.create<string>("test")

      const result = context.provide("hello", () => {
        return "returned-value"
      })

      expect(result).toBe("returned-value")
    })

    test("should handle synchronous functions", () => {
      const context = Context.create<string>("test")

      context.provide("sync-value", () => {
        const result = context.use()
        expect(result).toBe("sync-value")
        return "sync-result"
      })
    })
  })

  describe("error handling", () => {
    test("should throw NotFound when used outside provide", () => {
      const context = Context.create<string>("test")

      expect(() => context.use()).toThrow(Context.NotFound)
      expect(() => context.use()).toThrow(/No context found for test/)
    })

    test("should throw NotFound with correct name", () => {
      const context1 = Context.create<string>("context1")
      const context2 = Context.create<number>("context2")

      expect(() => context1.use()).toThrow(/No context found for context1/)
      expect(() => context2.use()).toThrow(/No context found for context2/)
    })

    test("should create NotFound error with correct properties", () => {
      const error = new Context.NotFound("test-context")

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(Context.NotFound)
      expect(error.name).toBe("test-context")
      expect(error.message).toBe("No context found for test-context")
    })

    test("should handle errors within provide function", () => {
      const context = Context.create<string>("test")

      expect(() => {
        context.provide("value", () => {
          throw new Error("Inner error")
        })
      }).toThrow("Inner error")
    })
  })

  describe("nested contexts", () => {
    test("should handle nested providers", () => {
      const context = Context.create<string>("test")

      context.provide("outer", () => {
        expect(context.use()).toBe("outer")

        context.provide("inner", () => {
          expect(context.use()).toBe("inner")
        })

        expect(context.use()).toBe("outer")
      })
    })

    test("should handle deeply nested providers", () => {
      const context = Context.create<string>("test")

      context.provide("level1", () => {
        expect(context.use()).toBe("level1")

        context.provide("level2", () => {
          expect(context.use()).toBe("level2")

          context.provide("level3", () => {
            expect(context.use()).toBe("level3")
          })

          expect(context.use()).toBe("level2")
        })

        expect(context.use()).toBe("level1")
      })
    })

    test("should handle parallel nested contexts", () => {
      const context1 = Context.create<string>("context1")
      const context2 = Context.create<number>("context2")

      context1.provide("value1", () => {
        context2.provide(42, () => {
          expect(context1.use()).toBe("value1")
          expect(context2.use()).toBe(42)
        })
      })
    })

    test("should handle different types in nested contexts", () => {
      const stringContext = Context.create<string>("string")
      const numberContext = Context.create<number>("number")
      const objectContext = Context.create<{ data: string }>("object")

      stringContext.provide("hello", () => {
        numberContext.provide(123, () => {
          objectContext.provide({ data: "test" }, () => {
            expect(stringContext.use()).toBe("hello")
            expect(numberContext.use()).toBe(123)
            expect(objectContext.use()).toEqual({ data: "test" })
          })
        })
      })
    })
  })

  describe("async support", () => {
    test("should work with async functions", async () => {
      const context = Context.create<string>("test")

      const result = await context.provide("async-value", async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return context.use()
      })

      expect(result).toBe("async-value")
    })

    test("should handle async nested contexts", async () => {
      const context = Context.create<string>("test")

      await context.provide("outer", async () => {
        expect(context.use()).toBe("outer")

        await context.provide("inner", async () => {
          expect(context.use()).toBe("inner")
          return "inner-result"
        })

        return "outer-result"
      })
    })

    test("should preserve context across async boundaries", async () => {
      const context = Context.create<string>("test")

      const result = await context.provide("async-test", async () => {
        const promise = new Promise<string>(resolve => {
          setTimeout(() => {
            resolve(context.use())
          }, 10)
        })

        return await promise
      })

      expect(result).toBe("async-test")
    })
  })

  describe("edge cases", () => {
    test("should handle empty string context name", () => {
      const context = Context.create<string>("")

      context.provide("value", () => {
        expect(context.use()).toBe("value")
      })
    })

    test("should handle special characters in context name", () => {
      const context = Context.create<string>("test-context-with-special-chars-!@#$%")

      context.provide("special", () => {
        expect(context.use()).toBe("special")
      })

      expect(() => context.use()).toThrow(/No context found for test-context-with-special-chars-!@#\$%/)
    })

    test("should handle very long context names", () => {
      const longName = "a".repeat(1000)
      const context = Context.create<string>(longName)

      context.provide("long-name-value", () => {
        expect(context.use()).toBe("long-name-value")
      })

      expect(() => context.use()).toThrow(new RegExp(`No context found for ${longName}`))
    })

    test("should handle zero-length provide function", () => {
      const context = Context.create<string>("test")

      context.provide("value", () => {
        // Empty function body
      })

      expect(context.use()).toBe("value")
    })

    test("should handle multiple provide calls", () => {
      const context = Context.create<string>("test")

      context.provide("first", () => {
        expect(context.use()).toBe("first")
      })

      context.provide("second", () => {
        expect(context.use()).toBe("second")
      })
    })
  })

  describe("type safety", () => {
    test("should maintain type information", () => {
      const stringContext = Context.create<string>("string")
      const numberContext = Context.create<number>("number")
      const booleanContext = Context.create<boolean>("boolean")

      stringContext.provide("string value", () => {
        const value: string = stringContext.use()
        expect(value).toBe("string value")
      })

      numberContext.provide(42, () => {
        const value: number = numberContext.use()
        expect(value).toBe(42)
      })

      booleanContext.provide(true, () => {
        const value: boolean = booleanContext.use()
        expect(value).toBe(true)
      })
    })

    test("should handle union types", () => {
      const context = Context.create<string | number>("union")

      context.provide("string value", () => {
        const value: string | number = context.use()
        expect(typeof value).toBe("string")
        expect(value).toBe("string value")
      })

      context.provide(123, () => {
        const value: string | number = context.use()
        expect(typeof value).toBe("number")
        expect(value).toBe(123)
      })
    })
  })

  describe("performance and memory", () => {
    test("should handle many nested contexts", () => {
      const context = Context.create<number>("test")

      function createNested(depth: number): void {
        if (depth <= 0) return

        context.provide(depth, () => {
          expect(context.use()).toBe(depth)
          createNested(depth - 1)
        })
      }

      createNested(100) // Create 100 levels of nesting
    })

    test("should not leak memory across provide calls", () => {
      const context = Context.create<string>("test")

      // Multiple provide calls should not interfere
      for (let i = 0; i < 100; i++) {
        context.provide(`value-${i}`, () => {
          expect(context.use()).toBe(`value-${i}`)
        })
      }
    })
  })
})
