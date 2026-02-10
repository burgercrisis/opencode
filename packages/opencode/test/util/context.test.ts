import { expect, test, describe } from "bun:test"
import { Context } from "../../src/util/context"

describe("Context", () => {
  test("should provide and use value", () => {
    const context = Context.create<string>("test")
    context.provide("hello", () => {
      expect(context.use()).toBe("hello")
    })
  })

  test("should throw if context not found", () => {
    const context = Context.create<string>("test")
    expect(() => context.use()).toThrow(Context.NotFound)
    expect(() => context.use()).toThrow("No context found for test")
  })

  test("should handle nested contexts", () => {
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
