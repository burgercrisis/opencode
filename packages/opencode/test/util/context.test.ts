import { expect, test, describe } from "bun:test"
import { Context } from "../../src/util/context"

describe("util.context", () => {
  test("Context should provide and use values", () => {
    const context = Context.create<string>("test")
    
    context.provide("hello", () => {
      expect(context.use()).toBe("hello")
    })
  })

  test("Context should throw if used outside provide", () => {
    const context = Context.create<string>("test")
    expect(() => context.use()).toThrow(Context.NotFound)
    expect(() => context.use()).toThrow(/No context found for test/)
  })

  test("Context should handle nested providers", () => {
    const context = Context.create<string>("test")
    
    context.provide("outer", () => {
      expect(context.use()).toBe("outer")
      context.provide("inner", () => {
        expect(context.use()).toBe("inner")
      })
      expect(context.use()).toBe("outer")
    })
  })
})
