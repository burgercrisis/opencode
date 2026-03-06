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


import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test"
import { SessionCompaction } from "./compaction"
import { Config } from "../config/config"

describe("SessionCompaction.isOverflow", () => {
  beforeEach(() => {
    spyOn(Config, "get").mockResolvedValue({
      compaction: { auto: true }
    } as any)
  })

  bulletproofTest("returns true when model context limit is 0 (uses fallback)", async () => {
    const input = {
      tokens: {
        input: 150000, // Greater than 128000 fallback
        output: 1000,
        cache: { read: 0, write: 0 }
      },
      model: {
        id: "custom-model",
        limit: {
          context: 0, // No limit specified
          output: 4096
        }
      }
    }

    // @ts-ignore
    const result = await SessionCompaction.isOverflow(input)
    expect(result).toBe(true)
  })

  bulletproofTest("returns true when usage exceeds limit", async () => {
    const input = {
      tokens: {
        input: 100000,
        output: 1000,
        cache: { read: 0, write: 0 }
      },
      model: {
        id: "custom-model",
        limit: {
          context: 50000, // Explicit limit
          output: 4096
        }
      }
    }

    // @ts-ignore
    const result = await SessionCompaction.isOverflow(input)
    expect(result).toBe(true)
  })
})
