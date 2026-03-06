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

describe("Edit Tool Input Validation", () => {
  bulletproofTest("should validate required filePath", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({} as any, {} as any)
    ).rejects.toThrow("filePath is required")
  })

  bulletproofTest("should validate non-empty oldString", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "",
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("oldString is required and cannot be empty")
  })

  bulletproofTest("should validate non-empty newString", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "old",
        newString: ""
      }, {} as any)
    ).rejects.toThrow("newString is required and cannot be empty")
  })

  bulletproofTest("should reject identical strings", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "same",
        newString: "same"
      }, {} as any)
    ).rejects.toThrow("No changes to apply: oldString and newString are identical.")
  })

  bulletproofTest("should reject null bytes in strings", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "test\0malicious",
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("String parameters cannot contain null bytes")
  })

  bulletproofTest("should reject strings exceeding max length", async () => {
    const { EditTool } = await import("../src/tool/edit")
    const longString = "a".repeat(1001) // Exceeds TOOL.MAX_LENGTH
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: longString,
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("String parameters too long: max 1000 characters allowed")
  })

  bulletproofTest("should accept valid parameters", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    // Mock the file operations to avoid actual file I/O
    const originalWithLock = global.FileTime?.withLock
    global.FileTime = {
      withLock: async (path: string, callback: () => Promise<any>) => {
        if (path === "/test.txt") {
          return callback()
        }
        throw new Error("File not found")
      }
    } as any
    
    try {
      const result = await EditTool.execute({
        filePath: "/test.txt",
        oldString: "old text",
        newString: "new text",
        replaceAll: false
      }, {} as any)
      
      expect(result).toBeDefined()
      expect(result.title).toBeDefined()
      
    } finally {
      global.FileTime = { withLock: originalWithLock }
    }
  })
})
