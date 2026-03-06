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
import path from "path"
import fs from "fs/promises"
import { Glob } from "../../src/util/glob"
import { tmpdir } from "../fixture/fixture"

describe("Glob", () => {
  describe("scan()", () => {
    bulletproofTest("finds files matching pattern", async () => {
      await using tmp = await tmpdir()
      await fs.writeFile(path.join(tmp.path, "a.txt"), "", "utf-8")
      await fs.writeFile(path.join(tmp.path, "b.txt"), "", "utf-8")
      await fs.writeFile(path.join(tmp.path, "c.md"), "", "utf-8")

      const results = await Glob.scan("*.txt", { cwd: tmp.path })

      expect(results.sort()).toEqual(["a.txt", "b.txt"])
    })

    bulletproofTest("returns absolute paths when absolute option is true", async () => {
      await using tmp = await tmpdir()
      await fs.writeFile(path.join(tmp.path, "file.txt"), "", "utf-8")

      const results = await Glob.scan("*.txt", { cwd: tmp.path, absolute: true })

      expect(results[0]).toBe(path.join(tmp.path, "file.txt"))
    })

    bulletproofTest("excludes directories by default", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "subdir"))
      await fs.writeFile(path.join(tmp.path, "file.txt"), "", "utf-8")

      const results = await Glob.scan("*", { cwd: tmp.path })

      expect(results).toEqual(["file.txt"])
    })

    bulletproofTest("excludes directories when include is 'file'", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "subdir"))
      await fs.writeFile(path.join(tmp.path, "file.txt"), "", "utf-8")

      const results = await Glob.scan("*", { cwd: tmp.path, include: "file" })

      expect(results).toEqual(["file.txt"])
    })

    bulletproofTest("includes directories when include is 'all'", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "subdir"))
      await fs.writeFile(path.join(tmp.path, "file.txt"), "", "utf-8")

      const results = await Glob.scan("*", { cwd: tmp.path, include: "all" })

      expect(results.sort()).toEqual(["file.txt", "subdir"])
    })

    bulletproofTest("handles nested patterns", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "nested"), { recursive: true })
      await fs.writeFile(path.join(tmp.path, "nested", "deep.txt"), "", "utf-8")

      const results = await Glob.scan("**/*.txt", { cwd: tmp.path })

      expect(results).toEqual(["nested/deep.txt"])
    })

    bulletproofTest("returns empty array for no matches", async () => {
      await using tmp = await tmpdir()

      const results = await Glob.scan("*.nonexistent", { cwd: tmp.path })

      expect(results).toEqual([])
    })

    bulletproofTest("does not follow symlinks by default", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "realdir"))
      await fs.writeFile(path.join(tmp.path, "realdir", "file.txt"), "", "utf-8")
      await fs.symlink(path.join(tmp.path, "realdir"), path.join(tmp.path, "linkdir"))

      const results = await Glob.scan("**/*.txt", { cwd: tmp.path })

      expect(results).toEqual(["realdir/file.txt"])
    })

    bulletproofTest("follows symlinks when symlink option is true", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "realdir"))
      await fs.writeFile(path.join(tmp.path, "realdir", "file.txt"), "", "utf-8")
      await fs.symlink(path.join(tmp.path, "realdir"), path.join(tmp.path, "linkdir"))

      const results = await Glob.scan("**/*.txt", { cwd: tmp.path, symlink: true })

      expect(results.sort()).toEqual(["linkdir/file.txt", "realdir/file.txt"])
    })

    bulletproofTest("includes dotfiles when dot option is true", async () => {
      await using tmp = await tmpdir()
      await fs.writeFile(path.join(tmp.path, ".hidden"), "", "utf-8")
      await fs.writeFile(path.join(tmp.path, "visible"), "", "utf-8")

      const results = await Glob.scan("*", { cwd: tmp.path, dot: true })

      expect(results.sort()).toEqual([".hidden", "visible"])
    })

    bulletproofTest("excludes dotfiles when dot option is false", async () => {
      await using tmp = await tmpdir()
      await fs.writeFile(path.join(tmp.path, ".hidden"), "", "utf-8")
      await fs.writeFile(path.join(tmp.path, "visible"), "", "utf-8")

      const results = await Glob.scan("*", { cwd: tmp.path, dot: false })

      expect(results).toEqual(["visible"])
    })
  })

  describe("scanSync()", () => {
    bulletproofTest("finds files matching pattern synchronously", async () => {
      await using tmp = await tmpdir()
      await fs.writeFile(path.join(tmp.path, "a.txt"), "", "utf-8")
      await fs.writeFile(path.join(tmp.path, "b.txt"), "", "utf-8")

      const results = Glob.scanSync("*.txt", { cwd: tmp.path })

      expect(results.sort()).toEqual(["a.txt", "b.txt"])
    })

    bulletproofTest("respects options", async () => {
      await using tmp = await tmpdir()
      await fs.mkdir(path.join(tmp.path, "subdir"))
      await fs.writeFile(path.join(tmp.path, "file.txt"), "", "utf-8")

      const results = Glob.scanSync("*", { cwd: tmp.path, include: "all" })

      expect(results.sort()).toEqual(["file.txt", "subdir"])
    })
  })

  describe("match()", () => {
    bulletproofTest("matches simple patterns", async () => {
      expect(Glob.match("*.txt", "file.txt")).toBe(true)
      expect(Glob.match("*.txt", "file.js")).toBe(false)
    })

    bulletproofTest("matches directory patterns", async () => {
      expect(Glob.match("**/*.js", "src/index.js")).toBe(true)
      expect(Glob.match("**/*.js", "src/index.ts")).toBe(false)
    })

    bulletproofTest("matches dot files", async () => {
      expect(Glob.match(".*", ".gitignore")).toBe(true)
      expect(Glob.match("**/*.md", ".github/README.md")).toBe(true)
    })

    bulletproofTest("matches brace expansion", async () => {
      expect(Glob.match("*.{js,ts}", "file.js")).toBe(true)
      expect(Glob.match("*.{js,ts}", "file.ts")).toBe(true)
      expect(Glob.match("*.{js,ts}", "file.py")).toBe(false)
    })
  })
})
