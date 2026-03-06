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
import { Archive } from "../archive"
import { mkdir, writeFile, rm, stat } from "fs/promises"
import { join } from "path"

describe("Archive", () => {
  const testDir = join(import.meta.dir, "archive-test-temp")
  const zipFile = join(testDir, "test.zip")
  const extractDir = join(testDir, "extracted")

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(extractDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  // Helper function to check if zip command is available
  async function isZipAvailable(): Promise<boolean> {
    try {
      await Bun.$`zip --version`.quiet()
      return true
    } catch {
      return false
    }
  }

  describe("extractZip", () => {
    it("should extract a zip file on non-Windows platforms", async () => {
      // Skip on Windows since it uses PowerShell
      if (process.platform === "win32") {
        return
      }

      // Skip if zip command is not available
      if (!(await isZipAvailable())) {
        return
      }

      // Create a simple zip file using Bun
      const content = "test content"
      const innerFile = join(testDir, "inner.txt")
      await writeFile(innerFile, content)

      // Create zip using system zip command
      await Bun.$`zip -j ${zipFile} ${innerFile}`.quiet()

      // Extract
      await Archive.extractZip(zipFile, extractDir)

      // Verify extraction
      const extractedFile = join(extractDir, "inner.txt")
      const extractedContent = await Bun.file(extractedFile).text()
      expect(extractedContent).toBe(content)
    })

    it("should handle zip files with directories", async () => {
      if (process.platform === "win32") {
        return
      }

      // Skip if zip command is not available
      if (!(await isZipAvailable())) {
        return
      }

      // Create nested structure
      const nestedDir = join(testDir, "nested")
      await mkdir(nestedDir, { recursive: true })
      const nestedFile = join(nestedDir, "file.txt")
      await writeFile(nestedFile, "nested content")

      // Create zip
      await Bun.$`zip -r ${zipFile} ${nestedDir}`.quiet()

      // Extract
      await Archive.extractZip(zipFile, extractDir)

      // Verify directory exists
      const stats = await stat(join(extractDir, "nested"))
      expect(stats.isDirectory()).toBe(true)
    })

    it("should extract a zip file on Windows platforms", async () => {
      // Only run on Windows
      if (process.platform !== "win32") {
        return
      }

      // Skip if zip command is not available
      if (!(await isZipAvailable())) {
        return
      }

      // Create a simple zip file using Bun
      const content = "test content"
      const innerFile = join(testDir, "inner.txt")
      await writeFile(innerFile, content)

      // Create zip using system zip command
      await Bun.$`zip -j ${zipFile} ${innerFile}`.quiet()

      // Extract using Windows PowerShell
      await Archive.extractZip(zipFile, extractDir)

      // Verify extraction
      const extractedFile = join(extractDir, "inner.txt")
      const extractedContent = await Bun.file(extractedFile).text()
      expect(extractedContent).toBe(content)
    })

    it("should handle zip files with directories on Windows", async () => {
      if (process.platform !== "win32") {
        return
      }

      // Skip if zip command is not available
      if (!(await isZipAvailable())) {
        return
      }

      // Create nested structure
      const nestedDir = join(testDir, "nested")
      await mkdir(nestedDir, { recursive: true })
      const nestedFile = join(nestedDir, "file.txt")
      await writeFile(nestedFile, "nested content")

      // Create zip
      await Bun.$`zip -r ${zipFile} ${nestedDir}`.quiet()

      // Extract using Windows PowerShell
      await Archive.extractZip(zipFile, extractDir)

      // Verify directory exists
      const stats = await stat(join(extractDir, "nested"))
      expect(stats.isDirectory()).toBe(true)
    })

    it("should handle missing zip command gracefully", async () => {
      // This test verifies that the function handles the case where zip is not available
      // We'll create a mock zip file and test that the function handles errors appropriately
      if (await isZipAvailable()) {
        return // Skip if zip is available
      }

      // Create a mock zip file (just an empty file for testing)
      await writeFile(zipFile, "mock zip content")

      // The function should throw an error when it can't extract the zip file
      // This is expected behavior - we're testing that it fails appropriately
      await expect(Archive.extractZip(zipFile, extractDir)).rejects.toThrow()
    })
  })
})
