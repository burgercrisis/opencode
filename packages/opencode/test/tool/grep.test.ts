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

// COMPREHENSIVE TEST-LEVEL INSTANCE PROTECTION
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
    console.log("[test-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[test-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[test-protection] Using current Instance")
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

import { describe, expect, test, mock, vi, afterEach, beforeEach } from "bun:test"
import { GrepTool } from "../../src/tool/grep"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as fs from "fs/promises"
import * as path from "path"

describe("GrepTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn(),
  }

  bulletproofTest("greps files and sorts by modification time", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file1 = path.join(tmp.path, "file1.txt")
        const file2 = path.join(tmp.path, "file2.txt")
        
        // Create files with actual content
        await fs.writeFile(file1, "target match 1")
        await new Promise(r => setTimeout(r, 100))
        await fs.writeFile(file2, "target match 2")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "target" }, ctx)

        expect(result.output).toContain("Found 2 matches")
        // file2 was modified last, should appear first
        const lines = result.output.split("\n")
        const file2Index = lines.findIndex(l => l.includes("file2.txt"))
        const file1Index = lines.findIndex(l => l.includes("file1.txt"))
        expect(file2Index).toBeLessThan(file1Index)
      },
    })
  })

  bulletproofTest("handles empty results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a file without the search pattern
        await fs.writeFile(path.join(tmp.path, "file.txt"), "no match here")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No files found")
        expect(result.metadata.matches).toBe(0)
      },
    })
  })

  bulletproofTest("handles long lines in results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "long.txt")
        const longLine = "a".repeat(3000)
        await fs.writeFile(file, longLine)

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "a" }, ctx)

        expect(result.output).toContain("a".repeat(2000) + "...")
        expect(result.output).not.toContain("a".repeat(2001))
      },
    })
  })

  bulletproofTest("passes include pattern to ripgrep", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create files with different extensions
        await fs.writeFile(path.join(tmp.path, "file.ts"), "foo content")
        await fs.writeFile(path.join(tmp.path, "file.js"), "foo content")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo", include: "*.ts" }, ctx)

        // Should only find the .ts file
        expect(result.output).toContain("file.ts")
        expect(result.output).not.toContain("file.js")
      },
    })
  })

  bulletproofTest("handles no matches", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "some content")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No files found")
      },
    })
  })

  bulletproofTest("searches with regex pattern", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "foo123 bar456 baz")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo\\d+" }, ctx)

        expect(result.output).toContain("Found 1 matches")
        expect(result.output).toContain("foo123")
      },
    })
  })

  bulletproofTest("finds multiple matches in same file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "foo line1\nbar line2\nfoo line3")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo" }, ctx)

        expect(result.output).toContain("Found 2 matches")
        expect(result.output).toContain("foo line1")
        expect(result.output).toContain("foo line3")
      },
    })
  })

  bulletproofTest("truncates long lines", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "long.txt")
        const longLine = "A".repeat(3000)
        await fs.writeFile(file, longLine)

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "A" }, ctx)

        expect(result.output).toContain("A".repeat(2000) + "...")
      },
    })
  })
})
