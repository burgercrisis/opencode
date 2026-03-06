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

import { expect, it, describe, mock, vi, beforeEach, afterEach } from "bun:test"
import { LspTool } from "../../src/tool/lsp"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("LspTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: mock(async () => {}),
  }

  it("throws error if file not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await LspTool.init()
        const params = {
          operation: "hover",
          filePath: "non-existent.ts",
          line: 1,
          character: 1,
        }

        expect(tool.execute(params as any, ctx)).rejects.toThrow("File not found")
      },
    })
  })

  it("initializes tool successfully", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await LspTool.init()
        expect(tool).toBeDefined()
        expect(tool.description).toBeDefined()
      },
    })
  })

  it("validates file path parameter", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await LspTool.init()
        
        // Missing filePath should fail validation
        const params = {
          operation: "hover",
          line: 1,
          character: 1,
        }

        expect(tool.execute(params as any, ctx)).rejects.toThrow()
      },
    })
  })

  it("validates operation parameter", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")

        const tool = await LspTool.init()
        
        // Invalid operation should fail
        const params = {
          operation: "invalidOperation",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }

        expect(tool.execute(params as any, ctx)).rejects.toThrow()
      },
    })
  })

  it("handles relative file paths with TypeScript LSP", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a file in a subdirectory
        const subDir = path.join(tmp.path, "src")
        await Bun.write(path.join(subDir, "test.ts"), "const x = 1;")
        
        const tool = await LspTool.init()
        
        // Test with relative path - TypeScript LSP should be available
        const params = {
          operation: "hover",
          filePath: "src/test.ts",
          line: 1,
          character: 1,
        }

        // Should succeed with TypeScript LSP
        const result = await tool.execute(params as any, ctx)
        expect(result).toBeDefined()
      },
    })
  })

  it("handles absolute file paths with TypeScript LSP", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")
        
        const tool = await LspTool.init()
        
        // Test with absolute path
        const params = {
          operation: "hover",
          filePath: filePath,
          line: 1,
          character: 1,
        }

        // Should succeed with TypeScript LSP
        const result = await tool.execute(params as any, ctx)
        expect(result).toBeDefined()
      },
    })
  })

  it("performs hover operation on TypeScript file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const myVariable = 42;")
        
        const tool = await LspTool.init()
        const params = {
          operation: "hover",
          filePath: "test.ts",
          line: 1,
          character: 7, // Position on "myVariable"
        }

        const result = await tool.execute(params as any, ctx)
        expect(result).toBeDefined()
        // Hover might return type information or "No results found"
        expect(result.output).toBeDefined()
      },
    })
  })

  it("performs documentSymbol operation on TypeScript file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "function foo() {}\nconst bar = 1;")
        
        const tool = await LspTool.init()
        const params = {
          operation: "documentSymbol",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }

        const result = await tool.execute(params as any, ctx)
        expect(result).toBeDefined()
        // Document symbols should find the function and variable
        expect(result.output).toBeDefined()
      },
    })
  })
})
