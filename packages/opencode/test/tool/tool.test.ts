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

import { describe, expect, it, mock, vi, afterEach, beforeEach } from "bun:test"
import z from "zod"
import { Tool } from "../../src/tool/tool"
import { Truncate } from "../../src/tool/truncation"

describe("Tool", () => {
  const truncateOutputSpy = vi.spyOn(Truncate, "output")

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("define", () => {
    it("defines a tool and handles execution", async () => {
      truncateOutputSpy.mockResolvedValue({
        content: "truncated content",
        truncated: true,
        outputPath: "path/to/output"
      })
      const tool = Tool.define<z.ZodObject<{ foo: z.ZodString }>, { some: string; truncated?: boolean; outputPath?: string }>("test-tool", {
        description: "A test tool",
        parameters: z.object({ foo: z.string() }),
        execute: async (args) => ({
          title: "Test Result",
          metadata: { some: "meta" },
          output: `Result: ${args.foo}`
        })
      })

      expect(tool.id).toBe("test-tool")
      const instance = await tool.init()
      expect(instance.description).toBe("A test tool")

      const ctx: Tool.Context = {
        sessionID: "s1",
        messageID: "m1",
        agent: "a1",
        abort: new AbortController().signal,
        messages: [],
        metadata: mock(),
        ask: mock()
      }

      const result = await instance.execute({ foo: "bar" }, ctx)
      expect(result.title).toBe("Test Result")
      expect(result.output).toBe("truncated content")
      expect(result.metadata.truncated).toBe(true)
      expect(result.metadata.outputPath).toBe("path/to/output")
      expect(Truncate.output).toHaveBeenCalled()
    })

    it("handles validation errors with default message", async () => {
      const tool = Tool.define("test-tool", {
        description: "A test tool",
        parameters: z.object({ foo: z.string() }),
        execute: async () => ({
          title: "Result",
          metadata: {},
          output: "ok"
        })
      })

      const instance = await tool.init()
      const ctx: any = {}

      try {
        await instance.execute({ foo: 123 } as any, ctx)
        expect.unreachable()
      } catch (e: any) {
        expect(e.message).toContain("invalid arguments")
      }
    })

    it("handles validation errors with custom formatter", async () => {
      const tool = Tool.define("test-tool", {
        description: "A test tool",
        parameters: z.object({ foo: z.string() }),
        execute: async () => ({ title: "", metadata: {}, output: "" }),
        formatValidationError: (err) => `Custom error: ${String(err.issues[0].path[0])}`
      })

      const instance = await tool.init()
      try {
        await instance.execute({ foo: 123 } as any, {} as any)
        expect.unreachable()
      } catch (e: any) {
        expect(e.message).toBe("Custom error: foo")
      }
    })

    it("skips truncation if already marked as truncated", async () => {
      const tool = Tool.define("test-tool", {
        description: "A test tool",
        parameters: z.object({}),
        execute: async () => ({
          title: "Result",
          metadata: { truncated: false },
          output: "already processed"
        })
      })

      const instance = await tool.init()
      const result = await instance.execute({}, {} as any)
      expect(result.output).toBe("already processed")
      expect(result.metadata.truncated).toBe(false)
    })

    it("accepts an init function", async () => {
      const initFn = mock().mockResolvedValue({
        description: "Dynamic tool",
        parameters: z.object({}),
        execute: async () => ({ title: "ok", metadata: {}, output: "val" })
      })

      const tool = Tool.define("dynamic", initFn)
      const instance = await tool.init({ agent: { id: "agent1" } as any })
      
      expect(initFn).toHaveBeenCalledWith({ agent: { id: "agent1" } as any })
      expect(instance.description).toBe("Dynamic tool")
    })
  })
})
