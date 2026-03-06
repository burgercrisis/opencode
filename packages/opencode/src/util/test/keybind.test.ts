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
import { Keybind } from "../keybind"

describe("Keybind", () => {
  describe("match", () => {
    it("should return false for undefined first argument", () => {
      expect(Keybind.match(undefined, { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: false })).toBe(false)
    })
    
    it("should match identical keybinds", () => {
      const a = { name: "a", ctrl: true, meta: false, shift: false, super: false, leader: false }
      const b = { name: "a", ctrl: true, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.match(a, b)).toBe(true)
    })
    
    it("should not match different keybinds", () => {
      const a = { name: "a", ctrl: true, meta: false, shift: false, super: false, leader: false }
      const b = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.match(a, b)).toBe(false)
    })
    
    it("should normalize undefined super to false", () => {
      const a = { name: "a", ctrl: false, meta: false, shift: false, super: undefined as any, leader: false }
      const b = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.match(a, b)).toBe(true)
    })
    
    it("should match keybinds with leader", () => {
      const a = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: true }
      const b = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: true }
      expect(Keybind.match(a, b)).toBe(true)
    })
  })
  
  describe("fromParsedKey", () => {
    it("should convert ParsedKey to Keybind.Info", () => {
      const parsedKey = {
        name: "a",
        ctrl: true,
        meta: false,
        shift: false,
        super: undefined
      }
      
      const result = Keybind.fromParsedKey(parsedKey, true)
      
      expect(result).toEqual({
        name: "a",
        ctrl: true,
        meta: false,
        shift: false,
        super: false,
        leader: true
      })
    })
    
    it("should default leader to false", () => {
      const parsedKey = {
        name: "enter",
        ctrl: false,
        meta: false,
        shift: false,
        super: true
      }
      
      const result = Keybind.fromParsedKey(parsedKey)
      
      expect(result.leader).toBe(false)
      expect(result.super).toBe(true)
    })
  })
  
  describe("toString", () => {
    it("should return empty string for undefined", () => {
      expect(Keybind.toString(undefined)).toBe("")
    })
    
    it("should format simple key", () => {
      const info = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.toString(info)).toBe("a")
    })
    
    it("should format ctrl key", () => {
      const info = { name: "a", ctrl: true, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.toString(info)).toBe("ctrl+a")
    })
    
    it("should format multiple modifiers", () => {
      const info = { name: "a", ctrl: true, meta: true, shift: true, super: false, leader: false }
      expect(Keybind.toString(info)).toBe("ctrl+alt+shift+a")
    })
    
    it("should format with leader", () => {
      const info = { name: "a", ctrl: false, meta: false, shift: false, super: false, leader: true }
      expect(Keybind.toString(info)).toBe("<leader> a")
    })
    
    it("should format leader without key", () => {
      const info = { name: "", ctrl: false, meta: false, shift: false, super: false, leader: true }
      expect(Keybind.toString(info)).toBe("<leader>")
    })
    
    it("should convert delete to del", () => {
      const info = { name: "delete", ctrl: false, meta: false, shift: false, super: false, leader: false }
      expect(Keybind.toString(info)).toBe("del")
    })
    
    it("should format super key", () => {
      const info = { name: "a", ctrl: false, meta: false, shift: false, super: true, leader: false }
      expect(Keybind.toString(info)).toBe("super+a")
    })
  })
  
  describe("parse", () => {
    it("should return empty array for 'none'", () => {
      expect(Keybind.parse("none")).toEqual([])
    })
    
    it("should parse simple key", () => {
      const result = Keybind.parse("a")
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("a")
      expect(result[0].ctrl).toBe(false)
      expect(result[0].meta).toBe(false)
      expect(result[0].shift).toBe(false)
      expect(result[0].leader).toBe(false)
    })
    
    it("should parse ctrl modifier", () => {
      const result = Keybind.parse("ctrl+a")
      expect(result[0].ctrl).toBe(true)
      expect(result[0].name).toBe("a")
    })
    
    it("should parse alt/meta/option as meta", () => {
      expect(Keybind.parse("alt+a")[0].meta).toBe(true)
      expect(Keybind.parse("meta+a")[0].meta).toBe(true)
      expect(Keybind.parse("option+a")[0].meta).toBe(true)
    })
    
    it("should parse super modifier", () => {
      const result = Keybind.parse("super+a")
      expect(result[0].super).toBe(true)
    })
    
    it("should parse shift modifier", () => {
      const result = Keybind.parse("shift+a")
      expect(result[0].shift).toBe(true)
    })
    
    it("should parse leader syntax", () => {
      const result = Keybind.parse("<leader>a")
      expect(result[0].leader).toBe(true)
      expect(result[0].name).toBe("a")
    })
    
    it("should convert esc to escape", () => {
      const result = Keybind.parse("esc")
      expect(result[0].name).toBe("escape")
    })
    
    it("should parse multiple key combinations separated by comma", () => {
      const result = Keybind.parse("ctrl+a,ctrl+b")
      expect(result).toHaveLength(2)
      expect(result[0].ctrl).toBe(true)
      expect(result[0].name).toBe("a")
      expect(result[1].ctrl).toBe(true)
      expect(result[1].name).toBe("b")
    })
    
    it("should handle whitespace in key combinations", () => {
      const result = Keybind.parse("ctrl + a")
      expect(result[0].ctrl).toBe(true)
      expect(result[0].name).toBe("a")
    })
    
    it("should be case-insensitive", () => {
      const result = Keybind.parse("CTRL+A")
      expect(result[0].ctrl).toBe(true)
      expect(result[0].name).toBe("a")
    })
    
    it("should parse complex combinations", () => {
      const result = Keybind.parse("ctrl+shift+a")
      expect(result[0].ctrl).toBe(true)
      expect(result[0].shift).toBe(true)
      expect(result[0].name).toBe("a")
    })
  })
})