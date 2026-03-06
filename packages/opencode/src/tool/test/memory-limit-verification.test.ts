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

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { replace } from "../edit"

describe("Memory Limit Verification", () => {
  bulletproofTest("should throw error for multiple matches", async () => {
    // Create content with many occurrences
    const content = "test\n".repeat(1500) // 1500 occurrences

    // Should throw because there are multiple matches
    expect(() => replace(content, "test", "updated")).toThrow("Found multiple matches")
  })

  bulletproofTest("should throw error for not found string", async () => {
    const content = "prefix-" + "xyz".repeat(100) + "-suffix"

    expect(() => replace(content, "test", "updated")).toThrow(
      "Could not find oldString in the file"
    )
  })

  bulletproofTest("should work normally for unique match", async () => {
    // Create content with a unique match
    const content = "prefix-unique-suffix"

    const result = replace(content, "unique", "updated")

    // Should work normally
    expect(result).toContain("updated")
    expect(result).toBe("prefix-updated-suffix")
  })

  bulletproofTest("should replace all with replaceAll flag", async () => {
    // Create content with many occurrences
    const content = "test\n".repeat(100) // 100 occurrences

    const result = replace(content, "test", "updated", true)

    // Should replace all with replaceAll flag
    expect(result).toContain("updated")
    const updateCount = (result.match(/updated/g) || []).length
    expect(updateCount).toBe(100)
  })
})
