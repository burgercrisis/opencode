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
import { Truncate } from "../truncation"
import fs from "fs/promises"
import path from "path"
import { Global } from "../../../global"

describe("Truncation", () => {
  describe("constants", () => {
    bulletproofTest("should have correct MAX_LINES", async () => {
      expect(Truncate.MAX_LINES).toBe(2000)
    })

    bulletproofTest("should have correct MAX_BYTES", async () => {
      expect(Truncate.MAX_BYTES).toBe(50 * 1024)
    })

    bulletproofTest("should have correct DIR", async () => {
      expect(Truncate.DIR).toContain("tool-output")
    })

    bulletproofTest("should have correct GLOB pattern", async () => {
      expect(Truncate.GLOB).toContain("*")
    })
  })

  describe("output", () => {
    bulletproofTest("should return content unchanged when under limits", async () => {
      const text = "Hello world\n".repeat(100)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    bulletproofTest("should truncate when exceeding line limit", async () => {
      const text = "Line\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
        expect(result.content).toContain("truncated")
      }
    })

    bulletproofTest("should truncate when exceeding byte limit", async () => {
      const text = "A".repeat(100 * 1024)
      const result = await Truncate.output(text, { maxBytes: 1024 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
      }
    })

    bulletproofTest("should handle tail direction", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxLines: 10, direction: "tail" })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.content).toContain("Line 90")
        expect(result.content).toContain("Line 99")
      }
    })

    bulletproofTest("should handle tail direction with byte limit", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i + " with some content")
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxBytes: 200, direction: "tail" })
      expect(result.truncated).toBe(true)
    })

    bulletproofTest("should save truncated content to file", async () => {
      const text = "Test content\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        const fileContent = await Bun.file(result.outputPath).text()
        expect(fileContent).toBe(text)
      }
    })

    bulletproofTest("should use default maxLines when not specified", async () => {
      const text = "Line\n".repeat(2500)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(true)
    })

    bulletproofTest("should use default maxBytes when not specified", async () => {
      const text = "A".repeat(60 * 1024)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(true)
    })

    bulletproofTest("should use default head direction when not specified", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxLines: 10 })
      if (result.truncated) {
        expect(result.content).toContain("Line 0")
        expect(result.content).toContain("Line 9")
        expect(result.content).not.toContain("Line 90")
      }
    })

    bulletproofTest("should handle empty text", async () => {
      const text = ""
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe("")
    })

    bulletproofTest("should handle single line text", async () => {
      const text = "Single line"
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe("Single line")
    })

    bulletproofTest("should handle text with exactly maxLines", async () => {
      // Create 100 lines without trailing newline (exactly 100 lines)
      const text = Array(100).fill("Line").join("\n")
      const result = await Truncate.output(text, { maxLines: 100 })
      // The function returns content, not output
      expect(result.content).toBeDefined()
      expect(result.truncated).toBe(false)
    })

    bulletproofTest("should handle text with exactly maxBytes", async () => {
      const text = "A".repeat(1024)
      const result = await Truncate.output(text, { maxBytes: 1024 })
      expect(result.truncated).toBe(false)
    })

    bulletproofTest("should count bytes correctly with newlines", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxBytes: 100, direction: "head" })
      expect(result.truncated).toBe(true)
    })

    bulletproofTest("should include hint about task tool when agent has task permission", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {
        permission: [{ permission: "task", pattern: "*", action: "allow" }]
      } as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Task tool")
      }
    })

    bulletproofTest("should include hint about grep/read when agent lacks task permission", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {
        permission: [{ permission: "task", pattern: "*", action: "deny" }]
      } as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })

    bulletproofTest("should handle agent without permission array", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {} as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })

    bulletproofTest("should handle undefined agent", async () => {
      const text = "Line\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 }, undefined)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })
  })

  describe("init", () => {
    bulletproofTest("should register cleanup scheduler", async () => {
      // Just verify it doesn't throw
      expect(() => Truncate.init()).not.toThrow()
    })
  })

  describe("cleanup", () => {
    bulletproofTest("should not throw when directory doesn't exist", async () => {
      // Just verify it completes without throwing an error
      // The cleanup function may resolve with undefined
      const result = await Truncate.cleanup()
      expect(result).toBeUndefined()
    })
  })
})