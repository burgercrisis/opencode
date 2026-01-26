import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { Filesystem } from "../../src/util/filesystem"

describe("util.filesystem", () => {
  test("exists() is true for files and directories", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-filesystem-"))
    const dir = path.join(tmp, "dir")
    const file = path.join(tmp, "file.txt")
    const missing = path.join(tmp, "missing")

    await mkdir(dir, { recursive: true })
    await Bun.write(file, "hello")

    const cases = await Promise.all([Filesystem.exists(dir), Filesystem.exists(file), Filesystem.exists(missing)])

    expect(cases).toEqual([true, true, false])

    await rm(tmp, { recursive: true, force: true })
  })

  test("isDir() is true only for directories", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-filesystem-"))
    const dir = path.join(tmp, "dir")
    const file = path.join(tmp, "file.txt")
    const missing = path.join(tmp, "missing")

    await mkdir(dir, { recursive: true })
    await Bun.write(file, "hello")

    const cases = await Promise.all([Filesystem.isDir(dir), Filesystem.isDir(file), Filesystem.isDir(missing)])

    expect(cases).toEqual([true, false, false])

    await rm(tmp, { recursive: true, force: true })
  })

  test("normalizePath() handles Windows paths", () => {
    // This test behavior depends on the platform running the test
    if (process.platform === "win32") {
      // On Windows, it should try to resolve to real casing
      // We can't easily test real casing without real files, but we can test it returns a string
      const p = "c:\\Windows"
      expect(typeof Filesystem.normalizePath(p)).toBe("string")
    } else {
      // On non-Windows, it should just return the path
      const p = "/tmp/foo"
      expect(Filesystem.normalizePath(p)).toBe(p)
    }
  })

  test("nativePath() converts separators on Windows", () => {
    const p = "path/to/file"
    const normalized = Filesystem.nativePath(p)
    if (process.platform === "win32") {
      expect(normalized).toBe("path\\to\\file")
    } else {
      expect(normalized).toBe("path/to/file")
    }
  })

  test("normalizeGitPath() converts to forward slashes", () => {
    const p = "path\\to\\file"
    const normalized = Filesystem.normalizeGitPath(p)
    expect(normalized).toContain("/")
    expect(normalized).not.toContain("\\")
  })

  test("isValidFilename() validates filenames", () => {
    expect(Filesystem.isValidFilename("test.txt")).toBe(true)
    expect(Filesystem.isValidFilename("test/file")).toBe(false) // Contains separator
    expect(Filesystem.isValidFilename("test\\file")).toBe(false) // Contains separator
    expect(Filesystem.isValidFilename("COM1")).toBe(false) // Reserved
    expect(Filesystem.isValidFilename("")).toBe(false)
    
    // Control chars
    expect(Filesystem.isValidFilename("test\u0000.txt")).toBe(false)
  })

  test("validateFilepath() checks boundaries", () => {
    const root = path.resolve("/tmp/project")
    
    // Valid path
    expect(Filesystem.validateFilepath("file.txt", root).valid).toBe(true)
    
    // Path traversal
    expect(Filesystem.validateFilepath("../outside.txt", root).valid).toBe(false)
    
    // Absolute path outside
    expect(Filesystem.validateFilepath(process.platform === "win32" ? "C:\\outside.txt" : "/outside.txt", root).valid).toBe(false)
  })
})
