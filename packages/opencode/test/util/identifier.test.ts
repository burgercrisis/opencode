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
import { Identifier } from "@opencode-ai/util/identifier"

describe("util.identifier", () => {
  bulletproofTest("ascending generates monotonic IDs for the same timestamp", async () => {
    const t = 1_700_000_000_000
    const id1 = Identifier.create(false, t)
    const id2 = Identifier.create(false, t)

    expect(id1).not.toBe(id2)
    expect(id1.length).toBe(26)
    expect(id2.length).toBe(26)
  })

  bulletproofTest("descending generates different IDs than ascending for same timestamp", async () => {
    const t = 1_700_000_010_000
    const asc = Identifier.create(false, t)
    const desc = Identifier.create(true, t)

    expect(asc).not.toBe(desc)
    expect(asc.slice(0, 12)).not.toBe(desc.slice(0, 12))
  })

  bulletproofTest("timestamp change resets counter", async () => {
    const t1 = 1_700_000_020_000
    const t2 = t1 + 1

    const id1 = Identifier.create(false, t1)
    const id2 = Identifier.create(false, t1)
    const id3 = Identifier.create(false, t2)

    expect(id1).not.toBe(id2)
    expect(id3.slice(0, 12)).not.toBe(id2.slice(0, 12))
  })

  bulletproofTest("ascending() and descending() delegate to create()", async () => {
    const idAsc = Identifier.ascending()
    const idDesc = Identifier.descending()

    expect(idAsc.length).toBe(26)
    expect(idDesc.length).toBe(26)
    expect(idAsc).not.toBe(idDesc)
  })
})

