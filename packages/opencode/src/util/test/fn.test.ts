import { describe, it, expect } from "bun:test"
import { z } from "zod"
import { fn } from "../fn"

describe("fn", () => {
  it("should create a function that validates input with schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number()
    })
    
    const greet = fn(schema, (input) => {
      return `Hello ${input.name}, you are ${input.age} years old`
    })
    
    expect(greet({ name: "Alice", age: 30 })).toBe("Hello Alice, you are 30 years old")
  })
  
  it("should throw on invalid input", () => {
    const schema = z.object({
      value: z.number()
    })
    
    const double = fn(schema, (input) => input.value * 2)
    
    expect(() => double({ value: "not a number" } as any)).toThrow()
  })
  
  it("should have force method that bypasses validation", () => {
    const schema = z.object({
      value: z.number()
    })
    
    const double = fn(schema, (input) => input.value * 2)
    
    // force bypasses validation
    expect(double.force({ value: 5 })).toBe(10)
  })
  
  it("should have schema property", () => {
    const schema = z.string()
    
    const upper = fn(schema, (input) => input.toUpperCase())
    
    expect(upper.schema).toBe(schema)
  })
  
  it("should work with primitive schemas", () => {
    const schema = z.string()
    
    const shout = fn(schema, (input) => input + "!")
    
    expect(shout("hello")).toBe("hello!")
  })
  
  it("should work with array schemas", () => {
    const schema = z.array(z.number())
    
    const sum = fn(schema, (input) => input.reduce((a, b) => a + b, 0))
    
    expect(sum([1, 2, 3])).toBe(6)
  })
  
  it("should work with async callbacks", async () => {
    const schema = z.object({
      url: z.string()
    })
    
    const fetchMock = fn(schema, async (input) => {
      return `fetched: ${input.url}`
    })
    
    expect(await fetchMock({ url: "https://example.com" })).toBe("fetched: https://example.com")
  })
  
  it("should preserve return type", () => {
    const schema = z.object({
      x: z.number(),
      y: z.number()
    })
    
    const getPoint = fn(schema, (input) => ({
      x: input.x,
      y: input.y,
      sum: input.x + input.y
    }))
    
    const result = getPoint({ x: 1, y: 2 })
    expect(result).toEqual({ x: 1, y: 2, sum: 3 })
  })
})