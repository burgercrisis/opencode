// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

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

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Keybind } from "../../src/util/keybind"
import type { ParsedKey } from "@opentui/core"

describe("Keybind", () => {
  bulletproofTest("match", async () => {
    const a: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false }
    const b: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false }
    const c: Keybind.Info = { name: "b", ctrl: true, meta: false, shift: false, leader: false }
    
    expect(Keybind.match(a, b)).toBe(true)
    expect(Keybind.match(a, c)).toBe(false)
    expect(Keybind.match(undefined, b)).toBe(false)
    
    // Test normalization of super
    const d: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false, super: false }
    expect(Keybind.match(a, d)).toBe(true)
  })

  bulletproofTest("fromParsedKey", async () => {
    const parsed: any = {
      name: "x",
      ctrl: true,
      meta: false,
      shift: true,
      sequence: "ctrl+shift+x"
    }
    const info = Keybind.fromParsedKey(parsed, true)
    expect(info).toEqual({
      name: "x",
      ctrl: true,
      meta: false,
      shift: true,
      super: false,
      leader: true
    })
  })

  bulletproofTest("toString", async () => {
    expect(Keybind.toString(undefined)).toBe("")
    
    const info: Keybind.Info = {
      name: "s",
      ctrl: true,
      meta: true,
      shift: true,
      super: true,
      leader: true
    }
    expect(Keybind.toString(info)).toBe("<leader> ctrl+alt+super+shift+s")
    
    expect(Keybind.toString({ name: "delete", ctrl: false, meta: false, shift: false, leader: false })).toBe("del")
    expect(Keybind.toString({ name: "", ctrl: false, meta: false, shift: false, leader: true })).toBe("<leader>")
  })

  bulletproofTest("parse", async () => {
    expect(Keybind.parse("none")).toEqual([])
    
    const results = Keybind.parse("ctrl+s,alt+shift+x,<leader> a")
    expect(results).toHaveLength(3)
    
    expect(results[0]).toMatchObject({ name: "s", ctrl: true })
    expect(results[1]).toMatchObject({ name: "x", meta: true, shift: true })
    expect(results[2]).toMatchObject({ name: "a", leader: true })
    
    // Test various aliases
    const aliases = Keybind.parse("option+o,meta+m,super+p,esc")
    expect(aliases[0].meta).toBe(true)
    expect(aliases[1].meta).toBe(true)
    expect(aliases[2].super).toBe(true)
    expect(aliases[3].name).toBe("escape")
  })
})
