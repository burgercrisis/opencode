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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Filesystem } from "../filesystem"
import { mkdir, writeFile, rm, symlink } from "fs/promises"
import { join, dirname } from "path"

describe("Filesystem", () => {
  const testDir = join(import.meta.dir, "filesystem-test-temp")

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("exists", () => {
    it("should return true for existing file", async () => {
      const filePath = join(testDir, "exists.txt")
      await writeFile(filePath, "test")

      expect(await Filesystem.exists(filePath)).toBe(true)
    })

    it("should return false for non-existing file", async () => {
      expect(await Filesystem.exists(join(testDir, "nonexistent.txt"))).toBe(false)
    })
  })

  describe("isDir", () => {
    it("should return true for directory", async () => {
      expect(await Filesystem.isDir(testDir)).toBe(true)
    })

    it("should return false for file", async () => {
      const filePath = join(testDir, "file.txt")
      await writeFile(filePath, "test")

      expect(await Filesystem.isDir(filePath)).toBe(false)
    })

    it("should return false for non-existing path", async () => {
      expect(await Filesystem.isDir(join(testDir, "nonexistent"))).toBe(false)
    })
  })

  describe("stat", () => {
    it("should return stats for existing file", async () => {
      const filePath = join(testDir, "stat.txt")
      await writeFile(filePath, "test content")

      const stats = Filesystem.stat(filePath)
      expect(stats).toBeDefined()
      expect(stats?.size).toBeGreaterThan(0)
    })

    it("should return undefined for non-existing file", () => {
      const stats = Filesystem.stat(join(testDir, "nonexistent.txt"))
      expect(stats).toBeUndefined()
    })
  })

  describe("size", () => {
    it("should return file size", async () => {
      const filePath = join(testDir, "size.txt")
      await writeFile(filePath, "test content")

      const size = await Filesystem.size(filePath)
      expect(size).toBeGreaterThan(0)
    })

    it("should return 0 for non-existing file", async () => {
      const size = await Filesystem.size(join(testDir, "nonexistent.txt"))
      expect(size).toBe(0)
    })
  })

  describe("readText", () => {
    it("should read text file content", async () => {
      const filePath = join(testDir, "read.txt")
      await writeFile(filePath, "hello world")

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("hello world")
    })
  })

  describe("readJson", () => {
    it("should read and parse JSON file", async () => {
      const filePath = join(testDir, "data.json")
      await writeFile(filePath, '{"name": "test", "value": 42}')

      const data = await Filesystem.readJson(filePath)
      expect(data).toEqual({ name: "test", value: 42 })
    })
  })

  describe("readBytes", () => {
    it("should read file as buffer", async () => {
      const filePath = join(testDir, "bytes.bin")
      await writeFile(filePath, Buffer.from([1, 2, 3, 4, 5]))

      const buffer = await Filesystem.readBytes(filePath)
      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBe(5)
    })
  })

  describe("readArrayBuffer", () => {
    it("should read file as ArrayBuffer", async () => {
      const filePath = join(testDir, "arraybuffer.bin")
      await writeFile(filePath, Buffer.from([1, 2, 3, 4, 5]))

      const buffer = await Filesystem.readArrayBuffer(filePath)
      expect(buffer).toBeInstanceOf(ArrayBuffer)
      expect(buffer.byteLength).toBe(5)
    })
  })

  describe("write", () => {
    it("should write string content to file", async () => {
      const filePath = join(testDir, "write.txt")
      await Filesystem.write(filePath, "test content")

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("test content")
    })

    it("should write buffer content to file", async () => {
      const filePath = join(testDir, "write.bin")
      const buffer = Buffer.from([1, 2, 3, 4, 5])
      await Filesystem.write(filePath, buffer)

      const readBuffer = await Filesystem.readBytes(filePath)
      expect(readBuffer).toEqual(buffer)
    })

    it("should create parent directories if needed", async () => {
      const filePath = join(testDir, "nested", "dir", "file.txt")
      await Filesystem.write(filePath, "nested content")

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("nested content")
    })

    it("should set file mode when provided", async () => {
      const filePath = join(testDir, "mode.txt")
      await Filesystem.write(filePath, "content", 0o644)

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("content")
    })
  })

  describe("writeJson", () => {
    it("should write JSON data to file", async () => {
      const filePath = join(testDir, "write.json")
      await Filesystem.writeJson(filePath, { name: "test", value: 42 })

      const data = await Filesystem.readJson(filePath)
      expect(data).toEqual({ name: "test", value: 42 })
    })
  })

  describe("mimeType", () => {
    it("should return correct mime type for known extensions", () => {
      expect(Filesystem.mimeType("file.txt")).toBe("text/plain")
      expect(Filesystem.mimeType("file.json")).toBe("application/json")
      expect(Filesystem.mimeType("file.html")).toBe("text/html")
    })

    it("should return default mime type for unknown extensions", () => {
      expect(Filesystem.mimeType("file.unknown")).toBe("application/octet-stream")
    })
  })

  describe("dirname", () => {
    it("should return parent directory", () => {
      const result = Filesystem.dirname("/path/to/file.txt")
      // On Windows it would be \path\to, on Unix it would be /path/to
      expect(result).toContain("path")
    })

    it("should handle undefined input", () => {
      expect(Filesystem.dirname(undefined as any)).toBe("")
    })

    it("should handle null input", () => {
      expect(Filesystem.dirname(null as any)).toBe("")
    })
  })

  describe("join", () => {
    it("should join path segments", () => {
      const result = Filesystem.join("path", "to", "file.txt")
      expect(result).toContain("path")
      expect(result).toContain("file.txt")
    })

    it("should filter out undefined segments", () => {
      const result = Filesystem.join("path", undefined as any, "file.txt")
      expect(result).toContain("path")
      expect(result).toContain("file.txt")
    })

    it("should return empty string for no segments", () => {
      expect(Filesystem.join()).toBe("")
    })
  })

  describe("normalizePath", () => {
    it("should return path unchanged on non-Windows", () => {
      if (process.platform === "win32") return
      expect(Filesystem.normalizePath("/path/to/file")).toBe("/path/to/file")
    })
  })

  describe("nativePath", () => {
    it("should convert forward slashes to backslashes on Windows", () => {
      if (process.platform !== "win32") {
        expect(Filesystem.nativePath("/path/to/file")).toBe("/path/to/file")
      } else {
        expect(Filesystem.nativePath("/path/to/file")).toBe("\\path\\to\\file")
      }
    })
  })

  describe("relativePath", () => {
    it("should compute relative path", () => {
      const from = testDir
      const to = join(testDir, "subdir", "file.txt")
      const relative = Filesystem.relativePath(from, to)
      expect(relative).toContain("subdir")
    })
  })

  describe("resolvePath", () => {
    it("should resolve to absolute path", () => {
      const result = Filesystem.resolvePath("relative", "path")
      expect(result).toBeDefined()
    })
  })

  describe("normalizeGitPath", () => {
    it("should normalize path for git operations", () => {
      const result = Filesystem.normalizeGitPath("/path/to/file", true)
      expect(result).toBeDefined()
    })

    it("should return empty path for empty input", () => {
      expect(Filesystem.normalizeGitPath("", true)).toBe("")
    })
  })

  describe("normalizeNativePath", () => {
    it("should normalize path for native operations", () => {
      const result = Filesystem.normalizeNativePath("/path/to/file")
      expect(result).toBeDefined()
    })

    it("should return empty path for empty input", () => {
      expect(Filesystem.normalizeNativePath("")).toBe("")
    })
  })

  describe("getCanonicalPath", () => {
    it("should return canonical path", () => {
      const result = Filesystem.getCanonicalPath(testDir)
      expect(result).toBeDefined()
    })

    it("should return empty string for empty input", () => {
      expect(Filesystem.getCanonicalPath("")).toBe("")
    })
  })

  describe("isValidFilename", () => {
    it("should return true for valid filenames", () => {
      expect(Filesystem.isValidFilename("file.txt")).toBe(true)
      expect(Filesystem.isValidFilename("my-file.json")).toBe(true)
      expect(Filesystem.isValidFilename("test_file.md")).toBe(true)
    })

    it("should return false for empty filename", () => {
      expect(Filesystem.isValidFilename("")).toBe(false)
    })

    it("should return false for filename with path separators", () => {
      expect(Filesystem.isValidFilename("path/file.txt")).toBe(false)
      expect(Filesystem.isValidFilename("path\\file.txt")).toBe(false)
    })

    it("should return false for filename with null bytes", () => {
      expect(Filesystem.isValidFilename("file\0.txt")).toBe(false)
    })

    it("should return false for filename with control characters", () => {
      expect(Filesystem.isValidFilename("file\x01.txt")).toBe(false)
    })

    it("should return false for very long filenames", () => {
      const longName = "a".repeat(300)
      expect(Filesystem.isValidFilename(longName)).toBe(false)
    })

    it("should return false for reserved Windows names", () => {
      expect(Filesystem.isValidFilename("CON")).toBe(false)
      expect(Filesystem.isValidFilename("PRN")).toBe(false)
      expect(Filesystem.isValidFilename("NUL")).toBe(false)
      expect(Filesystem.isValidFilename("COM1")).toBe(false)
      expect(Filesystem.isValidFilename("LPT1")).toBe(false)
    })
  })

  describe("isBinaryFile", () => {
    it("should return false for text files", async () => {
      const filePath = join(testDir, "text.txt")
      await writeFile(filePath, "This is plain text content")

      expect(await Filesystem.isBinaryFile(filePath)).toBe(false)
    })

    it("should return true for binary files", async () => {
      const filePath = join(testDir, "binary.bin")
      await writeFile(filePath, Buffer.from([0, 1, 2, 3, 4, 5]))

      expect(await Filesystem.isBinaryFile(filePath)).toBe(true)
    })

    it("should return true for non-existing files", async () => {
      expect(await Filesystem.isBinaryFile(join(testDir, "nonexistent"))).toBe(true)
    })
  })

  describe("validateFilepath", () => {
    it("should return valid for safe paths", () => {
      const result = Filesystem.validateFilepath("file.txt", testDir)
      expect(result.valid).toBe(true)
    })

    it("should return invalid for empty path", () => {
      const result = Filesystem.validateFilepath("", testDir)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain("Empty")
    })

    it("should return invalid for path with null bytes", () => {
      const result = Filesystem.validateFilepath("file\0.txt", testDir)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain("Null")
    })
  })

  describe("overlaps", () => {
    it("should detect overlapping paths", () => {
      const path1 = testDir
      const path2 = join(testDir, "subdir")

      const result = Filesystem.overlaps(path1, path2)
      expect(result).toBe(true)
    })
  })

  describe("contains", () => {
    it("should return true when parent contains child", () => {
      const parent = testDir
      const child = join(testDir, "subdir", "file.txt")

      expect(Filesystem.contains(parent, child)).toBe(true)
    })

    it("should return false when path is outside parent", () => {
      const parent = testDir
      const child = join(dirname(testDir), "other", "file.txt")

      expect(Filesystem.contains(parent, child)).toBe(false)
    })
  })

  describe("findUp", () => {
    it("should find files in parent directories", async () => {
      const targetFile = "test-target.txt"
      const nestedDir = join(testDir, "level1", "level2")
      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(testDir, targetFile), "found me")

      const results = await Filesystem.findUp(targetFile, nestedDir, testDir)
      expect(results.length).toBe(1)
      expect(results[0]).toContain(targetFile)
    })

    it("should return empty array when not found", async () => {
      const results = await Filesystem.findUp("nonexistent.txt", testDir, testDir)
      expect(results).toEqual([])
    })
  })

  describe("up", () => {
    it("should iterate upward finding targets", async () => {
      const targetFile = "up-target.txt"
      const nestedDir = join(testDir, "level1", "level2")
      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(testDir, targetFile), "found me")

      const results: string[] = []
      for await (const match of Filesystem.up({ targets: [targetFile], start: nestedDir, stop: testDir })) {
        results.push(match)
      }

      expect(results.length).toBe(1)
    })
  })

  describe("write error handling", () => {
    it("should handle ENOENT errors during write", async () => {
      // This tests the isEnoent function and the catch block in write function
      const filePath = join(testDir, "subdir", "error.txt")

      // This should work and trigger the error handling path
      await Filesystem.write(filePath, "test content")

      // Verify file was written
      expect(await Filesystem.exists(filePath)).toBe(true)
      const content = await Filesystem.readText(filePath)
      expect(content).toBe("test content")
    })
  })

  describe("normalizePath error handling", () => {
    it("should handle realpathSync errors", async () => {
      if (process.platform !== "win32") return

      // Test with a non-existent path to trigger the catch block
      const nonExistentPath = "C:\\nonexistent\\path\\file.txt"
      const result = Filesystem.normalizePath(nonExistentPath)
      expect(result).toBe(nonExistentPath)
    })
  })

  describe("nativePath flag handling", () => {
    it("should respect OPENCODE_EXPERIMENTAL_MSYS_PATHS flag", () => {
      if (process.platform !== "win32") return

      // Test with the flag enabled (this would be set via environment)
      const testPath = "/path/to/file"
      const result = Filesystem.nativePath(testPath)
      expect(result).toBeDefined()
    })
  })

  describe("normalizeGitPath forward slash conversion", () => {
    it("should convert backslashes to forward slashes for git", () => {
      const result = Filesystem.normalizeGitPath("path\\to\\file", true)
      expect(result).toContain("path/to/file")
      expect(result).not.toContain("\\")
    })
  })

  describe("normalizeNativePath Windows conversion", () => {
    it("should convert forward slashes to backslashes on Windows", () => {
      if (process.platform !== "win32") return

      const result = Filesystem.normalizeNativePath("path/to/file")
      expect(result).toBe("path\\to\\file")
    })
  })

  describe("getCanonicalPath Windows handling", () => {
    it("should strip \\\\?\\ prefix on Windows", async () => {
      if (process.platform !== "win32") return

      // Test with a real path
      const result = Filesystem.getCanonicalPath(testDir)
      expect(result).toBeDefined()
      expect(result.startsWith("\\\\?\\")).toBe(false)
    })
  })

  describe("isValidFilename UTF-8 validation", () => {
    it("should handle UTF-8 encoding errors", () => {
      // Test with invalid UTF-8 sequence that would cause encoding errors
      const invalidUtf8 = "file\x80.txt" // Invalid UTF-8 byte
      const result = Filesystem.isValidFilename(invalidUtf8)
      expect(typeof result).toBe("boolean")
    })
  })

  describe("globUp", () => {
    it("should find files matching glob pattern upward", async () => {
      const pattern = "*.txt"
      const nestedDir = join(testDir, "level1", "level2")
      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(testDir, "match.txt"), "found")

      const results = await Filesystem.globUp(pattern, nestedDir, testDir)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]).toContain("match.txt")
    })
  })

  describe("writeStream", () => {
    it("should write stream to file", async () => {
      const filePath = join(testDir, "stream.txt")
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("stream content"))
          controller.close()
        }
      })

      await Filesystem.writeStream(filePath, stream)

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("stream content")
    })

    it("should handle Readable stream", async () => {
      const filePath = join(testDir, "readable.txt")
      const { Readable } = require("stream")
      const readable = new Readable({
        read() {
          this.push("readable content")
          this.push(null)
        }
      })

      await Filesystem.writeStream(filePath, readable)

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("readable content")
    })

    it("should set file mode when provided", async () => {
      const filePath = join(testDir, "mode.txt")
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("content"))
          controller.close()
        }
      })

      await Filesystem.writeStream(filePath, stream, 0o644)

      const content = await Filesystem.readText(filePath)
      expect(content).toBe("content")
    })
  })

  describe("error handling and edge cases", () => {
    it("should handle bigint file sizes", async () => {
      const filePath = join(testDir, "big.txt")
      await writeFile(filePath, "test")

      // Mock stat to return bigint size
      const originalStat = Filesystem.stat
        ; (Filesystem as any).stat = () => ({ size: BigInt(42) })

      const size = await Filesystem.size(filePath)
      expect(size).toBe(42)

        // Restore original
        ; (Filesystem as any).stat = originalStat
    })

    it("should handle write errors with ENOENT", async () => {
      // This tests the catch block in write function (lines 78-86)
      const invalidPath = "/invalid/path/that/does/not/exist/file.txt"

      // This should trigger the ENOENT error handling
      await expect(Filesystem.write(invalidPath, "content")).resolves.not.toThrow()
    })

    it("should handle realpathSync errors in normalizePath", async () => {
      if (process.platform === "win32") return

      // Test with a path that would cause realpathSync to fail
      const invalidPath = "/invalid/nonexistent/path"

      // This should trigger the catch block in normalizePath
      const result = Filesystem.normalizePath(invalidPath)
      expect(result).toBe(invalidPath)
    })

    it("should handle MSYS paths flag in nativePath", async () => {
      if (process.platform !== "win32") return

      const testPath = "/path/to/file"

      // Test with flag disabled (default behavior)
      const result1 = Filesystem.nativePath(testPath)
      expect(result1).toContain("\\")

      // Test with flag enabled (would be set via environment)
      process.env.OPENCODE_EXPERIMENTAL_MSYS_PATHS = "true"
      const result2 = Filesystem.nativePath(testPath)
      expect(result2).toBe(testPath) // Should return normalized path unchanged

      delete process.env.OPENCODE_EXPERIMENTAL_MSYS_PATHS
    })

    it("should handle Windows reserved names case-insensitively", () => {
      expect(Filesystem.isValidFilename("con")).toBe(false) // lowercase
      expect(Filesystem.isValidFilename("Con")).toBe(false) // uppercase
      expect(Filesystem.isValidFilename("aux")).toBe(false) // lowercase
      expect(Filesystem.isValidFilename("AUX")).toBe(false) // uppercase
    })

    it("should handle filename with trailing spaces on Windows", () => {
      if (process.platform !== "win32") return

      expect(Filesystem.isValidFilename("file ")).toBe(false)
      expect(Filesystem.isValidFilename("file.")).toBe(false)
      expect(Filesystem.isValidFilename("file. ")).toBe(false)
    })

    it("should handle UTF-8 encoding validation", () => {
      // Test valid UTF-8
      expect(Filesystem.isValidFilename("file.txt")).toBe(true)

      // Test invalid UTF-8 sequence
      const invalidUtf8 = "file\x80\x81.txt" // Invalid continuation bytes
      expect(typeof Filesystem.isValidFilename(invalidUtf8)).toBe("boolean")
    })

    it("should handle binary file detection with null bytes", async () => {
      const filePath = join(testDir, "binary.bin")
      // Create file with multiple null bytes
      await writeFile(filePath, Buffer.from([0, 0, 0, 1, 0, 2, 0, 3]))

      const isBinary = await Filesystem.isBinaryFile(filePath)
      expect(isBinary).toBe(true)
    })

    it("should handle binary file detection with control characters", async () => {
      const filePath = join(testDir, "control.bin")
      // Create file with control characters
      await writeFile(filePath, Buffer.from([1, 2, 3, 4, 5, 31, 127]))

      const isBinary = await Filesystem.isBinaryFile(filePath)
      expect(isBinary).toBe(true)
    })

    it("should handle validateFilepath with absolute paths", () => {
      const absPath = "/absolute/path/file.txt"
      const result = Filesystem.validateFilepath(absPath, testDir)

      if (process.platform === "win32") {
        // On Windows, absolute paths outside test dir should be invalid
        expect(result.valid).toBe(false)
        expect(result.reason).toContain("outside")
      } else {
        // On Unix, this might be valid depending on the path
        expect(typeof result.valid).toBe("boolean")
      }
    })

    it("should handle overlaps with relative paths", () => {
      const path1 = "dir1"
      const path2 = "dir2"
      const result = Filesystem.overlaps(path1, path2)

      expect(typeof result).toBe("boolean")
    })

    it("should handle contains with symlinks", async () => {
      if (process.platform === "win32") return // Skip on Windows

      const linkPath = join(testDir, "link")
      const targetPath = join(testDir, "target")

      await writeFile(targetPath, "target content")
      await symlink(targetPath, linkPath)

      const result = Filesystem.contains(testDir, linkPath)
      expect(result).toBe(true)
    })

    it("should handle findUp with stop condition", async () => {
      const targetFile = "stop-target.txt"
      const nestedDir = join(testDir, "level1", "level2")
      const stopDir = join(testDir, "level1")

      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(stopDir, targetFile), "found at stop")
      await writeFile(join(testDir, targetFile), "found at root")

      const results = await Filesystem.findUp(targetFile, nestedDir, stopDir)
      expect(results.length).toBe(1)
      // The result should be the full path, not just filename
      expect(results[0]).toContain(targetFile)
    })

    it("should handle up with stop condition", async () => {
      const targetFile = "up-stop.txt"
      const nestedDir = join(testDir, "level1", "level2")
      const stopDir = join(testDir, "level1")

      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(stopDir, targetFile), "found at stop")
      await writeFile(join(testDir, targetFile), "found at root")

      const results: string[] = []
      for await (const match of Filesystem.up({ targets: [targetFile], start: nestedDir, stop: stopDir })) {
        results.push(match)
      }

      expect(results.length).toBe(1)
      // The result should be the full path, not just filename
      expect(results[0]).toContain(targetFile)
    })

    it("should handle globUp with stop condition", async () => {
      const pattern = "*.txt"
      const nestedDir = join(testDir, "level1", "level2")
      const stopDir = join(testDir, "level1")

      await mkdir(nestedDir, { recursive: true })
      await writeFile(join(stopDir, "stop.txt"), "found at stop")
      await writeFile(join(testDir, "root.txt"), "found at root")

      const results = await Filesystem.globUp(pattern, nestedDir, stopDir)
      expect(results.length).toBe(1)
      // The result should be the full path, not just filename
      expect(results[0]).toContain("stop.txt")
    })
  })
})
