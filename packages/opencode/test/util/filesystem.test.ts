import { describe, expect, test, vi } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, mkdir, rm, unlink, readdir, readFile, writeFile } from "node:fs/promises"
import { Filesystem } from "../../src/util/filesystem"
import { Flag } from "../../src/flag/flag"

const fsp = { mkdtemp, mkdir, rm, unlink, readdir, readFile, writeFile }

describe("util.filesystem", () => {
  test("isValidFilename() catch block with invalid surrogate", () => {
    // Try to pass an invalid surrogate pair
    const invalid = "\uD800" // Lone high surrogate
    expect(Filesystem.isValidFilename(invalid)).toBe(false)
  })

  test("exists() and isDir() failure branches", async () => {
    const p = path.join(process.env.OPENCODE_TEST_HOME!, "non-existent-" + Math.random())
    expect(await Filesystem.exists(p)).toBe(false)
    expect(await Filesystem.isDir(p)).toBe(false)
    
    const f = path.join(process.env.OPENCODE_TEST_HOME!, "file-" + Math.random())
    await Bun.write(f, "not a dir")
    expect(await Filesystem.isDir(f)).toBe(false)
    await fsp.unlink(f)
  })

  test("isValidFilename() more edge cases", () => {
    expect(Filesystem.isValidFilename("a\0b")).toBe(false)
    expect(Filesystem.isValidFilename("a/b")).toBe(false)
    expect(Filesystem.isValidFilename("a\\b")).toBe(false)
  })

  test("getCanonicalPath() long path with prefix", async () => {
    if (process.platform !== "win32") return
    // Create a path long enough to trigger \\?\ prefix on Windows
    // Windows max path is 260, so 300 should do it
    const longDir = path.join(os.tmpdir(), "a".repeat(100), "b".repeat(100), "c".repeat(100))
    await fsp.mkdir(longDir, { recursive: true })
    try {
      const canonical = Filesystem.getCanonicalPath(longDir)
      expect(canonical).not.toContain("\\\\?\\")
      expect(path.isAbsolute(canonical)).toBe(true)
    } finally {
      await fsp.rm(path.join(os.tmpdir(), "a".repeat(100)), { recursive: true, force: true })
    }
  })

  test("isBinaryFile() additional coverage", async () => {
    const p = path.join(process.env.OPENCODE_TEST_HOME!, "binary-extra.bin")
    await Bun.write(p, new Uint8Array([0, 0])) // 2 nulls (not enough for binary)
    expect(await Filesystem.isBinaryFile(p)).toBe(false)
    await fsp.unlink(p)
  })

  test("isValidFilename() additional coverage", () => {
    expect(Filesystem.isValidFilename("a".repeat(256))).toBe(false)
    expect(Filesystem.isValidFilename("\uD800")).toBe(false)
  })

  test("validateFilepath() traversal with nested path", () => {
    const root = process.platform === "win32" ? "C:\\root" : "/root"
    const p = "sub/file.txt"
    expect(Filesystem.validateFilepath(p, root).valid).toBe(true)
  })

  test("validateFilepath() traversal detected branch", () => {
    const root = process.platform === "win32" ? "C:\\root" : "/root"
    const p = "sub/../../outside/file.txt"
    const result = Filesystem.validateFilepath(p, root)
    // On Windows, resolve(root, p) -> C:\outside\file.txt
    // contains(root, abs) will be false, so it hits the first check (abs outside root)
    // To hit the second check (p.includes('..') && !contains(root, normalize(abs))),
    // we need abs to be inside root, but normalized(abs) to be outside root.
    // This happens with symlinks, but we can't easily mock that here.
    // Let's just verify it fails for now.
    expect(result.valid).toBe(false)
  })

  test("normalizeGitPath() absolute and non-git", () => {
    const p = process.platform === "win32" ? "C:\\a\\b" : "/a/b"
    expect(Filesystem.normalizeGitPath(p, false)).toBe(path.normalize(p))
    expect(Filesystem.normalizeGitPath(p, true)).toBe(path.normalize(p).replace(/\\/g, "/"))
  })

  test("isValidFilename() validates length", () => {
    expect(Filesystem.isValidFilename("a".repeat(256))).toBe(false)
    expect(Filesystem.isValidFilename("a".repeat(255))).toBe(true)
  })

  test("isValidFilename() validates Windows reserved names", () => {
    expect(Filesystem.isValidFilename("CON")).toBe(false)
    expect(Filesystem.isValidFilename("PRN")).toBe(false)
    expect(Filesystem.isValidFilename("AUX.txt")).toBe(false)
    expect(Filesystem.isValidFilename("COM1")).toBe(false)
    expect(Filesystem.isValidFilename("LPT1")).toBe(false)

    // Check for trailing spaces or periods on Windows (not allowed)
    if (process.platform === "win32") {
      expect(Filesystem.isValidFilename("test ")).toBe(false)
      expect(Filesystem.isValidFilename("test.")).toBe(false)
    }
  })

  test("isValidFilename() unicode and special cases", () => {
    expect(Filesystem.isValidFilename("valid.txt")).toBe(true)
    expect(Filesystem.isValidFilename("valid_123.txt")).toBe(true)
    expect(Filesystem.isValidFilename("测试.txt")).toBe(true)
    expect(Filesystem.isValidFilename("🚀.png")).toBe(true)
    expect(Filesystem.isValidFilename("..")).toBe(false)
    expect(Filesystem.isValidFilename("path/to/file")).toBe(false)
    expect(Filesystem.isValidFilename("")).toBe(false)
  })

  test("isValidFilename() handles null/non-string", () => {
    expect(Filesystem.isValidFilename(null as any)).toBe(false)
    expect(Filesystem.isValidFilename(undefined as any)).toBe(false)
    expect(Filesystem.isValidFilename(123 as any)).toBe(false)
  })

  test("isBinaryFile() detects binary content", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-"))
    try {
      const textFile = path.join(tmpDir, "text.txt")
      const binaryFile = path.join(tmpDir, "binary.bin")
      
      await Bun.write(textFile, "This is a plain text file with no null bytes.")
      
      const binaryData = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03])
      await Bun.write(binaryFile, binaryData)
      
      expect(await Filesystem.isBinaryFile(textFile)).toBe(false)
      expect(await Filesystem.isBinaryFile(binaryFile)).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("isBinaryFile() detects non-null control characters", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-ctrl-"))
    try {
      const ctrlFile = path.join(tmpDir, "ctrl.bin")
      // \x01 is a control character (< 32, not 9, 10, 13)
      await Bun.write(ctrlFile, "text with \x01 control char")
      expect(await Filesystem.isBinaryFile(ctrlFile)).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("isBinaryFile() handles missing file", async () => {
    expect(await Filesystem.isBinaryFile("non-existent-file-12345")).toBe(true)
  })

  test("isBinaryFile() handles more than 2 null bytes", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-nulls-"))
    try {
      const nullsFile = path.join(tmpDir, "nulls.bin")
      await Bun.write(nullsFile, new Uint8Array([0, 0, 0]))
      expect(await Filesystem.isBinaryFile(nullsFile)).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("validateFilepath() checks boundaries", () => {
    const root = process.platform === "win32" ? "C:\\project" : "/project"
    const valid = process.platform === "win32" ? "C:\\project\\src\\index.ts" : "/project/src/index.ts"
    const invalid = process.platform === "win32" ? "C:\\outside\\file.ts" : "/outside/file.ts"
    
    expect(Filesystem.validateFilepath(valid, root).valid).toBe(true)
    expect(Filesystem.validateFilepath(invalid, root).valid).toBe(false)
    expect(Filesystem.validateFilepath("", root).valid).toBe(false)
    expect(Filesystem.validateFilepath("a/../b", root).valid).toBe(true)
    expect(Filesystem.validateFilepath("../outside", root).valid).toBe(false)
  })

  test("overlaps() functionality", () => {
    const root = process.platform === "win32" ? "C:\\a" : "/a"
    const sub = process.platform === "win32" ? "C:\\a\\b" : "/a/b"
    const other = process.platform === "win32" ? "C:\\c" : "/c"
    
    expect(Filesystem.overlaps(root, sub)).toBe(true)
    expect(Filesystem.overlaps(sub, root)).toBe(true)
    expect(Filesystem.overlaps(root, other)).toBe(false)
  })

  test("contains() checks if path is within parent", () => {
    const parent = process.platform === "win32" ? "C:\\parent" : "/parent"
    const child = process.platform === "win32" ? "C:\\parent\\child\\file.ts" : "/parent/child/file.ts"
    const outside = process.platform === "win32" ? "C:\\outside" : "/outside"
    
    expect(Filesystem.contains(parent, child)).toBe(true)
    expect(Filesystem.contains(parent, outside)).toBe(false)
    expect(Filesystem.contains(parent, parent)).toBe(true)
  })

  test("up() iterates up the directory tree", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-"))
    const subDir = path.join(tmpDir, "a", "b", "c")
    await mkdir(subDir, { recursive: true })
    
    const marker = "marker.txt"
    await Bun.write(path.join(tmpDir, marker), "root")
    await Bun.write(path.join(tmpDir, "a", "b", marker), "middle")
    
    try {
      const found = []
      for await (const p of Filesystem.up({ targets: [marker], start: subDir })) {
        found.push(p)
      }
      expect(found.length).toBeGreaterThanOrEqual(2)
      expect(found[0]).toContain(path.join("a", "b", marker))
      expect(found[1]).toContain(path.join(tmpDir, marker))
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("findUp() finds files up the directory tree", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-"))
    const subDir = path.join(tmpDir, "a", "b", "c")
    await mkdir(subDir, { recursive: true })
    
    const marker = "find-up-marker.txt"
    await Bun.write(path.join(tmpDir, marker), "root")
    
    try {
      const found = await Filesystem.findUp(marker, subDir)
      expect(found.length).toBe(1)
      expect(found[0]).toContain(marker)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("globUp() scans for patterns up the tree", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-"))
    const subDir = path.join(tmpDir, "a", "b")
    await mkdir(subDir, { recursive: true })
    
    await Bun.write(path.join(tmpDir, "test1.proto"), "root")
    await Bun.write(path.join(subDir, "test2.proto"), "sub")
    
    try {
      const found = await Filesystem.globUp("*.proto", subDir)
      expect(found.length).toBeGreaterThanOrEqual(2)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("nativePath() converts separators on Windows", () => {
    if (process.platform === "win32") {
      expect(Filesystem.nativePath("a/b/c")).toBe("a\\b\\c")
    } else {
      expect(Filesystem.nativePath("a/b/c")).toBe("a/b/c")
    }
  })

  test("normalizeGitPath() converts to forward slashes", () => {
    const p = "a/b/c"
    const result = Filesystem.normalizeGitPath(p)
    expect(result.replace(/\\/g, "/")).toBe(path.resolve(p).replace(/\\/g, "/"))
    expect(result).not.toContain("\\")
  })

  test("isDir() and exists()", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencode-test-fs-"))
    try {
      expect(await Filesystem.isDir(tmpDir)).toBe(true)
      
      const file = path.join(tmpDir, "file.txt")
      await Bun.write(file, "hello")
      expect(await Filesystem.isDir(file)).toBe(false)
      expect(await Filesystem.exists(file)).toBe(true)
      
      const missing = path.join(tmpDir, "missing")
      expect(await Filesystem.exists(missing)).toBe(false)
      expect(await Filesystem.isDir(missing)).toBe(false)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("dirname() handles null/undefined", () => {
    // @ts-ignore
    expect(Filesystem.dirname(null)).toBe("")
    // @ts-ignore
    expect(Filesystem.dirname(undefined)).toBe("")
  })

  test("isValidFilename() catch block with throw", () => {
    const original = Buffer.from
    // @ts-ignore
    Buffer.from = () => { throw new Error("mock error") }
    try {
      expect(Filesystem.isValidFilename("test.txt")).toBe(false)
    } finally {
      Buffer.from = original
    }
  })

  test("isBinaryFile() handles missing file", async () => {
    const exists = await Filesystem.isBinaryFile("non-existent-file-" + Math.random())
    expect(exists).toBe(true)
  })

  test("isBinaryFile() detects binary content more deeply", async () => {
    const temp = "test-binary.bin"
    await Bun.write(temp, new Uint8Array([0, 0, 0, 0])) // Multiple nulls
    expect(await Filesystem.isBinaryFile(temp)).toBe(true)
    
    await Bun.write(temp, new Uint8Array([0, 0, 65, 66])) // Exactly 2 nulls + 'AB' (should be false)
    // nulls=0, byte=0 -> check(i+1, 1)
    // nulls=1, byte=0 -> if (1+1 > 2) false -> check(i+1, 2)
    // nulls=2, byte=65 -> if (65 < 32) false -> check(i+1, 2)
    // nulls=2, byte=66 -> if (66 < 32) false -> check(i+1, 2)
    expect(await Filesystem.isBinaryFile(temp)).toBe(false)

    await Bun.write(temp, new Uint8Array([0, 0, 0, 65])) // 3 nulls
    expect(await Filesystem.isBinaryFile(temp)).toBe(true)
    
    await Bun.write(temp, new Uint8Array([1, 2, 3])) // Low chars
    expect(await Filesystem.isBinaryFile(temp)).toBe(true)
    
    await Bun.write(temp, "just text")
    expect(await Filesystem.isBinaryFile(temp)).toBe(false)
    
    await fsp.unlink(temp)
  })

  test("up() and findUp() and globUp() termination at filesystem root", async () => {
    const start = Filesystem.resolvePath(".")
    // These should not throw even if they hit the root
    const upGen = Filesystem.up({ targets: ["non-existent-file-xyz"], start })
    await upGen.next()
    
    expect(await Filesystem.findUp("non-existent-file-xyz", start)).toEqual([])
    expect(await Filesystem.globUp("non-existent-glob-xyz", start)).toEqual([])
  })

  test("isValidFilename() Windows trailing cases mock", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      expect(Filesystem.isValidFilename("test ")).toBe(false)
      expect(Filesystem.isValidFilename("test.")).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("validateFilepath() edge cases", () => {
    expect(Filesystem.validateFilepath("", "/root")).toEqual({ valid: false, reason: 'Empty filepath' })
    expect(Filesystem.validateFilepath("a\0b", "/root")).toEqual({ valid: false, reason: 'Null bytes in filepath' })
  })

  test("findUp() and up() stopping at OPENCODE_TEST_HOME", async () => {
    const originalHome = process.env.OPENCODE_TEST_HOME
    const root = path.join(os.tmpdir(), "find-up-test-" + Math.random())
    const sub = path.join(root, "sub")
    await fsp.mkdir(sub, { recursive: true })
    
    process.env.OPENCODE_TEST_HOME = root
    
    try {
      const results = await Filesystem.findUp("not-found", sub)
      expect(results).toEqual([])
      
      const upResults = []
      for await (const match of Filesystem.up({ targets: ["not-found"], start: sub })) {
        upResults.push(match)
      }
      expect(upResults).toEqual([])
    } finally {
      process.env.OPENCODE_TEST_HOME = originalHome
      await fsp.rm(root, { recursive: true, force: true })
    }
  })

  test("globUp() coverage more deeply", async () => {
    const root = path.join(os.tmpdir(), "glob-up-test-" + Math.random())
    const sub = path.join(root, "sub")
    await fsp.mkdir(sub, { recursive: true })
    await Bun.write(path.join(root, "target.txt"), "found")
    
    const results = await Filesystem.globUp("target.txt", sub, root)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toContain("target.txt")
    
    // Test the normalize(next) === normalize(curr) branch
    // If we start at the root and don't provide a stop, it will hit the filesystem root
    const rootResults = await Filesystem.globUp("target.txt", root)
    expect(rootResults.length).toBeGreaterThan(0)

    await fsp.rm(root, { recursive: true, force: true })
  })

  test("normalizeGitPath() handles non-git mode", () => {
    const p = "a/b/c"
    expect(Filesystem.normalizeGitPath(p, false)).toBeTruthy()
  })

  test("normalizeNativePath() uses correct separators", () => {
    const p = "a/b/c"
    const normalized = Filesystem.normalizeNativePath(p)
    if (process.platform === "win32") {
      expect(normalized).toContain("\\")
    } else {
      expect(normalized).toContain("/")
    }
  })

  test("getCanonicalPath() returns absolute path", () => {
    const p = "."
    const canonical = Filesystem.getCanonicalPath(p)
    expect(path.isAbsolute(canonical)).toBe(true)
  })

  test("getCanonicalPath() branches", async () => {
      if (process.platform === "win32") {
        // Test fallback logic when realpathSync.native fails
        const nonExistent = "C:\\" + "a".repeat(100)
        expect(Filesystem.getCanonicalPath(nonExistent)).toBe(path.resolve(nonExistent))
        
        // Test real path with prefix stripping
        // We need a path that actually exists to trigger realpathSync.native
        const tempDir = path.join(os.tmpdir(), "long-path-test-" + Math.random())
        // Create a long path structure
        let current = tempDir
        for (let i = 0; i < 10; i++) {
          current = path.join(current, "a".repeat(20))
          await fsp.mkdir(current, { recursive: true })
        }
        const longExisting = path.join(current, "file.txt")
         const longExistingWithPrefix = "\\\\?\\" + path.resolve(longExisting)
         await fsp.writeFile(longExistingWithPrefix, "hello")
         
         const canonical = Filesystem.getCanonicalPath(longExisting)
        expect(canonical).not.toContain("\\\\?\\")
        expect(path.isAbsolute(canonical)).toBe(true)
        
        await fsp.rm(tempDir, { recursive: true, force: true })

        const unc = "\\\\server\\share"
        expect(Filesystem.getCanonicalPath(unc)).toBe(path.resolve(unc))
      }
   }, 20000)

  test("getCanonicalPath() catch block", () => {
    const invalidPath = "/non/existent/path/that/should/fail/realpath"
    expect(Filesystem.getCanonicalPath(invalidPath)).toBeTruthy()
  })

  test("isValidFilename() catch block", () => {
    // This is hard to trigger but we can try with null or something
    expect(Filesystem.isValidFilename(null as any)).toBe(false)
  })

  test("normalizePath() handles errors", () => {
    // On Windows, realpathSync.native might fail
    if (process.platform === "win32") {
      expect(Filesystem.normalizePath("Z:\\non-existent")).toBe("Z:\\non-existent")
    }
  })

  test("nativePath() handles MSYS flag", () => {
    const original = Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS
    try {
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = true
      expect(Filesystem.nativePath("a/b")).toBe(Filesystem.normalize("a/b"))
    } finally {
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = original
    }
  })

  test("nativePath() experimental flag branch", () => {
    const original = Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS
    Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = true
    try {
      expect(Filesystem.nativePath("a/b")).toBe(Filesystem.normalize("a/b"))
    } finally {
      Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS = original
    }
  })

  test("normalizePath() windows branch", () => {
    if (process.platform !== "win32") return
    expect(Filesystem.normalizePath("C:\\")).toBeTruthy()
  })

  test("findUp() with OPENCODE_TEST_HOME", async () => {
    const original = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = process.cwd()
    try {
      const found = await Filesystem.findUp("package.json", process.cwd())
      expect(found).toBeTruthy()
    } finally {
      process.env.OPENCODE_TEST_HOME = original
    }
  })

  test("normalizeGitPath() handles empty input", () => {
    expect(Filesystem.normalizeGitPath("")).toBe("")
  })

  test("normalizeGitPath() handles dot", () => {
    const expected = path.resolve(".").replace(/\\/g, "/")
    expect(Filesystem.normalizeGitPath(".", true)).toBe(expected)
  })

  test("normalizeNativePath() handles empty input", () => {
    expect(Filesystem.normalizeNativePath("")).toBe("")
  })

  test("normalizeNativePath() with mock on Windows", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      expect(Filesystem.normalizeNativePath("a/b")).toContain("\\")
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  test("overlaps()", () => {
    expect(Filesystem.overlaps("/a/b", "/a/b/c")).toBe(true)
    expect(Filesystem.overlaps("/a/b/c", "/a/b")).toBe(true)
    expect(Filesystem.overlaps("/a/b", "/a/x")).toBe(false)
  })

  test("contains()", () => {
    expect(Filesystem.contains("/a", "/a/b")).toBe(true)
    expect(Filesystem.contains("/a/b", "/a")).toBe(false)
  })

  test("isValidFilename() catch block", () => {
    expect(Filesystem.isValidFilename(undefined as any)).toBe(false)
  })

  test("getCanonicalPath() handles errors", () => {
    expect(Filesystem.getCanonicalPath("")).toBe("")
  })

  test("validateFilepath() null bytes", () => {
    expect(Filesystem.validateFilepath("a\0b", "/tmp").valid).toBe(false)
  })

  test("join() handles undefined/null segments", () => {
    expect(Filesystem.join("a", undefined as any, "b")).toContain("a")
    expect(Filesystem.join("a", null as any, "b")).toContain("b")
    expect(Filesystem.join()).toBe("")
  })

  test("validateFilepath() traversal check", () => {
    const root = process.platform === "win32" ? "C:\\root" : "/root"
    const p = process.platform === "win32" ? "C:\\root\\..\\outside" : "/root/../outside"
    const result = Filesystem.validateFilepath(p, root)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("Path outside project directory")
  })

  test("platform specific branches", () => {
    const originalPlatform = process.platform
    try {
      // Mock Unix for coverage
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      expect(Filesystem.getCanonicalPath(".")).toBeTruthy()
      expect(Filesystem.normalizeNativePath("a\\b")).toBe("a\\b") // On linux, \ is a literal
      
      // Mock Windows for coverage
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      expect(Filesystem.normalizeNativePath("a/b")).toContain("\\")
      
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })
})
