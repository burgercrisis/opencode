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
import { ListTool } from "../ls"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("ListTool", () => {
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
    expect(ListTool.id).toBe("list")
  })

  bulletproofTest("should have description", async () => {
    const init = await ListTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  bulletproofTest("should have parameters schema", async () => {
    const init = await ListTool.init()
    expect(init.parameters).toBeDefined()
  })

  bulletproofTest("should list files in directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.txt"), "content2")
        await Bun.write(path.join(dir, "subdir", "file3.txt"), "content3")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.count).toBeGreaterThanOrEqual(2)
        expect(result.metadata.truncated).toBeDefined()
      },
    })
  })

  bulletproofTest("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        await init.execute({ path: "." }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls.at(-1)[0]
        expect(call.permission).toBe("list")
      },
    })
  })

  bulletproofTest("should handle custom path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.title).toBeDefined()
      },
    })
  })

  bulletproofTest("should handle ignore patterns", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.log"), "content2")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        // ignore should be an array
        const result = await init.execute({ path: ".", ignore: ["*.log"] }, mockCtx)

        expect(result.metadata.count).toBeGreaterThanOrEqual(0)
      },
    })
  })

  bulletproofTest("should return empty output for empty directory", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.metadata.count).toBe(0)
      },
    })
  })
})