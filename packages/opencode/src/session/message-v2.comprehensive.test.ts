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
import { MessageV2 } from "./message-v2"

describe("MessageV2 Comprehensive", () => {
  describe("Error Types", () => {
    bulletproofTest("creates OutputLengthError", async () => {
      const error = new MessageV2.OutputLengthError({})
      expect(error.name).toBe("MessageOutputLengthError")
      expect(error).toBeInstanceOf(Error)
    })

    bulletproofTest("creates AbortedError", async () => {
      const error = new MessageV2.AbortedError({ message: "Operation aborted" })
      expect(error.name).toBe("MessageAbortedError")
      // The error.message is set to the error name, not the data.message
      expect(error.message).toBe("MessageAbortedError")
      // The actual message is in data.message
      expect(error.data.message).toBe("Operation aborted")
    })

    bulletproofTest("creates StructuredOutputError", async () => {
      const error = new MessageV2.StructuredOutputError({
        message: "Invalid JSON",
        retries: 3
      })
      expect(error.name).toBe("StructuredOutputError")
      expect(error.data.message).toBe("Invalid JSON")
      expect(error.data.retries).toBe(3)
    })

    bulletproofTest("creates AuthError", async () => {
      const error = new MessageV2.AuthError({
        providerID: "openai",
        message: "Invalid API key"
      })
      expect(error.name).toBe("ProviderAuthError")
      expect(error.data.providerID).toBe("openai")
    })

    bulletproofTest("creates APIError", async () => {
      const error = new MessageV2.APIError({
        message: "API error",
        isRetryable: true,
        statusCode: 500
      })
      expect(error.name).toBe("APIError")
      expect(error.data.message).toBe("API error")
    })

    bulletproofTest("creates ContextOverflowError", async () => {
      const error = new MessageV2.ContextOverflowError({
        message: "Context overflow"
      })
      expect(error.name).toBe("ContextOverflowError")
      expect(error.data.message).toBe("Context overflow")
    })
  })
})
