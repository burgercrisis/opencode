import { describe, it, expect } from "bun:test"
import { Token } from "../token"

describe("Token", () => {
  describe("estimate", () => {
    it("should estimate tokens based on character count", () => {
      // 4 characters per token
      expect(Token.estimate("")).toBe(0)
      expect(Token.estimate("a")).toBe(0) // 1 char rounds to 0
      expect(Token.estimate("aaaa")).toBe(1) // 4 chars = 1 token
      expect(Token.estimate("aaaaaaaa")).toBe(2) // 8 chars = 2 tokens
    })
    
    it("should handle null/undefined input", () => {
      expect(Token.estimate(null as any)).toBe(0)
      expect(Token.estimate(undefined as any)).toBe(0)
    })
    
    it("should handle long strings", () => {
      const longString = "a".repeat(1000)
      expect(Token.estimate(longString)).toBe(250) // 1000 / 4 = 250
    })
  })
  
  describe("toCharCount", () => {
    it("should convert tokens to character count", () => {
      expect(Token.toCharCount(0)).toBe(0)
      expect(Token.toCharCount(1)).toBe(4)
      expect(Token.toCharCount(10)).toBe(40)
    })
  })
  
  describe("toTokenEstimate", () => {
    it("should convert character count to token estimate", () => {
      expect(Token.toTokenEstimate(0)).toBe(0)
      expect(Token.toTokenEstimate(4)).toBe(1)
      expect(Token.toTokenEstimate(8)).toBe(2)
      expect(Token.toTokenEstimate(10)).toBe(3) // rounds up
    })
  })
  
  describe("calculateToolResultTokens", () => {
    it("should return 0 for empty array", () => {
      expect(Token.calculateToolResultTokens([])).toBe(0)
    })
    
    it("should return 0 for non-tool parts", () => {
      expect(Token.calculateToolResultTokens([
        { type: "text", state: {} }
      ])).toBe(0)
    })
    
    it("should return 0 for tool parts without state", () => {
      expect(Token.calculateToolResultTokens([
        { type: "tool" }
      ])).toBe(0)
    })
    
    it("should calculate tokens for tool input", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            input: { file: "test.ts", content: "hello world" } 
          } 
        }
      ])
      expect(result).toBeGreaterThan(0)
    })
    
    it("should calculate tokens for completed tool output", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            status: "completed",
            output: "file contents here"
          } 
        }
      ])
      expect(result).toBeGreaterThan(0)
    })
    
    it("should use compacted placeholder for compacted output", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            status: "completed",
            output: "file contents here",
            time: { compacted: true }
          } 
        }
      ])
      // Should use the placeholder text
      expect(result).toBeGreaterThan(0)
    })
    
    it("should calculate tokens for error status", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            status: "error",
            error: "Something went wrong"
          } 
        }
      ])
      expect(result).toBeGreaterThan(0)
    })
    
    it("should handle null output", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            status: "completed",
            output: null
          } 
        }
      ])
      // Should use empty string for null output
      expect(result).toBe(0)
    })
    
    it("should sum tokens from multiple tool parts", () => {
      const result = Token.calculateToolResultTokens([
        { 
          type: "tool", 
          state: { 
            input: { a: 1 },
            status: "completed",
            output: "output1"
          } 
        },
        { 
          type: "tool", 
          state: { 
            input: { b: 2 },
            status: "completed",
            output: "output2"
          } 
        }
      ])
      expect(result).toBeGreaterThan(0)
    })
  })
})