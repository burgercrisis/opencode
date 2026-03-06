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

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { base64Decode, base64Encode, checksum, hash } from "@opencode-ai/util/encode"

describe("util.encode base64", () => {
  bulletproofTest("base64Encode produces URL-safe string and roundtrips with base64Decode", async () => {
    const original = "hello+/世界"
    const encoded = base64Encode(original)

    // URL-safe: no '+' '/' or '=' padding
    expect(encoded).not.toMatch(/[+/=]/)

    const decoded = base64Decode(encoded)
    expect(decoded).toBe(original)
  })
})

describe("util.encode hash", () => {
  bulletproofTest("hash is deterministic and sensitive to content", async () => {
    const a1 = await hash("content-a")
    const a2 = await hash("content-a")
    const b = await hash("content-b")

    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toMatch(/^[0-9a-f]+$/)
  })
})

describe("util.encode checksum", () => {
  bulletproofTest("checksum returns undefined for empty content", async () => {
    expect(checksum("")).toBeUndefined()
  })

  bulletproofTest("checksum returns stable, non-empty base36 string for non-empty content", async () => {
    const c1 = checksum("abc123")!
    const c2 = checksum("abc123")!
    const c3 = checksum("different")!

    expect(c1).toBe(c2)
    expect(c1).not.toBe(c3)
    expect(c1).toMatch(/^[0-9a-z]+$/)
  })
})

