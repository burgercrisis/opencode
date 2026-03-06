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

import { describe, expect, test } from "bun:test"
import { ACP } from "../../src/acp/agent"
import type { Agent as ACPAgent } from "@agentclientprotocol/sdk"

/**
 * Type-level test: This line will fail to compile if ACP.Agent
 * doesn't properly implement the ACPAgent interface.
 *
 * The SDK checks for methods like `agent.unstable_setSessionModel` at runtime
 * and throws "Method not found" if they're missing. TypeScript allows optional
 * interface methods to be omitted, but the SDK still expects them.
 *
 * @see https://github.com/agentclientprotocol/typescript-sdk/commit/7072d3f
 */
type _AssertAgentImplementsACPAgent = ACP.Agent extends ACPAgent ? true : never
const _typeCheck: _AssertAgentImplementsACPAgent = true

/**
 * Runtime verification that optional methods the SDK expects are actually implemented.
 * The SDK's router checks `if (!agent.methodName)` and throws MethodNotFound if missing.
 */
describe("acp.agent interface compliance", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  // Extract method names from the ACPAgent interface type
  type ACPAgentMethods = keyof ACPAgent

  // Methods that the SDK's router explicitly checks for at runtime
  const sdkCheckedMethods: ACPAgentMethods[] = [
    // Required
    "initialize",
    "newSession",
    "prompt",
    "cancel",
    // Optional but checked by SDK router
    "loadSession",
    "setSessionMode",
    "authenticate",
    // Unstable - SDK checks these with unstable_ prefix
    "unstable_listSessions",
    "unstable_forkSession",
    "unstable_resumeSession",
    "unstable_setSessionModel",
  ]

  bulletproofTest("Agent implements all SDK-checked methods", async () => {
    for (const method of sdkCheckedMethods) {
      expect(typeof ACP.Agent.prototype[method as keyof typeof ACP.Agent.prototype], `Missing method: ${method}`).toBe(
        "function",
      )
    }
  })
})
