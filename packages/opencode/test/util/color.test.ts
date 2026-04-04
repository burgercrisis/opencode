import { expect, test, describe } from "bun:test"
import { Color } from "../../src/util/color"

describe("Color", () => {
  describe("isValidHex", () => {
    test("should validate valid hex colors", () => {
      expect(Color.isValidHex("#ffffff")).toBe(true)
      expect(Color.isValidHex("#FFFFFF")).toBe(true)
      expect(Color.isValidHex("#000000")).toBe(true)
      expect(Color.isValidHex("#123456")).toBe(true)
      expect(Color.isValidHex("#ABCDEF")).toBe(true)
      expect(Color.isValidHex("#abcdef")).toBe(true)
      expect(Color.isValidHex("#a1b2c3")).toBe(true)
      expect(Color.isValidHex("#A1B2C3")).toBe(true)
    })

    test("should reject invalid hex colors", () => {
      expect(Color.isValidHex("ffffff")).toBe(false) // Missing #
      expect(Color.isValidHex("#fff")).toBe(false) // Too short
      expect(Color.isValidHex("#ffff")).toBe(false) // Wrong length
      expect(Color.isValidHex("#fffffff")).toBe(false) // Too long
      expect(Color.isValidHex("#gggggg")).toBe(false) // Invalid characters
      expect(Color.isValidHex("#12345z")).toBe(false) // Invalid character
      expect(Color.isValidHex("##123456")).toBe(false) // Double #
      expect(Color.isValidHex("# 123456")).toBe(false) // Space after #
      expect(Color.isValidHex("#123456 ")).toBe(false) // Space at end
      expect(Color.isValidHex(null)).toBe(false) // null
      expect(Color.isValidHex(undefined)).toBe(false) // undefined
      expect(Color.isValidHex("")).toBe(false) // Empty string
      expect(Color.isValidHex(" ")).toBe(false) // Space only
      expect(Color.isValidHex("#")).toBe(false) // Just #
      expect(Color.isValidHex("#12")).toBe(false) // Too short
      expect(Color.isValidHex("#12345")).toBe(false) // Wrong length
    })

    test("should handle edge cases", () => {
      expect(Color.isValidHex("#000000")).toBe(true) // Pure black
      expect(Color.isValidHex("#FFFFFF")).toBe(true) // Pure white
      expect(Color.isValidHex("#FF0000")).toBe(true) // Pure red
      expect(Color.isValidHex("#00FF00")).toBe(true) // Pure green
      expect(Color.isValidHex("#0000FF")).toBe(true) // Pure blue
      expect(Color.isValidHex("#808080")).toBe(true) // Gray
    })

    test("should be type guard", () => {
      const validHex = "#ff0000"
      const invalidHex = "invalid"

      if (Color.isValidHex(validHex)) {
        // TypeScript should know validHex is string here
        expect(validHex.length).toBe(7)
      }

      if (Color.isValidHex(invalidHex)) {
        // This should not execute
        expect(true).toBe(false)
      }
    })
  })

  describe("hexToRgb", () => {
    test("should convert basic colors", () => {
      expect(Color.hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 })
      expect(Color.hexToRgb("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 })
      expect(Color.hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 })
      expect(Color.hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 })
      expect(Color.hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 })
      expect(Color.hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 })
    })

    test("should convert mixed case colors", () => {
      expect(Color.hexToRgb("#AbCdEf")).toEqual({ r: 171, g: 205, b: 239 })
      expect(Color.hexToRgb("#aBcDeF")).toEqual({ r: 171, g: 205, b: 239 })
      expect(Color.hexToRgb("#1a2b3c")).toEqual({ r: 26, g: 43, b: 60 })
      expect(Color.hexToRgb("#1A2B3C")).toEqual({ r: 26, g: 43, b: 60 })
    })

    test("should convert numeric edge cases", () => {
      expect(Color.hexToRgb("#010101")).toEqual({ r: 1, g: 1, b: 1 })
      expect(Color.hexToRgb("#fefefe")).toEqual({ r: 254, g: 254, b: 254 })
      expect(Color.hexToRgb("#808080")).toEqual({ r: 128, g: 128, b: 128 })
      expect(Color.hexToRgb("#7f7f7f")).toEqual({ r: 127, g: 127, b: 127 })
    })

    test("should handle all possible values", () => {
      // Test some random valid combinations
      expect(Color.hexToRgb("#123456")).toEqual({ r: 18, g: 52, b: 86 })
      expect(Color.hexToRgb("#789abc")).toEqual({ r: 120, g: 154, b: 188 })
      expect(Color.hexToRgb("#def012")).toEqual({ r: 222, g: 240, b: 18 })
    })

    test("should return consistent object types", () => {
      const result = Color.hexToRgb("#123456")
      expect(result).toHaveProperty('r')
      expect(result).toHaveProperty('g')
      expect(result).toHaveProperty('b')
      expect(typeof result.r).toBe('number')
      expect(typeof result.g).toBe('number')
      expect(typeof result.b).toBe('number')
    })

    test("should handle invalid input gracefully", () => {
      // Note: hexToRgb doesn't validate input, it just parses
      // This tests the parsing behavior with various inputs
      expect(() => Color.hexToRgb("#gggggg")).not.toThrow()
      expect(() => Color.hexToRgb("")).not.toThrow()
      expect(() => Color.hexToRgb("#123")).not.toThrow()
    })
  })

  describe("hexToAnsiBold", () => {
    test("should convert valid hex to ANSI bold", () => {
      expect(Color.hexToAnsiBold("#ffffff")).toBe("\x1b[38;2;255;255;255m\x1b[1m")
      expect(Color.hexToAnsiBold("#000000")).toBe("\x1b[38;2;0;0;0m\x1b[1m")
      expect(Color.hexToAnsiBold("#ff0000")).toBe("\x1b[38;2;255;0;0m\x1b[1m")
      expect(Color.hexToAnsiBold("#00ff00")).toBe("\x1b[38;2;0;255;0m\x1b[1m")
      expect(Color.hexToAnsiBold("#0000ff")).toBe("\x1b[38;2;0;0;255m\x1b[1m")
    })

    test("should handle mixed case input", () => {
      expect(Color.hexToAnsiBold("#FF0000")).toBe("\x1b[38;2;255;0;0m\x1b[1m")
      expect(Color.hexToAnsiBold("#AbCdEf")).toBe("\x1b[38;2;171;205;239m\x1b[1m")
      expect(Color.hexToAnsiBold("#aBcDeF")).toBe("\x1b[38;2;171;205;239m\x1b[1m")
    })

    test("should return undefined for invalid hex", () => {
      expect(Color.hexToAnsiBold("ffffff")).toBeUndefined() // Missing #
      expect(Color.hexToAnsiBold("#fff")).toBeUndefined() // Too short
      expect(Color.hexToAnsiBold("#gggggg")).toBeUndefined() // Invalid chars
      expect(Color.hexToAnsiBold("")).toBeUndefined() // Empty
      expect(Color.hexToAnsiBold(undefined)).toBeUndefined() // Undefined
      expect(Color.hexToAnsiBold(null as any)).toBeUndefined() // null
    })

    test("should handle edge case colors", () => {
      expect(Color.hexToAnsiBold("#000000")).toBe("\x1b[38;2;0;0;0m\x1b[1m")
      expect(Color.hexToAnsiBold("#FFFFFF")).toBe("\x1b[38;2;255;255;255m\x1b[1m")
      expect(Color.hexToAnsiBold("#808080")).toBe("\x1b[38;2;128;128;128m\x1b[1m")
    })

    test("should produce valid ANSI escape sequences", () => {
      const ansi = Color.hexToAnsiBold("#123456")
      expect(ansi).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m\x1b\[1m$/)

      // Check that it contains the expected RGB values
      expect(ansi).toContain("38;2;18;52;86")
      expect(ansi).toContain("\x1b[1m")
    })

    test("should be consistent with hexToRgb", () => {
      const hex = "#a1b2c3"
      const rgb = Color.hexToRgb(hex)
      const ansi = Color.hexToAnsiBold(hex)

      expect(ansi).toContain(`38;2;${rgb.r};${rgb.g};${rgb.b}m`)
    })
  })

  describe("integration tests", () => {
    test("should work together for valid color workflow", () => {
      const hex = "#ff6b35"

      // Validate
      expect(Color.isValidHex(hex)).toBe(true)

      // Convert to RGB
      const rgb = Color.hexToRgb(hex)
      expect(rgb).toEqual({ r: 255, g: 107, b: 53 })

      // Convert to ANSI
      const ansi = Color.hexToAnsiBold(hex)
      expect(ansi).toBe("\x1b[38;2;255;107;53m\x1b[1m")
    })

    test("should handle invalid color workflow", () => {
      const invalidHex = "invalid"

      // Validate fails
      expect(Color.isValidHex(invalidHex)).toBe(false)

      // RGB conversion still works (doesn't validate)
      expect(() => Color.hexToRgb(invalidHex)).not.toThrow()

      // ANSI conversion returns undefined
      expect(Color.hexToAnsiBold(invalidHex)).toBeUndefined()
    })
  })
})
