import { expect, test, describe } from "bun:test"
import { Token } from "../../src/util/token"

describe("Token", () => {
  test("estimate", () => {
    expect(Token.estimate("hello")).toBe(Math.round(5 / 4))
    expect(Token.estimate("")).toBe(0)
    expect(Token.estimate(null as any)).toBe(0)
    expect(Token.estimate("a".repeat(100))).toBe(25)
  })

  test("toCharCount", () => {
    expect(Token.toCharCount(10)).toBe(40)
    expect(Token.toCharCount(0)).toBe(0)
  })

  test("toTokenEstimate", () => {
    expect(Token.toTokenEstimate(40)).toBe(10)
    expect(Token.toTokenEstimate(5)).toBe(1)
  })

  describe("calculateToolResultTokens", () => {
    test("should calculate tokens for completed tool part", () => {
      const parts = [
        {
          type: "tool",
          state: {
            status: "completed",
            input: { foo: "bar" },
            output: "some output"
          }
        }
      ]
      const expected = Token.estimate(JSON.stringify({ foo: "bar" })) + Token.estimate("some output")
      expect(Token.calculateToolResultTokens(parts as any)).toBe(expected)
    })

    test("should handle compacted output", () => {
      const parts = [
        {
          type: "tool",
          state: {
            status: "completed",
            time: { compacted: true },
            output: "original output"
          }
        }
      ]
      expect(Token.calculateToolResultTokens(parts as any)).toBe(Token.estimate("[Old tool result content cleared]"))
    })

    test("should handle error state", () => {
      const parts = [
        {
          type: "tool",
          state: {
            status: "error",
            error: "some error message"
          }
        }
      ]
      expect(Token.calculateToolResultTokens(parts as any)).toBe(Token.estimate("some error message"))
    })

    test("should skip non-tool parts", () => {
      const parts = [{ type: "text", state: { content: "hello" } }]
      expect(Token.calculateToolResultTokens(parts as any)).toBe(0)
    })

    test("should handle missing state", () => {
      const parts = [{ type: "tool" }]
      expect(Token.calculateToolResultTokens(parts as any)).toBe(0)
    })
  })
})
