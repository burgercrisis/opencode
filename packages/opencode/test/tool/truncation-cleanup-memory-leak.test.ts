import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import { Truncate } from "../../src/tool/truncation"
import { Identifier } from "../../src/id/id"

describe("Truncation Cleanup Memory Leak Fix", () => {
  const testDir = path.join(process.cwd(), "test-truncation")
  const originalDir = Truncate.DIR

  beforeEach(async () => {
    // Override DIR for testing
    ; (Truncate as any).DIR = testDir

    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }

    // Restore original DIR
    ; (Truncate as any).DIR = originalDir
  })

  test("should handle empty directory gracefully", async () => {
    // Test with no files
    await Truncate.cleanup()

    // Should not throw and should complete successfully
    expect(true).toBe(true)
  })

  test("should clean up old files correctly", async () => {
    const now = Date.now()
    const oldTimestamp = now - (8 * 24 * 60 * 60 * 1000) // 8 days ago
    const recentTimestamp = now - (1 * 24 * 60 * 60 * 1000) // 1 day ago

    // Create test files with manual naming to avoid Identifier.timestamp issues
    const oldFile = path.join(testDir, `tool_old_${oldTimestamp}`)
    const recentFile = path.join(testDir, `tool_recent_${recentTimestamp}`)

    await fs.writeFile(oldFile, "old content")
    await fs.writeFile(recentFile, "recent content")

    // Mock Identifier.timestamp to return our test timestamps
    const originalTimestamp = Identifier.timestamp
    Identifier.timestamp = (id: string) => {
      if (id.includes('old_')) return oldTimestamp
      if (id.includes('recent_')) return recentTimestamp
      return Date.now()
    }

    try {
      // Run cleanup
      await Truncate.cleanup()

      // Old file should be deleted, recent file should remain
      const oldExists = await fs.access(oldFile).then(() => true).catch(() => false)
      const recentExists = await fs.access(recentFile).then(() => true).catch(() => false)

      expect(oldExists).toBe(false)
      expect(recentExists).toBe(true)
    } finally {
      // Restore original function
      Identifier.timestamp = originalTimestamp
    }
  })

  test("should handle permission errors by throwing", async () => {
    // Create a test file with manual naming
    const testFile = path.join(testDir, `tool_test_${Date.now() - 8 * 24 * 60 * 60 * 1000}`)
    await fs.writeFile(testFile, "test content")

    // Make directory read-only to simulate permission error
    await fs.chmod(testDir, 0o444)

    try {
      await Truncate.cleanup()
      throw new Error("Should have thrown an error")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("Truncation cleanup failed")
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(testDir, 0o755)
    }
  })

  test("should handle individual file deletion errors gracefully", async () => {
    const now = Date.now()
    const oldTimestamp1 = now - (8 * 24 * 60 * 60 * 1000)
    const oldTimestamp2 = now - (9 * 24 * 60 * 60 * 1000)

    // Create test files with manual naming
    const file1 = path.join(testDir, `tool_test1_${oldTimestamp1}`)
    const file2 = path.join(testDir, `tool_test2_${oldTimestamp2}`)

    await fs.writeFile(file1, "content 1")
    await fs.writeFile(file2, "content 2")

    // Make one file read-only to simulate deletion error
    await fs.chmod(file1, 0o444)

    // Mock Identifier.timestamp to return old timestamps for both files
    const originalTimestamp = Identifier.timestamp
    Identifier.timestamp = (id: string) => {
      if (id.includes('test1_')) return oldTimestamp1
      if (id.includes('test2_')) return oldTimestamp2
      return Date.now()
    }

    try {
      // Cleanup should complete despite one file deletion error
      await Truncate.cleanup()

      // File 2 should be deleted, file 1 might remain due to permission error
      const file1Exists = await fs.access(file1).then(() => true).catch(() => false)
      const file2Exists = await fs.access(file2).then(() => true).catch(() => false)

      expect(file2Exists).toBe(false)
      // File 1 might still exist due to permission error, but cleanup should not fail
    } finally {
      // Restore original function
      Identifier.timestamp = originalTimestamp
      // Restore file permissions for cleanup
      await fs.chmod(file1, 0o644).catch(() => { })
    }
  })

  test("should not silently fail on directory scanning errors", async () => {
    // Override DIR to a non-existent path that parent directory doesn't exist
    const nonExistentDir = path.join(process.cwd(), "non-existent", "subdir")
      ; (Truncate as any).DIR = nonExistentDir

    try {
      await Truncate.cleanup()
      throw new Error("Should have thrown an error for non-existent directory")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("Truncation cleanup failed")
    }
  })
})
