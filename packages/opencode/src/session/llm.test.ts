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

import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import { LLM } from "./llm"
import { Instance } from "@/project/instance"

// Mock dependencies
mock.module("@/project/instance", () => ({
  Instance: {
    project: {
      id: "test-project-id"
    },
    directory: "/test/directory",
    worktree: "/test/worktree",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined)
  }
}))

describe("LLM", () => {
  beforeEach(() => {
    // No mocks to clear - mock.module handles cleanup automatically
  })

  afterEach(() => {
    // No mocks to restore - mock.module handles cleanup automatically
  })

  describe("hasToolCalls", () => {
    bulletproofTest("detects tool calls in messages", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll help you" },
            { type: "tool-call", toolCall: { toolName: "read", args: { path: "test.txt" } } }
          ]
        }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(true)
    })

    bulletproofTest("detects tool results in messages", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll help you" },
            { type: "tool-result", toolCallId: "call1", result: { content: "File content" } }
          ]
        }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(true)
    })

    bulletproofTest("returns false for messages without tool calls", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(false)
    })

    bulletproofTest("handles non-array content gracefully", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Just a string" }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(false)
    })
  })

  describe("constants", () => {
    bulletproofTest("exports OUTPUT_TOKEN_MAX", async () => {
      expect(LLM.OUTPUT_TOKEN_MAX).toBeDefined()
      expect(typeof LLM.OUTPUT_TOKEN_MAX).toBe("number")
    })
  })
})
