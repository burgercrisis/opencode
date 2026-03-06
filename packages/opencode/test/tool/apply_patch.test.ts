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

import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"
import * as fs from "fs/promises"
import path from "path"

describe("ApplyPatchTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      ask: vi.fn(async () => true),
      sessionID: "test-session",
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws error if patchText is missing", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ApplyPatchTool.init()
        expect(tool.execute({ patchText: "" } as any, ctx)).rejects.toThrow("patchText is required")
      }
    })
  })

  it("throws error if patch parsing fails", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ApplyPatchTool.init()
        // Invalid patch format
        expect(tool.execute({ patchText: "not a valid patch" }, ctx)).rejects.toThrow()
      }
    })
  })

  it("handles 'add' hunk - creates new file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Add File content lines must start with +
        const patchText = `*** Begin Patch
*** Add File: new.txt
+new content
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("Success. Updated the following files")
        expect(result.output).toContain("A new.txt")

        const newFile = path.join(tmp.path, "new.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        expect(await Bun.file(newFile).text()).toBe("new content\n")
      }
    })
  })

  it("handles 'delete' hunk - removes existing file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "old.txt")
        await fs.writeFile(file, "old content")
        FileTime.read(ctx.sessionID, file) // Mark file as read before deletion

        const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("D old.txt")
        expect(await Bun.file(file).exists()).toBe(false)
      }
    })
  })

  it("handles file update with real patch", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "original content\n")
        FileTime.read(ctx.sessionID, file) // Mark file as read before update

        // Update uses @@ context markers with - and + prefixes
        const patchText = `*** Begin Patch
*** Update File: file.txt
@@
-original content
+modified content
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("M file.txt")
        expect(await Bun.file(file).text()).toBe("modified content\n")
      }
    })
  })

  it("handles multiple hunks in single patch", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file1 = path.join(tmp.path, "file1.txt")
        const file2 = path.join(tmp.path, "file2.txt")
        await fs.writeFile(file1, "content1\n")
        await fs.writeFile(file2, "content2\n")
        FileTime.read(ctx.sessionID, file1)
        FileTime.read(ctx.sessionID, file2)

        const patchText = `*** Begin Patch
*** Update File: file1.txt
@@
-content1
+updated1
*** Update File: file2.txt
@@
-content2
+updated2
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("M file1.txt")
        expect(result.output).toContain("M file2.txt")
        expect(await Bun.file(file1).text()).toBe("updated1\n")
        expect(await Bun.file(file2).text()).toBe("updated2\n")
      }
    })
  })

  it("handles adding file in subdirectory", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: src/components/Button.tsx
+export function Button() {
+  return <button>Click</button>
+}
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        // Windows uses backslashes
        expect(result.output).toContain("Button.tsx")
        const newFile = path.join(tmp.path, "src", "components", "Button.tsx")
        expect(await Bun.file(newFile).exists()).toBe(true)
        expect(await Bun.file(newFile).text()).toContain("export function Button")
      }
    })
  })

  it("validates file must be read before modification", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "original content\n")
        // Don't call FileTime.read - should fail

        const patchText = `*** Begin Patch
*** Update File: file.txt
@@
-original content
+modified content
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        // Should throw because file wasn't read first
        expect(tool.execute({ patchText }, ctx)).rejects.toThrow()
      }
    })
  })

  it("handles multiline content in add file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: multi.txt
+line 1
+line 2
+line 3
*** End Patch`
        
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("A multi.txt")
        const newFile = path.join(tmp.path, "multi.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        const content = await Bun.file(newFile).text()
        expect(content).toContain("line 1")
        expect(content).toContain("line 2")
        expect(content).toContain("line 3")
      }
    })
  })
})
