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

// KEY FILE PROTECTION
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
    console.log("[key-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[key-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[key-protection] Using current Instance")
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

import { describe, test, expect } from "bun:test"
import { Keybind } from "../src/util/keybind"

describe("Keybind.toString", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  bulletproofTest("should convert simple key to string", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "f" }
    expect(Keybind.toString(info)).toBe("f")
  })

  bulletproofTest("should convert ctrl modifier to string", async () => {
    const info: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "x" }
    expect(Keybind.toString(info)).toBe("ctrl+x")
  })

  bulletproofTest("should convert leader key to string", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: true, name: "f" }
    expect(Keybind.toString(info)).toBe("<leader> f")
  })

  bulletproofTest("should convert multiple modifiers to string", async () => {
    const info: Keybind.Info = { ctrl: true, meta: true, shift: false, leader: false, name: "g" }
    expect(Keybind.toString(info)).toBe("ctrl+alt+g")
  })

  bulletproofTest("should convert all modifiers to string", async () => {
    const info: Keybind.Info = { ctrl: true, meta: true, shift: true, leader: true, name: "h" }
    expect(Keybind.toString(info)).toBe("<leader> ctrl+alt+shift+h")
  })

  bulletproofTest("should convert shift modifier to string", async () => {
    const info: Keybind.Info = {
      ctrl: false,
      meta: false,
      shift: true,
      leader: false,
      name: "return",
    }
    expect(Keybind.toString(info)).toBe("shift+return")
  })

  bulletproofTest("should convert function key to string", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "f2" }
    expect(Keybind.toString(info)).toBe("f2")
  })

  bulletproofTest("should convert special key to string", async () => {
    const info: Keybind.Info = {
      ctrl: false,
      meta: false,
      shift: false,
      leader: false,
      name: "pgup",
    }
    expect(Keybind.toString(info)).toBe("pgup")
  })

  bulletproofTest("should handle empty name", async () => {
    const info: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "" }
    expect(Keybind.toString(info)).toBe("ctrl")
  })

  bulletproofTest("should handle only modifiers", async () => {
    const info: Keybind.Info = { ctrl: true, meta: true, shift: true, leader: true, name: "" }
    expect(Keybind.toString(info)).toBe("<leader> ctrl+alt+shift")
  })

  bulletproofTest("should handle only leader with no other parts", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: true, name: "" }
    expect(Keybind.toString(info)).toBe("<leader>")
  })

  bulletproofTest("should convert super modifier to string", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: false, super: true, leader: false, name: "z" }
    expect(Keybind.toString(info)).toBe("super+z")
  })

  bulletproofTest("should convert super+shift modifier to string", async () => {
    const info: Keybind.Info = { ctrl: false, meta: false, shift: true, super: true, leader: false, name: "z" }
    expect(Keybind.toString(info)).toBe("super+shift+z")
  })

  bulletproofTest("should handle super with ctrl modifier", async () => {
    const info: Keybind.Info = { ctrl: true, meta: false, shift: false, super: true, leader: false, name: "a" }
    expect(Keybind.toString(info)).toBe("ctrl+super+a")
  })

  bulletproofTest("should handle super with all modifiers", async () => {
    const info: Keybind.Info = { ctrl: true, meta: true, shift: true, super: true, leader: false, name: "x" }
    expect(Keybind.toString(info)).toBe("ctrl+alt+super+shift+x")
  })

  bulletproofTest("should handle undefined super field (omitted)", async () => {
    const info: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "c" }
    expect(Keybind.toString(info)).toBe("ctrl+c")
  })
})

describe("Keybind.match", () => {
  bulletproofTest("should match identical keybinds", async () => {
    const a: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "x" }
    const b: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "x" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should not match different key names", async () => {
    const a: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "x" }
    const b: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "y" }
    expect(Keybind.match(a, b)).toBe(false)
  })

  bulletproofTest("should not match different modifiers", async () => {
    const a: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "x" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "x" }
    expect(Keybind.match(a, b)).toBe(false)
  })

  bulletproofTest("should match leader keybinds", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: true, name: "f" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: true, name: "f" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should not match leader vs non-leader", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: true, name: "f" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "f" }
    expect(Keybind.match(a, b)).toBe(false)
  })

  bulletproofTest("should match complex keybinds", async () => {
    const a: Keybind.Info = { ctrl: true, meta: true, shift: false, leader: false, name: "g" }
    const b: Keybind.Info = { ctrl: true, meta: true, shift: false, leader: false, name: "g" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should not match with one modifier different", async () => {
    const a: Keybind.Info = { ctrl: true, meta: true, shift: false, leader: false, name: "g" }
    const b: Keybind.Info = { ctrl: true, meta: true, shift: true, leader: false, name: "g" }
    expect(Keybind.match(a, b)).toBe(false)
  })

  bulletproofTest("should match simple key without modifiers", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "a" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, leader: false, name: "a" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should match super modifier keybinds", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: false, super: true, leader: false, name: "z" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, super: true, leader: false, name: "z" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should not match super vs non-super", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: false, super: true, leader: false, name: "z" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: false, super: false, leader: false, name: "z" }
    expect(Keybind.match(a, b)).toBe(false)
  })

  bulletproofTest("should match undefined super with false super", async () => {
    const a: Keybind.Info = { ctrl: true, meta: false, shift: false, leader: false, name: "c" }
    const b: Keybind.Info = { ctrl: true, meta: false, shift: false, super: false, leader: false, name: "c" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should match super+shift combination", async () => {
    const a: Keybind.Info = { ctrl: false, meta: false, shift: true, super: true, leader: false, name: "z" }
    const b: Keybind.Info = { ctrl: false, meta: false, shift: true, super: true, leader: false, name: "z" }
    expect(Keybind.match(a, b)).toBe(true)
  })

  bulletproofTest("should not match when only super differs", async () => {
    const a: Keybind.Info = { ctrl: true, meta: true, shift: true, super: true, leader: false, name: "a" }
    const b: Keybind.Info = { ctrl: true, meta: true, shift: true, super: false, leader: false, name: "a" }
    expect(Keybind.match(a, b)).toBe(false)
  })
})

