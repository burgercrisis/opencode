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
import { Patch } from "../index"

describe("Patch Module Basic Tests", () => {
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
  const testDir = path.join(process.cwd(), "test-patch-basic-temp")

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe("parsePatch", () => {
    it("should parse simple add file patch", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "add",
        path: "test.txt",
        contents: "Hello World"
      })
    })

    it("should throw error for invalid patch", () => {
      const patchText = "invalid patch"

      expect(() => Patch.parsePatch(patchText)).toThrow("Invalid patch format: missing Begin/End markers")
    })
  })

  describe("applyPatch", () => {
    it("should apply patch and return affected paths", async () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
*** End Patch`

      const result = await Patch.applyPatch(patchText)

      expect(result.added).toHaveLength(1)
      expect(result.added[0]).toContain("test.txt")
      expect(result.modified).toHaveLength(0)
      expect(result.deleted).toHaveLength(0)
    })
  })

  describe("safeParsePatch", () => {
    it("should return success for valid patch", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
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
})
