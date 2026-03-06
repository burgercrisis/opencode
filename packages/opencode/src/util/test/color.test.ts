// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Color } from "../color"

describe("Color", () => {
  describe("isValidHex", () => {
    it("should return true for valid 6-character hex colors", () => {
      expect(Color.isValidHex("#ffffff")).toBe(true)
      expect(Color.isValidHex("#000000")).toBe(true)
      expect(Color.isValidHex("#ff0000")).toBe(true)
      expect(Color.isValidHex("#00ff00")).toBe(true)
      expect(Color.isValidHex("#0000ff")).toBe(true)
      expect(Color.isValidHex("#aAbBcC")).toBe(true)
      expect(Color.isValidHex("#123456")).toBe(true)
    })

    it("should return false for invalid hex colors", () => {
      expect(Color.isValidHex("#fff")).toBe(false) // too short
      expect(Color.isValidHex("#fffffff")).toBe(false) // too long
      expect(Color.isValidHex("ffffff")).toBe(false) // missing #
      expect(Color.isValidHex("#gggggg")).toBe(false) // invalid chars
      expect(Color.isValidHex("")).toBe(false)
      expect(Color.isValidHex()).toBe(false)
      expect(Color.isValidHex(null as any)).toBe(false)
      expect(Color.isValidHex(undefined as any)).toBe(false)
    })
  })

  describe("hexToRgb", () => {
    it("should convert hex to RGB correctly", () => {
      expect(Color.hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 })
      expect(Color.hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 })
      expect(Color.hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 })
      expect(Color.hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 })
      expect(Color.hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 })
      expect(Color.hexToRgb("#a0b0c0")).toEqual({ r: 160, g: 176, b: 192 })
    })
  })

  describe("hexToAnsiBold", () => {
    it("should convert valid hex to ANSI bold escape sequence", () => {
      const result = Color.hexToAnsiBold("#ff0000")
      expect(result).toBe("\x1b[38;2;255;0;0m\x1b[1m")
    })

    it("should return undefined for invalid hex", () => {
      expect(Color.hexToAnsiBold("invalid")).toBeUndefined()
      expect(Color.hexToAnsiBold()).toBeUndefined()
      expect(Color.hexToAnsiBold("#fff")).toBeUndefined()
      expect(Color.hexToAnsiBold("")).toBeUndefined()
    })

    it("should produce correct ANSI sequence for various colors", () => {
      const white = Color.hexToAnsiBold("#ffffff")
      expect(white).toBe("\x1b[38;2;255;255;255m\x1b[1m")
      
      const black = Color.hexToAnsiBold("#000000")
      expect(black).toBe("\x1b[38;2;0;0;0m\x1b[1m")
    })
  })
})