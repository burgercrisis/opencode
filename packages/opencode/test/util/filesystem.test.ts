import { describe, expect, test, vi } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { Filesystem } from "../../src/util/filesystem"
import { Flag } from "../../src/flag/flag"

describe("util.filesystem", () => {
  test("isValidFilename() catch block with invalid surrogate", () => {
    // Try to pass an invalid surrogate pair
    const invalid = "\uD800" // Lone high surrogate
    // Buffer.from("\uD800", 'utf-8').toString('utf-8') usually replaces it with replacement char
    // so it might trigger (encoded !== filename) but not the catch block.
    // Let's see.
    expect(Filesystem.isValidFilename(invalid)).toBe(false)
  })

  test("non-windows branches", async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    
    try {
      // Re-importing or using the existing one if it hasn't cached the platform check internally at top-level
      // The code uses process.platform inside functions, so it should pick up the change!
      
      expect(Filesystem.normalizeNativePath("a/b")).toBe("a/b")
      expect(Filesystem.getCanonicalPath(".")).toBeTruthy()
      
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

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

  test("isBinaryFile() detects binary content", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-binary-"))
    const textFile = path.join(tmp, "text.txt")
    const binaryFile = path.join(tmp, "binary.bin")
    const missingFile = path.join(tmp, "missing.bin")

    await Bun.write(textFile, "Hello world")
    await Bun.write(binaryFile, new Uint8Array([0, 0, 0, 0, 0]))

    expect(await Filesystem.isBinaryFile(textFile)).toBe(false)
    expect(await Filesystem.isBinaryFile(binaryFile)).toBe(true)
    expect(await Filesystem.isBinaryFile(missingFile)).toBe(true) // Fail safe

    await rm(tmp, { recursive: true, force: true })
  })

  test("contains() checks if path is within parent", () => {
    const root = path.resolve("/tmp/project")
    const inside = path.resolve("/tmp/project/src/file.ts")
    const outside = path.resolve("/tmp/outside/file.ts")

    expect(Filesystem.contains(root, inside)).toBe(true)
    expect(Filesystem.contains(root, outside)).toBe(false)
    expect(Filesystem.contains(root, root)).toBe(true)
  })

  test("overlaps() checks if paths overlap", () => {
    const a = path.resolve("/tmp/project/src")
    const b = path.resolve("/tmp/project/src/file.ts")
    const c = path.resolve("/tmp/project/test")

    expect(Filesystem.overlaps(a, b)).toBe(true)
    expect(Filesystem.overlaps(b, a)).toBe(true)
    expect(Filesystem.overlaps(a, c)).toBe(false)
  })

  test("normalizeNativePath() uses correct separators", () => {
    const p = "path/to/file"
    const normalized = Filesystem.normalizeNativePath(p)
    if (process.platform === "win32") {
      expect(normalized).toBe("path\\to\\file")
    } else {
      expect(normalized).toBe("path/to/file")
    }
  })

  test("getCanonicalPath() returns absolute path", () => {
    const p = "."
    const canonical = Filesystem.getCanonicalPath(p)
    expect(path.isAbsolute(canonical)).toBe(true)
  })

  test("findUp() finds files up the directory tree", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-findup-"))
    const deep = path.join(tmp, "a/b/c")
    const target = "config.json"
    const targetPath = path.join(tmp, target)

    await mkdir(deep, { recursive: true })
    await Bun.write(targetPath, "{}")

    const found = await Filesystem.findUp(target, deep, tmp)
    expect(found).toContain(Filesystem.nativePath(targetPath))

    await rm(tmp, { recursive: true, force: true })
  })

  test("up() iterates up the directory tree", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-up-"))
    const deep = path.join(tmp, "a/b/c")
    const target = "marker.txt"
    const targetPath = path.join(tmp, "a", target)

    await mkdir(deep, { recursive: true })
    await Bun.write(targetPath, "here")

    const matches: string[] = []
    for await (const match of Filesystem.up({ targets: [target], start: deep, stop: tmp })) {
      matches.push(match)
    }

    expect(matches).toContain(Filesystem.nativePath(targetPath))
    await rm(tmp, { recursive: true, force: true })
  })

  test("globUp() scans for patterns up the tree", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-globup-"))
    const deep = path.join(tmp, "a/b/c")
    const target = "file.test.js"
    const targetPath = path.join(tmp, "a", target)

    await mkdir(deep, { recursive: true })
    await Bun.write(targetPath, "test")

    const found = await Filesystem.globUp("*.test.js", deep, tmp)
    expect(found.some(f => f.endsWith(target))).toBe(true)

    await rm(tmp, { recursive: true, force: true })
  })

  test("normalizeGitPath() handles non-git mode", () => {
    const p = "path\\to\\file"
    const normalized = Filesystem.normalizeGitPath(p, false)
    if (process.platform === "win32") {
      expect(normalized).toContain("\\")
    }
  })

  test("normalizePath() handles errors", () => {
    // Pass something that realpathSync.native will fail on
    const result = Filesystem.normalizePath("Z:\\non-existent-drive\\file.txt")
    expect(result).toBe("Z:\\non-existent-drive\\file.txt")
  })

  test("nativePath() handles MSYS flag", () => {
    const original = Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS
    try {
      // @ts-ignore - force change for test
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = true
      const p = "a/b/c"
      expect(Filesystem.nativePath(p)).toBe("a/b/c")
      
      // @ts-ignore
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = false
      if (process.platform === "win32") {
        expect(Filesystem.nativePath(p)).toBe("a\\b\\c")
      }
    } finally {
      // @ts-ignore
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = original
    }
  })

  test("resolvePath() and other helpers", () => {
    expect(Filesystem.resolvePath("a", "b")).toContain("a")
    expect(Filesystem.join("a", "b")).toContain("a")
    expect(Filesystem.dirname("a/b/c")).toContain("b")
    expect(Filesystem.relativePath("a/b", "a/b/c")).toBe("c")
  })

  test("isValidFilename() catch block", () => {
    // A lone surrogate should cause issues with some UTF-8 encoders/decoders
    // but Node/Bun Buffer might just handle it by replacing it.
    // However, we can try to pass something that is not a string if we bypass types.
    expect(Filesystem.isValidFilename(null as any)).toBe(false)
    expect(Filesystem.isValidFilename(undefined as any)).toBe(false)
    expect(Filesystem.isValidFilename(123 as any)).toBe(false)
  })

  test("platform specific branches", () => {
    // If we can't mock process.platform, we can at least test the current one
    if (process.platform === "win32") {
      expect(Filesystem.normalizeNativePath("a/b")).toBe("a\\b")
      expect(Filesystem.getCanonicalPath("C:\\")).toContain(":")
    } else {
      expect(Filesystem.normalizeNativePath("a\\b")).toBe("a/b")
      expect(Filesystem.getCanonicalPath("/")).toBe("/")
    }
  })
})