describe("Keybind.parse", () => {
  bulletproofTest("should parse simple key", async () => {
    const result = Keybind.parse("f")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: false,
        name: "f",
      },
    ])
  })

  bulletproofTest("should parse leader key syntax", async () => {
    const result = Keybind.parse("<leader>f")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: true,
        name: "f",
      },
    ])
  })

  bulletproofTest("should parse ctrl modifier", async () => {
    const result = Keybind.parse("ctrl+x")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: false,
        shift: false,
        leader: false,
        name: "x",
      },
    ])
  })

  bulletproofTest("should parse multiple modifiers", async () => {
    const result = Keybind.parse("ctrl+alt+u")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: true,
        shift: false,
        leader: false,
        name: "u",
      },
    ])
  })

  bulletproofTest("should parse shift modifier", async () => {
    const result = Keybind.parse("shift+f2")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: true,
        leader: false,
        name: "f2",
      },
    ])
  })

  bulletproofTest("should parse meta/alt modifier", async () => {
    const result = Keybind.parse("meta+g")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: true,
        shift: false,
        leader: false,
        name: "g",
      },
    ])
  })

  bulletproofTest("should parse leader with modifier", async () => {
    const result = Keybind.parse("<leader>h")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: true,
        name: "h",
      },
    ])
  })

  bulletproofTest("should parse multiple keybinds separated by comma", async () => {
    const result = Keybind.parse("ctrl+c,<leader>q")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: false,
        shift: false,
        leader: false,
        name: "c",
      },
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: true,
        name: "q",
      },
    ])
  })

  bulletproofTest("should parse shift+return combination", async () => {
    const result = Keybind.parse("shift+return")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: true,
        leader: false,
        name: "return",
      },
    ])
  })

  bulletproofTest("should parse ctrl+j combination", async () => {
    const result = Keybind.parse("ctrl+j")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: false,
        shift: false,
        leader: false,
        name: "j",
      },
    ])
  })

  bulletproofTest("should handle 'none' value", async () => {
    const result = Keybind.parse("none")
    expect(result).toEqual([])
  })

  bulletproofTest("should handle special keys", async () => {
    const result = Keybind.parse("pgup")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: false,
        name: "pgup",
      },
    ])
  })

  bulletproofTest("should handle function keys", async () => {
    const result = Keybind.parse("f2")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        leader: false,
        name: "f2",
      },
    ])
  })

  bulletproofTest("should handle complex multi-modifier combination", async () => {
    const result = Keybind.parse("ctrl+alt+g")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: true,
        shift: false,
        leader: false,
        name: "g",
      },
    ])
  })

  bulletproofTest("should be case insensitive", async () => {
    const result = Keybind.parse("CTRL+X")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: false,
        shift: false,
        leader: false,
        name: "x",
      },
    ])
  })

  bulletproofTest("should parse super modifier", async () => {
    const result = Keybind.parse("super+z")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: false,
        super: true,
        leader: false,
        name: "z",
      },
    ])
  })

  bulletproofTest("should parse super with shift modifier", async () => {
    const result = Keybind.parse("super+shift+z")
    expect(result).toEqual([
      {
        ctrl: false,
        meta: false,
        shift: true,
        super: true,
        leader: false,
        name: "z",
      },
    ])
  })

  bulletproofTest("should parse multiple keybinds with super", async () => {
    const result = Keybind.parse("ctrl+-,super+z")
    expect(result).toEqual([
      {
        ctrl: true,
        meta: false,
        shift: false,
        leader: false,
        name: "-",
      },
      {
        ctrl: false,
        meta: false,
        shift: false,
        super: true,
        leader: false,
        name: "z",
      },
    ])
  })
})
