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

import { describe, expect, test, afterEach, beforeEach } from "bun:test"
import { ListTool } from "../../src/tool/ls"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

describe("ListTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    log: () => {},
  }

  test("lists files in a directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "dir1", "file2.txt"), "content2")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({ path: tmp.path }, ctx)

        expect(result.output).toContain("file1.txt")
        expect(result.output).toContain("dir1/")
        expect(result.output).toContain("file2.txt")
      },
    })
  })

  test("applies custom ignore patterns", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content")
        await Bun.write(path.join(dir, "file2.log"), "log content")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({ ignore: ["*.log"] }, ctx)

        expect(result.output).toContain("file1.txt")
        expect(result.output).not.toContain("file2.log")
      },
    })
  })

  test("limits the number of files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        for (let i = 0; i < 150; i++) {
          await Bun.write(path.join(dir, `file${i}.txt`), `content${i}`)
        }
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        const lines = result.output.split("\n").filter(l => l.trim().startsWith("file"))
        expect(lines.length).toBe(100)
      },
    })
  })

  test("handles empty file list", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({ path: tmp.path }, ctx)

        expect(result.output).toBe("")
      },
    })
  })

  test("handles deep directory structure", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const deepPath = path.join(dir, "level1", "level2", "level3")
        await Bun.write(path.join(deepPath, "file.txt"), "deep content")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        expect(result.output).toContain("level1/")
        expect(result.output).toContain("  level2/")
        expect(result.output).toContain("    level3/")
        expect(result.output).toContain("      file.txt")
      },
    })
  })
})
