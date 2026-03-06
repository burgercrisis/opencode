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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "fs/promises"
import * as path from "path"
import * as Patch from "../index"

describe("Patch Module", () => {
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
  const testDir = path.join(process.cwd(), "test-patch-temp")

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe("parsePatchHeader", () => {
    it("should parse add file header", () => {
      const lines = ["*** Add File: test.txt"]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toEqual({
        filePath: "test.txt",
        nextIdx: 1
      })
    })

    it("should parse delete file header", () => {
      const lines = ["*** Delete File: test.txt"]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toEqual({
        filePath: "test.txt",
        nextIdx: 1
      })
    })

    it("should parse update file header without move", () => {
      const lines = ["*** Update File: test.txt"]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toEqual({
        filePath: "test.txt",
        nextIdx: 1
      })
    })

    it("should parse update file header with move", () => {
      const lines = [
        "*** Update File: test.txt",
        "*** Move to: new.txt"
      ]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toEqual({
        filePath: "test.txt",
        movePath: "new.txt",
        nextIdx: 2
      })
    })

    it("should return null for unknown header", () => {
      const lines = ["*** Unknown: test.txt"]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toBeNull()
    })

    it("should return null for empty file path", () => {
      const lines = ["*** Add File: "]
      const result = (Patch as any).parsePatchHeader(lines, 0)
      expect(result).toBeNull()
    })
  })

  describe("parseUpdateFileChunks", () => {
    it("should parse simple update chunk", () => {
      const lines = [
        "@@ -1,2 +1,2 @@",
        " old line",
        "+new line",
        " unchanged line"
      ]
      const result = (Patch as any).parseUpdateFileChunks(lines, 0)
      expect(result.chunks).toHaveLength(1)
      expect(result.chunks[0]).toEqual({
        old_lines: [" old line"],
        new_lines: ["new line"],
        change_context: "-1,2 +1,2 @@",
        is_end_of_file: undefined
      })
    })

    it("should handle end of file marker", () => {
      const lines = [
        "@@ -1,1 +1,1 @@",
        "+new line",
        "*** End of File"
      ]
      const result = (Patch as any).parseUpdateFileChunks(lines, 0)
      expect(result.chunks[0].is_end_of_file).toBe(true)
    })

    it("should parse multiple chunks", () => {
      const lines = [
        "@@ -1,1 +1,1 @@",
        "+first",
        "@@ -3,1 +3,1 @@",
        "+second"
      ]
      const result = (Patch as any).parseUpdateFileChunks(lines, 0)
      expect(result.chunks).toHaveLength(2)
    })

    it("should stop at next header", () => {
      const lines = [
        "@@ -1,1 +1,1 @@",
        "+content",
        "*** Add File: other.txt"
      ]
      const result = (Patch as any).parseUpdateFileChunks(lines, 0)
      expect(result.nextIdx).toBe(2)
    })
  })

  describe("parseAddFileContent", () => {
    it("should parse add file content", () => {
      const lines = [
        "+line 1",
        "+line 2",
        "+line 3"
      ]
      const result = (Patch as any).parseAddFileContent(lines, 0)
      expect(result.content).toBe("line 1\nline 2\nline 3")
      expect(result.nextIdx).toBe(3)
    })

    it("should handle empty content", () => {
      const lines = ["*** Add File: empty.txt"]
      const result = (Patch as any).parseAddFileContent(lines, 0)
      expect(result.content).toBe("")
    })

    it("should stop at next header", () => {
      const lines = [
        "+content",
        "*** Delete File: other.txt"
      ]
      const result = (Patch as any).parseAddFileContent(lines, 0)
      expect(result.nextIdx).toBe(1)
    })
  })

  describe("parsePatch", () => {
    it("should parse complete patch with add file", () => {
      const patchText = `*** Begin Patch
*** Add File: new.txt
+Hello world
+This is a test
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "add",
        path: "new.txt",
        contents: "Hello world\nThis is a test"
      })
    })

    it("should parse patch with delete file", () => {
      const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "delete",
        path: "old.txt"
      })
    })

    it("should parse patch with update file", () => {
      const patchText = `*** Begin Patch
*** Update File: test.txt
@@ -1,2 +1,2 @@
 old line
+new line
 unchanged line
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "update",
        path: "test.txt",
        chunks: [{
          old_lines: [" old line"],
          new_lines: ["new line"],
          change_context: "-1,2 +1,2 @@",
          is_end_of_file: undefined
        }]
      })
    })

    it("should parse patch with move operation", () => {
      const patchText = `*** Begin Patch
*** Update File: old.txt
*** Move to: new.txt
@@ -1,1 +1,1 @@
 old content
+new content
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks[0]).toEqual({
        type: "update",
        path: "old.txt",
        move_path: "new.txt",
        chunks: [{
          old_lines: [" old content"],
          new_lines: ["new content"],
          change_context: "-1,1 +1,1 @@",
          is_end_of_file: undefined
        }]
      })
    })

    it("should parse complex patch with multiple operations", () => {
      const patchText = `*** Begin Patch
*** Add File: a.txt
+content a
*** Update File: b.txt
@@ -1,1 +1,1 @@
-old b
+new b
*** Delete File: c.txt
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(3)
      expect(result.hunks[0].type).toBe("add")
      expect(result.hunks[1].type).toBe("update")
      expect(result.hunks[2].type).toBe("delete")
    })

    it("should throw error for missing begin marker", () => {
      const patchText = `*** Add File: test.txt
+content
*** End Patch`

      expect(() => Patch.parsePatch(patchText)).toThrow("Invalid patch format: missing Begin/End markers")
    })

    it("should throw error for missing end marker", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+content`

      expect(() => Patch.parsePatch(patchText)).toThrow("Invalid patch format: missing Begin/End markers")
    })

    it("should throw error for invalid marker order", () => {
      const patchText = `*** End Patch
*** Begin Patch
*** Add File: test.txt
+content`

      expect(() => Patch.parsePatch(patchText)).toThrow("Invalid patch format: missing Begin/End markers")
    })
  })

  describe("safeParsePatch", () => {
    it("should return success for valid patch", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+content
*** End Patch`

      const result = Patch.safeParsePatch(patchText)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.hunks).toHaveLength(1)
      }
    })

    it("should return error for invalid patch", () => {
      const patchText = "invalid patch"

      const result = Patch.safeParsePatch(patchText)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
      }
    })
  })

  describe("maybeParseApplyPatch", () => {
    it("should parse direct apply_patch command", () => {
      const argv = ["apply_patch", `*** Begin Patch
*** Add File: test.txt
+content
*** End Patch`]

      const result = Patch.maybeParseApplyPatch(argv)
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
      if (result.type === Patch.MaybeApplyPatch.Body) {
        expect(result.args.hunks).toHaveLength(1)
        expect(result.args.patch).toContain("content")
      }
    })

    it("should parse applypatch command", () => {
      const argv = ["applypatch", `*** Begin Patch
*** Add File: test.txt
+content
*** End Patch`]

      const result = Patch.maybeParseApplyPatch(argv)
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
    })

    it("should handle bash heredoc form", () => {
      const argv = [
        "bash",
        "-lc",
        `apply_patch <<'EOF'
*** Begin Patch
*** Add File: test.txt
+content
*** End Patch
EOF`
      ]

      const result = Patch.maybeParseApplyPatch(argv)
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
    })

    it("should return parse error for invalid patch", () => {
      const argv = ["apply_patch", "invalid patch"]

      const result = Patch.maybeParseApplyPatch(argv)
      expect(result.type).toBe(Patch.MaybeApplyPatch.PatchParseError)
    })

    it("should return not apply patch for non-patch commands", () => {
      const argv = ["echo", "hello"]

      const result = Patch.maybeParseApplyPatch(argv)
      expect(result.type).toBe(Patch.MaybeApplyPatch.NotApplyPatch)
    })
  })

  describe("deriveNewContentsFromChunks", () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(testDir, "test.txt"), "line 1\nline 2\nline 3\nline 4\nline 5", "utf-8")
    })

    it("should apply simple replacement", async () => {
      const chunks = [{
        old_lines: ["line 2"],
        new_lines: ["modified line 2"],
        change_context: "-2,1 +2,1 @@"
      }]

      const result = await Patch.deriveNewContentsFromChunks(
        path.join(testDir, "test.txt"),
        chunks
      )

      expect(result.content).toContain("modified line 2")
      expect(result.unified_diff).toContain("-line 2")
      expect(result.unified_diff).toContain("+modified line 2")
    })

    it("should handle pure addition", async () => {
      const chunks = [{
        old_lines: [],
        new_lines: ["new line"],
        change_context: "-0,0 +1,1 @@"
      }]

      const result = await Patch.deriveNewContentsFromChunks(
        path.join(testDir, "test.txt"),
        chunks
      )

      expect(result.content).toContain("new line")
    })

    it("should use provided existing content", async () => {
      const chunks = [{
        old_lines: ["old content"],
        new_lines: ["new content"],
        change_context: "-1,1 +1,1 @@"
      }]

      const result = await Patch.deriveNewContentsFromChunks(
        "nonexistent.txt",
        chunks,
        "old content"
      )

      expect(result.content).toBe("new content")
    })

    it("should throw error for file read failure", async () => {
      const chunks = [{
        old_lines: ["content"],
        new_lines: ["new"],
        change_context: "-1,1 +1,1 @@"
      }]

      await expect(Patch.deriveNewContentsFromChunks(
        "nonexistent.txt",
        chunks
      )).rejects.toThrow("Failed to read file")
    })

    it("should throw error for context not found", async () => {
      const chunks = [{
        old_lines: ["nonexistent line"],
        new_lines: ["new line"],
        change_context: "-1,1 +1,1 @@"
      }]

      await expect(Patch.deriveNewContentsFromChunks(
        path.join(testDir, "test.txt"),
        chunks
      )).rejects.toThrow("Failed to find context")
    })
  })

  describe("applyHunksToFiles", () => {
    it("should apply add file hunk", async () => {
      const hunks = [{
        type: "add" as const,
        path: path.join(testDir, "new.txt"),
        contents: "test content"
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.added).toContain(path.join(testDir, "new.txt"))
      const content = await fs.readFile(path.join(testDir, "new.txt"), "utf-8")
      expect(content).toBe("test content")
    })

    it("should apply delete file hunk", async () => {
      const testFile = path.join(testDir, "delete.txt")
      await fs.writeFile(testFile, "content", "utf-8")

      const hunks = [{
        type: "delete" as const,
        path: testFile
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.deleted).toContain(testFile)
      await expect(fs.access(testFile)).rejects.toThrow()
    })

    it("should apply update file hunk", async () => {
      const testFile = path.join(testDir, "update.txt")
      await fs.writeFile(testFile, "old content", "utf-8")

      const hunks = [{
        type: "update" as const,
        path: testFile,
        chunks: [{
          old_lines: ["old content"],
          new_lines: ["new content"],
          change_context: "-1,1 +1,1 @@"
        }]
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.modified).toContain(testFile)
      const content = await fs.readFile(testFile, "utf-8")
      expect(content).toBe("new content")
    })

    it("should apply move operation", async () => {
      const oldFile = path.join(testDir, "old.txt")
      const newFile = path.join(testDir, "new.txt")
      await fs.writeFile(oldFile, "content", "utf-8")

      const hunks = [{
        type: "update" as const,
        path: oldFile,
        move_path: newFile,
        chunks: [{
          old_lines: ["content"],
          new_lines: ["modified content"],
          change_context: "-1,1 +1,1 @@"
        }]
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.modified).toContain(newFile)
      await expect(fs.access(oldFile)).rejects.toThrow()
      const content = await fs.readFile(newFile, "utf-8")
      expect(content).toBe("modified content")
    })

    it("should create nested directories", async () => {
      const nestedFile = path.join(testDir, "nested", "deep", "file.txt")
      const hunks = [{
        type: "add" as const,
        path: nestedFile,
        contents: "nested content"
      }]

      await Patch.applyHunksToFiles(hunks)

      const content = await fs.readFile(nestedFile, "utf-8")
      expect(content).toBe("nested content")
    })

    it("should throw error for empty hunks", async () => {
      await expect(Patch.applyHunksToFiles([])).rejects.toThrow("No files were modified")
    })
  })

  describe("applyPatch", () => {
    it("should apply complete patch", async () => {
      const patchText = `*** Begin Patch
*** Add File: complete.txt
+complete content
*** End Patch`

      const result = await Patch.applyPatch(patchText)

      expect(result.added).toHaveLength(1)
      expect(result.added[0]).toContain("complete.txt")
    })
  })

  describe("maybeParseApplyPatchVerified", () => {
    it("should detect implicit patch invocation", async () => {
      const argv = [`*** Begin Patch
*** Add File: test.txt
+content
*** End Patch`]

      const result = await Patch.maybeParseApplyPatchVerified(argv, testDir)

      expect(result.type).toBe(Patch.MaybeApplyPatchVerified.CorrectnessError)
      if (result.type === Patch.MaybeApplyPatchVerified.CorrectnessError) {
        expect(result.error.message).toContain(Patch.ApplyPatchError.ImplicitInvocation)
      }
    })

    it("should handle valid apply patch command", async () => {
      const argv = ["apply_patch", `*** Begin Patch
*** Add File: test.txt
+content
*** End Patch`]

      const result = await Patch.maybeParseApplyPatchVerified(argv, testDir)

      expect(result.type).toBe(Patch.MaybeApplyPatchVerified.Body)
      if (result.type === Patch.MaybeApplyPatchVerified.Body) {
        expect(result.action.changes.size).toBe(1)
      }
    })

    it("should handle patch parse error", async () => {
      const argv = ["apply_patch", "invalid patch"]

      const result = await Patch.maybeParseApplyPatchVerified(argv, testDir)

      expect(result.type).toBe(Patch.MaybeApplyPatchVerified.CorrectnessError)
    })

    it("should return not apply patch for non-patch commands", async () => {
      const argv = ["echo", "hello"]

      const result = await Patch.maybeParseApplyPatchVerified(argv, testDir)

      expect(result.type).toBe(Patch.MaybeApplyPatchVerified.NotApplyPatch)
    })
  })

  describe("utility functions", () => {
    it("should normalize unicode quotes in applyHunksToFiles", async () => {
      const hunks = [{
        type: "add" as const,
        path: path.join(testDir, "unicode.txt"),
        contents: '"test" and \'test\' and test—dash'
      }]

      await Patch.applyHunksToFiles(hunks)

      const content = await fs.readFile(path.join(testDir, "unicode.txt"), "utf-8")
      expect(content).toBe('"test" and \'test\' and test—dash')
    })

    it("should handle unicode normalization in file operations", async () => {
      const testFile = path.join(testDir, "normalize.txt")
      await fs.writeFile(testFile, '"test" content\'', "utf-8")

      const hunks = [{
        type: "update" as const,
        path: testFile,
        chunks: [{
          old_lines: ['"test" content'],
          new_lines: ['"normalized" content'],
          change_context: "-1,1 +1,1 @@"
        }]
      }]

      await Patch.applyHunksToFiles(hunks)

      const content = await fs.readFile(testFile, "utf-8")
      expect(content).toBe('"normalized" content')
    })

    it("should generate unified diff with proper formatting", async () => {
      const testFile = path.join(testDir, "diff.txt")
      await fs.writeFile(testFile, "line1\nline2\nline3", "utf-8")

      const hunks = [{
        type: "update" as const,
        path: testFile,
        chunks: [{
          old_lines: ["line2"],
          new_lines: ["modified line2"],
          change_context: "-2,1 +2,1 @@"
        }]
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.modified).toContain(testFile)
      // The unified diff should be generated by deriveNewContentsFromChunks
      expect(result.modified).toHaveLength(1)
    })

    it("should handle empty content in diff generation", async () => {
      const testFile = path.join(testDir, "empty.txt")
      await fs.writeFile(testFile, "", "utf-8")

      const hunks = [{
        type: "update" as const,
        path: testFile,
        chunks: [{
          old_lines: [],
          new_lines: ["new content"],
          change_context: "-0,0 +1,1 @@"
        }]
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.modified).toContain(testFile)
    })

    it("should handle identical content scenarios", async () => {
      const testFile = path.join(testDir, "identical.txt")
      await fs.writeFile(testFile, "same content", "utf-8")

      const hunks = [{
        type: "update" as const,
        path: testFile,
        chunks: [{
          old_lines: ["same content"],
          new_lines: ["same content"],
          change_context: "-1,1 +1,1 @@"
        }]
      }]

      const result = await Patch.applyHunksToFiles(hunks)

      expect(result.modified).toContain(testFile)
    })
  })
})
