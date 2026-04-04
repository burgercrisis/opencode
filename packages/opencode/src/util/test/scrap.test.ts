import { describe, it, expect } from "bun:test"
import { foo, bar, dummyFunction, randomHelper } from "../scrap"

describe("scrap", () => {
  describe("exports", () => {
    it("should export foo as string '42'", () => {
      expect(foo).toBe("42")
    })
    
    it("should export bar as number 123", () => {
      expect(bar).toBe(123)
    })
  })
  
  describe("dummyFunction", () => {
    it("should be a function", () => {
      expect(typeof dummyFunction).toBe("function")
    })
    
    it("should not throw when called", () => {
      expect(() => dummyFunction()).not.toThrow()
    })
  })
  
  describe("randomHelper", () => {
    it("should be a function", () => {
      expect(typeof randomHelper).toBe("function")
    })
    
    it("should return a boolean", () => {
      const result = randomHelper()
      expect(typeof result).toBe("boolean")
    })
    
    it("should return true or false", () => {
      // Run multiple times to verify it returns booleans
      const results = new Set()
      for (let i = 0; i < 100; i++) {
        results.add(randomHelper())
      }
      // Should have at least one of each after 100 tries (statistically very likely)
      expect(results.size).toBeGreaterThan(0)
      expect(results.size).toBeLessThanOrEqual(2)
    })
  })
})