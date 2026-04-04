import { describe, it, expect } from "bun:test"
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