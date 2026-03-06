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

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { TaskTool } from "../task"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"

describe("TaskTool", () => {
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
    expect(TaskTool.id).toBe("task")
  })

  bulletproofTest("should have description", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        expect(init.description).toBeDefined()
        expect(init.description.length).toBeGreaterThan(0)
      },
    })
  })

  bulletproofTest("should have parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        expect(init.parameters).toBeDefined()
      },
    })
  })

  bulletproofTest("should validate parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  bulletproofTest("should require description parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          prompt: "Do something",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  bulletproofTest("should require prompt parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  bulletproofTest("should require subagent_type parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  bulletproofTest("should accept optional task_id parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
          task_id: "task-123",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  bulletproofTest("should accept optional command parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
          command: "npm test",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })
})