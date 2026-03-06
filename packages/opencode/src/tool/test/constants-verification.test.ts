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

describe("Constants Verification", () => {
  bulletproofTest("should throw error for multiple matches", async () => {
    // Test that multiple matches throw an error
    const content = "test\n".repeat(100)
    
    expect(() => replace(content, "test", "updated")).toThrow(
      "Found multiple matches for oldString. Provide more surrounding context to make the match unique."
    )
  })

  bulletproofTest("should replace unique match", async () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("world")
}
`.trim()

    const result = replace(content, 'console.log("hello")', 'console.log("replaced")')
    
    // Should work normally for unique match
    expect(result).toContain('console.log("replaced")')
    expect(result).not.toContain('console.log("hello")')
    // Other content should remain
    expect(result).toContain('console.log("world")')
  })

  bulletproofTest("should throw error for not found string", async () => {
    const content = "some content here"
    
    expect(() => replace(content, "nonexistent", "updated")).toThrow(
      "Could not find oldString in the file"
    )
  })

  bulletproofTest("should throw error for identical old and new strings", async () => {
    const content = "test content"
    
    expect(() => replace(content, "test", "test")).toThrow(
      "No changes to apply: oldString and newString are identical."
    )
  })

  bulletproofTest("should replace with replaceAll flag", async () => {
    const content = "test\ntest\ntest\n"
    
    const result = replace(content, "test", "updated", true)
    
    // All occurrences should be replaced
    expect(result).toBe("updated\nupdated\nupdated\n")
  })
})
