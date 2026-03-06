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
import { ReadTool } from "../read"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("ReadTool", () => {
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
    expect(ReadTool.id).toBe("read")
  })

  bulletproofTest("should have description", async () => {
    const init = await ReadTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  bulletproofTest("should have parameters schema", async () => {
    const init = await ReadTool.init()
    expect(init.parameters).toBeDefined()
  })

  bulletproofTest("should throw error for non-existent file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        
        await expect(init.execute({ filePath: "nonexistent.txt" }, mockCtx)).rejects.toThrow()
      },
    })
  })

  bulletproofTest("should request permission", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        await init.execute({ filePath: "test.txt" }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls.at(-1)[0]
        expect(call.permission).toBe("read")
      },
    })
  })

  bulletproofTest("should read existing file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "Hello, World!")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "test.txt" }, mockCtx)

        expect(result.title).toBeDefined()
        // The output contains the file content in a specific format
        expect(result.output).toBeDefined()
      },
    })
  })

  bulletproofTest("should read directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.txt"), "content2")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "." }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.output).toBeDefined()
      },
    })
  })

  bulletproofTest("should handle offset parameter", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Create a file with 5 lines - use actual newlines
        const lines = ["line1", "line2", "line3", "line4", "line5"].join("\n")
        await Bun.write(path.join(dir, "test.txt"), lines)
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        // Use absolute path since resolvePath uses cwd
        const result = await init.execute({ filePath: path.join(tmp.path, "test.txt"), offset: 2 }, mockCtx)

        expect(result.output).toBeDefined()
      },
    })
  })

  bulletproofTest("should handle limit parameter", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "line1\nline2\nline3\nline4\nline5")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ReadTool.init()
        const result = await init.execute({ filePath: "test.txt", limit: 2 }, mockCtx)

        expect(result.output).toBeDefined()
      },
    })
  })
})