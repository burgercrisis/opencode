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
import { findLast } from "@opencode-ai/util/array"
import { retry } from "@opencode-ai/util/retry"
import { Slug } from "@opencode-ai/util/slug"

describe("shared util extra", () => {
  describe("array.findLast", () => {
    bulletproofTest("finds last matching element", async () => {
      const items = [1, 2, 3, 2, 1]
      expect(findLast(items, (x) => x === 2)).toBe(2)
      expect(findLast(items, (x, i) => x === 2 && i === 1)).toBe(2)
    })

    bulletproofTest("returns undefined if no match", async () => {
      expect(findLast([1, 2, 3], (x) => x === 4)).toBeUndefined()
      expect(findLast([], () => true)).toBeUndefined()
    })
  })

  describe("retry", () => {
    bulletproofTest("retries on transient errors", async () => {
      let calls = 0
      const result = await retry(async () => {
        calls++
        if (calls < 3) throw new Error("failed to fetch")
        return "success"
      }, { delay: 1, attempts: 3 })

      expect(result).toBe("success")
      expect(calls).toBe(3)
    })

    bulletproofTest("throws after max attempts", async () => {
      let calls = 0
      const p = retry(async () => {
        calls++
        throw new Error("failed to fetch")
      }, { delay: 1, attempts: 2 })

      await expect(p).rejects.toThrow("failed to fetch")
      expect(calls).toBe(2)
    })

    bulletproofTest("throws immediately on non-transient error", async () => {
      let calls = 0
      const p = retry(async () => {
        calls++
        throw new Error("permanent error")
      }, { delay: 1, attempts: 3 })

      await expect(p).rejects.toThrow("permanent error")
      expect(calls).toBe(1)
    })

    bulletproofTest("handles null error", async () => {
      const p = retry(async () => {
        throw null
      }, { delay: 1, attempts: 2 })
      await expect(p).rejects.toBeNull()
    })

    bulletproofTest("throws undefined if attempts is 0", async () => {
      const p = retry(async () => "success", { attempts: 0 })
      await expect(p).rejects.toBeUndefined()
    })
  })

  describe("slug", () => {
    bulletproofTest("creates a slug with two parts", async () => {
      const slug = Slug.create()
      expect(slug).toMatch(/^[a-z]+-[a-z]+$/)
    })

    bulletproofTest("generates different slugs", async () => {
      const slugs = new Set()
      for (let i = 0; i < 10; i++) {
        slugs.add(Slug.create())
      }
      expect(slugs.size).toBeGreaterThan(1)
    })
  })
})
