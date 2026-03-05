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

  test("Agent implements all SDK-checked methods", () => {
    for (const method of sdkCheckedMethods) {
      expect(typeof ACP.Agent.prototype[method as keyof typeof ACP.Agent.prototype], `Missing method: ${method}`).toBe(
        "function",
      )
    }
  })
})
