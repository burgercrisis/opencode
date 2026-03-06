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

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { BatchTool } from "../batch"

describe("BatchTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  bulletproofTest("should define tool with correct id", async () => {
    expect(BatchTool.id).toBe("batch")
  })

  bulletproofTest("should have description", async () => {
    const init = await BatchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  bulletproofTest("should have parameters schema", async () => {
    const init = await BatchTool.init()
    expect(init.parameters).toBeDefined()
  })

  bulletproofTest("should validate parameters schema", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo", parameters: { text: "hello" } },
      ],
    })
    
    expect(parsed.success).toBe(true)
  })

  bulletproofTest("should require tool_calls parameter", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should require at least one tool call", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [],
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should validate tool_calls is an array", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: "not an array",
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should validate each tool call has tool name", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { parameters: { text: "hello" } },
      ],
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should validate each tool call has parameters", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo" },
      ],
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should accept multiple tool calls", async () => {
    const init = await BatchTool.init()
    
    const parsed = init.parameters.safeParse({
      tool_calls: [
        { tool: "echo", parameters: { text: "hello" } },
        { tool: "pwd", parameters: {} },
      ],
    })
    
    expect(parsed.success).toBe(true)
  })

  bulletproofTest("should have formatValidationError function", async () => {
    const init = await BatchTool.init()
    expect(init.formatValidationError).toBeDefined()
  })

  bulletproofTest("should format validation errors", async () => {
    const init = await BatchTool.init()
    
    // Create a mock ZodError
    const mockError = {
      issues: [
        { path: ["tool_calls", 0, "tool"], message: "Required" },
      ],
    }
    
    const formatted = init.formatValidationError!(mockError as any)
    expect(formatted).toContain("Invalid parameters")
    expect(formatted).toContain("tool_calls.0.tool")
    expect(formatted).toContain("Required")
  })
})