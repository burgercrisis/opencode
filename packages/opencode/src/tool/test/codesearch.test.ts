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
import { CodeSearchTool } from "../codesearch"

describe("CodeSearchTool", () => {
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
    expect(CodeSearchTool.id).toBe("codesearch")
  })

  bulletproofTest("should have description", async () => {
    const init = await CodeSearchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  bulletproofTest("should have parameters schema", async () => {
    const init = await CodeSearchTool.init()
    expect(init.parameters).toBeDefined()
  })

  bulletproofTest("should validate parameters schema", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React useState hook examples",
    })
    
    expect(parsed.success).toBe(true)
  })

  bulletproofTest("should require query parameter", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should accept optional tokensNum parameter", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 10000,
    })
    
    expect(parsed.success).toBe(true)
  })

  bulletproofTest("should validate tokensNum minimum", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 500,
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should validate tokensNum maximum", async () => {
    const init = await CodeSearchTool.init()
    
    const parsed = init.parameters.safeParse({
      query: "React hooks",
      tokensNum: 60000,
    })
    
    expect(parsed.success).toBe(false)
  })

  bulletproofTest("should request permission", async () => {
    const init = await CodeSearchTool.init()
    
    try {
      await init.execute({
        query: "React hooks",
      }, mockCtx)
    } catch (e) {
      // May fail due to network
    }

    expect(mockCtx.ask).toHaveBeenCalledWith({
      permission: "codesearch",
      patterns: ["React hooks"],
      always: ["*"],
      metadata: {
        query: "React hooks",
        tokensNum: 5000,
      },
    })
  })
})