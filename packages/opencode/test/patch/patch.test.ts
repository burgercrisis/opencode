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

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Patch } from "../../src/patch"
import * as fs from "fs/promises"
import * as path from "path"
import { tmpdir } from "os"

describe("Patch namespace", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "patch-test-"))
  })

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe("parsePatch", () => {
    bulletproofTest("should parse simple add file patch", async () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "add",
        path: "test.txt",
        contents: "Hello World",
      })
    })

    bulletproofTest("should parse delete file patch", async () => {
      const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      const hunk = result.hunks[0]
      expect(hunk.type).toBe("delete")
      expect(hunk.path).toBe("old.txt")
    })

    bulletproofTest("should parse patch with multiple hunks", async () => {
      const patchText = `*** Begin Patch
*** Add File: new.txt
+This is a new file
*** Update File: existing.txt
@@
 old line
-new line
+updated line
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(2)
      expect(result.hunks[0].type).toBe("add")
      expect(result.hunks[1].type).toBe("update")
    })

    bulletproofTest("should parse file move operation", async () => {
      const patchText = `*** Begin Patch
*** Update File: old-name.txt
*** Move to: new-name.txt
@@
-Old content
+New content
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      const hunk = result.hunks[0]
      expect(hunk.type).toBe("update")
      expect(hunk.path).toBe("old-name.txt")
      if (hunk.type === "update") {
        expect(hunk.move_path).toBe("new-name.txt")
      }
    })

    bulletproofTest("should throw error for invalid patch format", async () => {
      const invalidPatch = `This is not a valid patch`

      expect(() => Patch.parsePatch(invalidPatch)).toThrow("Invalid patch format")
    })
  })

  describe("maybeParseApplyPatch", () => {
    bulletproofTest("should parse direct apply_patch command", async () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch`

      const result = Patch.maybeParseApplyPatch(["apply_patch", patchText])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
      if (result.type === Patch.MaybeApplyPatch.Body) {
        expect(result.args.patch).toBe(patchText)
        expect(result.args.hunks).toHaveLength(1)
      }
    })

    bulletproofTest("should parse applypatch command", async () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch`

      const result = Patch.maybeParseApplyPatch(["applypatch", patchText])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
    })

    bulletproofTest("should handle bash heredoc format", async () => {
      const script = `apply_patch <<'PATCH'
*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch
PATCH`

      const result = Patch.maybeParseApplyPatch(["bash", "-lc", script])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
      if (result.type === Patch.MaybeApplyPatch.Body) {
        expect(result.args.hunks).toHaveLength(1)
      }
    })

    bulletproofTest("should return NotApplyPatch for non-patch commands", async () => {
      const result = Patch.maybeParseApplyPatch(["echo", "hello"])
      expect(result.type).toBe(Patch.MaybeApplyPatch.NotApplyPatch)
    })
  })

  describe("applyPatch", () => {
    bulletproofTest("should add a new file", async () => {
      const patchText = `*** Begin Patch
*** Add File: ${tempDir}/new-file.txt
+Hello World
+This is a new file
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.added).toHaveLength(1)
      expect(result.modified).toHaveLength(0)
      expect(result.deleted).toHaveLength(0)

      const content = await fs.readFile(result.added[0], "utf-8")
      expect(content).toBe("Hello World\nThis is a new file")
    })

    bulletproofTest("should delete an existing file", async () => {
      const filePath = path.join(tempDir, "to-delete.txt")
      await fs.writeFile(filePath, "This file will be deleted")

      const patchText = `*** Begin Patch
*** Delete File: ${filePath}
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.deleted).toHaveLength(1)
      expect(result.deleted[0]).toBe(filePath)

      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    })

    bulletproofTest("should update an existing file", async () => {
      const filePath = path.join(tempDir, "to-update.txt")
      await fs.writeFile(filePath, "line 1\nline 2\nline 3\n")

      const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
 line 1
-line 2
+line 2 updated
 line 3
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.modified).toHaveLength(1)
      expect(result.modified[0]).toBe(filePath)

      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("line 1\nline 2 updated\nline 3\n")
    })

    bulletproofTest("should move and update a file", async () => {
      const oldPath = path.join(tempDir, "old-name.txt")
      const newPath = path.join(tempDir, "new-name.txt")
      await fs.writeFile(oldPath, "old content\n")

      const patchText = `*** Begin Patch
*** Update File: ${oldPath}
*** Move to: ${newPath}
@@
-old content
+new content
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.modified).toHaveLength(1)
      expect(result.modified[0]).toBe(newPath)

      const oldExists = await fs
        .access(oldPath)
        .then(() => true)
        .catch(() => false)
      expect(oldExists).toBe(false)

      const newContent = await fs.readFile(newPath, "utf-8")
      expect(newContent).toBe("new content\n")
    })

    bulletproofTest("should handle multiple operations in one patch", async () => {
      const file1 = path.join(tempDir, "file1.txt")
      const file2 = path.join(tempDir, "file2.txt")
      const file3 = path.join(tempDir, "file3.txt")

      await fs.writeFile(file1, "content 1")
      await fs.writeFile(file2, "content 2")

      const patchText = `*** Begin Patch
*** Add File: ${file3}
+new file content
*** Update File: ${file1}
@@
-content 1
+updated content 1
*** Delete File: ${file2}
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.added).toHaveLength(1)
      expect(result.modified).toHaveLength(1)
      expect(result.deleted).toHaveLength(1)
    })

    bulletproofTest("should create parent directories when adding files", async () => {
      const nestedPath = path.join(tempDir, "deep", "nested", "file.txt")

      const patchText = `*** Begin Patch
*** Add File: ${nestedPath}
+Deep nested content
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.added).toHaveLength(1)
      expect(result.added[0]).toBe(nestedPath)

      const exists = await fs
        .access(nestedPath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    })
  })

  describe("error handling", () => {
    bulletproofTest("should throw error when updating non-existent file", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist.txt")

      const patchText = `*** Begin Patch
*** Update File: ${nonExistent}
@@
-old line
+new line
*** End Patch`

      await expect(Patch.applyPatch(patchText)).rejects.toThrow()
    })

    bulletproofTest("should throw error when deleting non-existent file", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist.txt")

      const patchText = `*** Begin Patch
*** Delete File: ${nonExistent}
*** End Patch`

      await expect(Patch.applyPatch(patchText)).rejects.toThrow()
    })
  })

  describe("edge cases", () => {
    bulletproofTest("should handle empty files", async () => {
      const emptyFile = path.join(tempDir, "empty.txt")
      await fs.writeFile(emptyFile, "")

      const patchText = `*** Begin Patch
*** Update File: ${emptyFile}
@@
+First line
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.modified).toHaveLength(1)

      const content = await fs.readFile(emptyFile, "utf-8")
      expect(content).toBe("First line\n")
    })

    bulletproofTest("should handle files with no trailing newline", async () => {
      const filePath = path.join(tempDir, "no-newline.txt")
      await fs.writeFile(filePath, "no newline")

      const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
-no newline
+has newline now
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.modified).toHaveLength(1)

      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("has newline now\n")
    })

    bulletproofTest("should handle multiple update chunks in single file", async () => {
      const filePath = path.join(tempDir, "multi-chunk.txt")
      await fs.writeFile(filePath, "line 1\nline 2\nline 3\nline 4\n")

      const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
 line 1
-line 2
+LINE 2
@@
 line 3
-line 4
+LINE 4
*** End Patch`

      const result = await Patch.applyPatch(patchText)
      expect(result.modified).toHaveLength(1)

      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("line 1\nLINE 2\nline 3\nLINE 4\n")
    })
  })
})
