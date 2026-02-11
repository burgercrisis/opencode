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
    expect(Filesystem.isValidFilename(invalid)).toBe(false)
  })

  test("isValidFilename() validates length", () => {
    expect(Filesystem.isValidFilename("a".repeat(256))).toBe(false)
    expect(Filesystem.isValidFilename("a".repeat(255))).toBe(true)
  })

  test("isValidFilename() validates Windows reserved names", () => {
    expect(Filesystem.isValidFilename("CON")).toBe(false)
    expect(Filesystem.isValidFilename("prn")).toBe(false)
    expect(Filesystem.isValidFilename("AUX.txt")).toBe(false)
  })

  test("isValidFilename() validates Windows trailing spaces/periods", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      expect(Filesystem.isValidFilename("test ")).toBe(false)
      expect(Filesystem.isValidFilename("test.")).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("isBinaryFile() handles null byte detection", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-binary-null-"))
    const binaryFile = path.join(tmp, "binary.bin")
    // 3 null bytes triggers binary detection
    await Bun.write(binaryFile, new Uint8Array([0, 0, 0]))
    expect(await Filesystem.isBinaryFile(binaryFile)).toBe(true)
    await rm(tmp, { recursive: true, force: true })
  })

  test("isBinaryFile() handles control character detection", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-binary-ctrl-"))
    const binaryFile = path.join(tmp, "binary.bin")
    // ASCII 7 (BEL) is a control character
    await Bun.write(binaryFile, new Uint8Array([7]))
    expect(await Filesystem.isBinaryFile(binaryFile)).toBe(true)
    await rm(tmp, { recursive: true, force: true })
  })

  test("validateFilepath() handles empty or null paths", () => {
    const root = "/tmp"
    expect(Filesystem.validateFilepath("", root).valid).toBe(false)
    expect(Filesystem.validateFilepath("file\0.txt", root).valid).toBe(false)
  })

  test("validateFilepath() detects traversal via normalization", () => {
    const root = path.resolve("/tmp/project")
    // normalize(abs) check
    expect(Filesystem.validateFilepath("src/../../outside.txt", root).valid).toBe(false)
  })

  test("findUp() stop conditions", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-findup-stop-"))
    const start = path.join(tmp, "a/b")
    await mkdir(start, { recursive: true })
    
    // Stop at curr === next (root)
    const found = await Filesystem.findUp("nonexistent", start)
    expect(found).toEqual([])
    
    await rm(tmp, { recursive: true, force: true })
  })

  test("up() stop conditions", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-up-stop-"))
    const start = path.join(tmp, "a/b")
    await mkdir(start, { recursive: true })
    
    // Stop at curr === next (root)
    const matches = []
    for await (const match of Filesystem.up({ targets: ["nonexistent"], start })) {
      matches.push(match)
    }
    expect(matches).toEqual([])
    
    await rm(tmp, { recursive: true, force: true })
  })

  test("globUp() basic functionality", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-globup-"))
    const deep = path.join(tmp, "a/b")
    await mkdir(deep, { recursive: true })
    await Bun.write(path.join(tmp, "test.txt"), "hello")
    
    const matches = await Filesystem.globUp("*.txt", deep, tmp)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]).toContain("test.txt")
    
    await rm(tmp, { recursive: true, force: true })
  })

  test("non-windows branches", async () => {
    // We don't mock process.platform here because node:path behavior is fixed at startup.
    // Instead, we test the logic assuming we are on whatever platform we are on,
    // and we already have platform-specific tests elsewhere.
    // This test was redundant and incorrect in its mocking.
    const result = Filesystem.normalizeNativePath("a/b")
    if (process.platform === "win32") {
      expect(result).toBe("a\\b")
    } else {
      expect(result).toBe("a/b")
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
    if (process.platform === "win32") {
      const p = "c:\\Windows"
      expect(typeof Filesystem.normalizePath(p)).toBe("string")
    } else {
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
    expect(Filesystem.isValidFilename("test/file")).toBe(false)
    expect(Filesystem.isValidFilename("test\\file")).toBe(false)
    expect(Filesystem.isValidFilename("COM1")).toBe(false)
    expect(Filesystem.isValidFilename("")).toBe(false)
    expect(Filesystem.isValidFilename("test\u0000.txt")).toBe(false)
  })

  test("validateFilepath() checks boundaries", () => {
    const root = path.resolve("/tmp/project")
    expect(Filesystem.validateFilepath("src/index.ts", root).valid).toBe(true)
    expect(Filesystem.validateFilepath("file.txt", root).valid).toBe(true)
    expect(Filesystem.validateFilepath("../outside.txt", root).valid).toBe(false)
    const outsidePath = process.platform === "win32" ? "C:\\outside.txt" : "/outside.txt"
    expect(Filesystem.validateFilepath(outsidePath, root).valid).toBe(false)
  })

  test("getCanonicalPath() with \\\\?\\ prefix on Windows", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    
    // We mock realpathSync.native to return a \\?\ prefixed path
    const fs = require("node:fs")
    const spy = vi.spyOn(fs.realpathSync, "native")
    spy.mockReturnValue("\\\\?\\C:\\canonical\\path")
    
    try {
      expect(Filesystem.getCanonicalPath("C:\\some\\path")).toBe("C:\\canonical\\path")
    } finally {
      spy.mockRestore()
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("getCanonicalPath() catch block", () => {
    expect(Filesystem.getCanonicalPath("/non/existent/path/that/should/fail/realpath")).toBeTruthy()
  })

  test("normalizeGitPath() handles empty input", () => {
    expect(Filesystem.normalizeGitPath("")).toBe("")
  })

  test("normalizeNativePath() handles empty input", () => {
    expect(Filesystem.normalizeNativePath("")).toBe("")
  })

  test("isValidFilename() handles null/non-string", () => {
    // @ts-ignore
    expect(Filesystem.isValidFilename(null)).toBe(false)
    // @ts-ignore
    expect(Filesystem.isValidFilename(123)).toBe(false)
  })

  test("normalizeNativePath() with mock on Windows", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    
    try {
      // We want to hit the line that replaces / with \
      // On real Windows, path.normalize might have already done it.
      // But we can test the function's logic directly.
      expect(Filesystem.normalizeNativePath("a/b")).toContain("\\")
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("getCanonicalPath() success on linux", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const fs = require("node:fs")
    const spy = vi.spyOn(fs, "realpathSync")
    spy.mockReturnValue("/canonical/path")
    try {
      expect(Filesystem.getCanonicalPath("/some/path")).toBe("/canonical/path")
    } finally {
      spy.mockRestore()
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("getCanonicalPath() without \\\\?\\ prefix on Windows", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    
    const fs = require("node:fs")
    const spy = vi.spyOn(fs.realpathSync, "native")
    spy.mockReturnValue("C:\\canonical\\path")
    
    try {
      expect(Filesystem.getCanonicalPath("C:\\some\\path")).toBe("C:\\canonical\\path")
    } finally {
      spy.mockRestore()
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("isValidFilename() catch block", () => {
    // We mock Buffer.from to throw
    const originalBufferFrom = Buffer.from
    // @ts-ignore
    Buffer.from = () => { throw new Error("fail") }
    try {
      expect(Filesystem.isValidFilename("test.txt")).toBe(false)
    } finally {
      Buffer.from = originalBufferFrom
    }
  })

  test("overlaps() functionality", () => {
    // We use absolute paths to ensure relativePath works predictably
    const root = process.platform === "win32" ? "C:\\" : "/"
    const a = path.join(root, "a", "b")
    const b = path.join(root, "a", "b", "c")
    const c = path.join(root, "x", "y")

    expect(Filesystem.overlaps(a, b)).toBe(true)
    expect(Filesystem.overlaps(b, a)).toBe(true)
    expect(Filesystem.overlaps(a, c)).toBe(false)
    expect(Filesystem.overlaps(a, a)).toBe(true)
  })

  test("normalizePath() windows branch", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })

    try {
      const mockPath = "C:\\Users\\test\\file.ts"
      const spy = vi.spyOn(require("fs").realpathSync, "native").mockReturnValue(mockPath)

      const result = Filesystem.normalizePath("some/path")
      expect(result.replace(/\//g, "\\")).toBe(mockPath)
      spy.mockRestore()
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    }
  })

  test("nativePath() experimental flag branch", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })
    const originalFlag = Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS

    try {
      // @ts-ignore
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = true
      const p = "a/b/c"
      expect(Filesystem.nativePath(p)).toBe(p)
    } finally {
      // @ts-ignore
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = originalFlag
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    }
  })

  test("getCanonicalPath() windows long path prefix", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })

    try {
      const longPath = "\\\\?\\C:\\Very\\Long\\Path"
      const spy = vi.spyOn(require("fs").realpathSync, "native").mockReturnValue(longPath)

      const result = Filesystem.getCanonicalPath("C:\\Very\\Long\\Path")
      expect(result).toBe("C:\\Very\\Long\\Path")
      spy.mockRestore()
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
    }
  })

  test("findUp() with OPENCODE_TEST_HOME", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-findup-home-"))
    const originalHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp

    try {
      const start = path.join(tmp, "a/b/c")
      await mkdir(start, { recursive: true })
      
      const found = await Filesystem.findUp("nonexistent", start)
      expect(found).toEqual([])
    } finally {
      process.env.OPENCODE_TEST_HOME = originalHome
      await rm(tmp, { recursive: true, force: true })
    }
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
    expect(await Filesystem.isBinaryFile(missingFile)).toBe(true)

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
    const result = Filesystem.normalizePath("Z:\\non-existent-drive\\file.txt")
    expect(result).toBe("Z:\\non-existent-drive\\file.txt")
  })

  test("nativePath() handles MSYS flag", () => {
    const original = Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS
    try {
      // @ts-ignore
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
    expect(Filesystem.isValidFilename(null as any)).toBe(false)
    expect(Filesystem.isValidFilename(undefined as any)).toBe(false)
    expect(Filesystem.isValidFilename(123 as any)).toBe(false)
  })

  test("platform specific branches", () => {
    if (process.platform === "win32") {
      expect(Filesystem.normalizeNativePath("a/b")).toBe("a\\b")
      expect(Filesystem.getCanonicalPath("C:\\")).toContain(":")
    } else {
      expect(Filesystem.normalizeNativePath("a\\b")).toBe("a/b")
      expect(Filesystem.getCanonicalPath("/")).toBe("/")
    }
  })

  test("getCanonicalPath() handles errors", () => {
    const p = "/non/existent/path/that/will/fail/realpath"
    expect(Filesystem.getCanonicalPath(p)).toBeTruthy()
  })

  test("isBinaryFile() sample limit and small files", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "opencode-binary-small-"))
    const file = path.join(tmp, "small.txt")
    
    await Bun.write(file, "a")
    expect(await Filesystem.isBinaryFile(file)).toBe(false)
    
    await Bun.write(file, "a".repeat(9000))
    expect(await Filesystem.isBinaryFile(file)).toBe(false)
    
    const buf = new Uint8Array(9000)
    buf.fill(32)
    buf[8500] = 0
    buf[8501] = 0
    buf[8502] = 0
    await Bun.write(file, buf)
    expect(await Filesystem.isBinaryFile(file)).toBe(false)

    buf[100] = 0
    buf[101] = 0
    buf[102] = 0
    await Bun.write(file, buf)
    expect(await Filesystem.isBinaryFile(file)).toBe(true)

    await rm(tmp, { recursive: true, force: true })
  })

  test("isValidFilename() unicode and special cases", () => {
    expect(Filesystem.isValidFilename("a\0b")).toBe(false)
    expect(Filesystem.isValidFilename("a\x01b")).toBe(false)
    expect(Filesystem.isValidFilename("a\x1Fb")).toBe(false)
    expect(Filesystem.isValidFilename("a\x7Fb")).toBe(false)
  })

  test("validateFilepath() null bytes", () => {
    expect(Filesystem.validateFilepath("a\0b", "/tmp").valid).toBe(false)
  })

  test("join() handles undefined/null segments", () => {
    expect(Filesystem.join("a", undefined as any, "b")).toContain("a")
    expect(Filesystem.join("a", null as any, "b")).toContain("a")
    expect(Filesystem.join()).toBe("")
  })
})
