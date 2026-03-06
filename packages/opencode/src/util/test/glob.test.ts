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
import { Glob } from "../glob"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"

describe("Glob", () => {
  const testDir = join(import.meta.dir, "glob-test-temp")
  
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "subdir"), { recursive: true })
    await writeFile(join(testDir, "file1.ts"), "")
    await writeFile(join(testDir, "file2.js"), "")
    await writeFile(join(testDir, "subdir", "file3.ts"), "")
    await writeFile(join(testDir, ".dotfile"), "")
  })
  
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })
  
  describe("scan", () => {
    it("should scan for files matching pattern", async () => {
      const files = await Glob.scan("*.ts", { cwd: testDir })
      expect(files).toContain("file1.ts")
      expect(files).not.toContain("file2.js")
    })
    
    it("should scan recursively", async () => {
      const files = await Glob.scan("**/*.ts", { cwd: testDir })
      expect(files.length).toBeGreaterThan(0)
    })
    
    it("should return absolute paths when absolute option is true", async () => {
      const files = await Glob.scan("*.ts", { cwd: testDir, absolute: true })
      expect(files[0]).toContain(testDir)
    })
    
    it("should include dot files when dot option is true", async () => {
      const files = await Glob.scan(".*", { cwd: testDir, dot: true })
      expect(files).toContain(".dotfile")
    })
    
    it("should include directories when include is 'all'", async () => {
      const entries = await Glob.scan("*", { cwd: testDir, include: "all" })
      expect(entries).toContain("subdir")
    })
  })
  
  describe("scanSync", () => {
    it("should synchronously scan for files", () => {
      const files = Glob.scanSync("*.ts", { cwd: testDir })
      expect(files).toContain("file1.ts")
    })
    
    it("should work with absolute paths", () => {
      const files = Glob.scanSync("*.ts", { cwd: testDir, absolute: true })
      expect(files[0]).toContain(testDir)
    })
  })
  
  describe("match", () => {
    it("should match exact file names", () => {
      expect(Glob.match("file.ts", "file.ts")).toBe(true)
      expect(Glob.match("other.ts", "file.ts")).toBe(false)
    })
    
    it("should match wildcards with minimatch", () => {
      // minimatch uses different syntax - ** for any path, * for any filename
      // match(pattern, filepath) - pattern first, then filepath
      expect(Glob.match("*.ts", "file.ts")).toBe(true)
      expect(Glob.match("**/*.ts", "path/file.ts")).toBe(true)
    })
    
    it("should match dot files", () => {
      // minimatch with dot: true matches dot files
      expect(Glob.match(".*", ".dotfile")).toBe(true)
      expect(Glob.match(".hidden", ".hidden")).toBe(true)
    })
  })
})