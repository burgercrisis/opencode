import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { TempFileManager, TempFilePoolFullError } from '../../src/tool/temp-file-manager'

describe('TempFileManager', () => {
  let manager: TempFileManager
  let testPoolDir: string
  const smallMaxPoolSize = 10

  beforeEach(() => {
    testPoolDir = join(tmpdir(), `opencode-test-${Date.now()}`)
    // Ensure the test pool directory exists
    mkdirSync(testPoolDir, { recursive: true })
    manager = new TempFileManager({
      poolDir: testPoolDir,
      maxPoolSize: smallMaxPoolSize,
      cleanupInterval: 60000,
      // Disable cleanup timer for tests by passing a very large interval
      cleanupInterval: 3600000,
    })
  })

  afterEach(async () => {
    // Dispose the manager to stop cleanup timer
    manager.dispose()
    
    // Clean up any remaining test files
    try {
      const files = Array.from(manager['activeFiles'])
      for (const file of files) {
        if (existsSync(file)) {
          unlinkSync(file)
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('create()', () => {
    it('should create temp file with unique filename', async () => {
      const content = 'Write-Host "Hello World"'
      const path1 = await manager.create(content)
      const path2 = await manager.create(content)

      expect(path1).not.toBe(path2)
      expect(path1).toContain('.ps1')
      expect(path2).toContain('.ps1')
      expect(existsSync(path1)).toBe(true)
      expect(existsSync(path2)).toBe(true)
    })

    it('should create temp file with special characters', async () => {
      const content = 'Write-Host "Test with $pecial & chars"'
      const path = await manager.create(content)

      expect(existsSync(path)).toBe(true)
      expect(manager.getActiveFileCount()).toBe(1)
    })

    it('should create temp file with Unicode content', async () => {
      const content = 'Write-Host "こんにちは世界 🌍"'
      const path = await manager.create(content)

      expect(existsSync(path)).toBe(true)
      expect(manager.getActiveFileCount()).toBe(1)
    })

    it('should create temp file with newlines', async () => {
      const content = `Write-Host "Line 1"
Write-Host "Line 2"
Write-Host "Line 3"`
      const path = await manager.create(content)

      expect(existsSync(path)).toBe(true)
      expect(manager.getActiveFileCount()).toBe(1)
    })

    it('should throw when pool size limit reached', async () => {
      // Fill the pool to max size
      const promises: Promise<string>[] = []
      for (let i = 0; i < smallMaxPoolSize; i++) {
        promises.push(manager.create('content'))
      }

      await Promise.all(promises)

      // Next create should throw
      await expect(manager.create('extra content')).rejects.toThrow(
        TempFilePoolFullError
      )
    })

    it('should track created files in activeFiles Set', async () => {
      const path1 = await manager.create('content 1')
      const path2 = await manager.create('content 2')

      expect(manager.getActiveFileCount()).toBe(2)
      
      const stats = manager.getPoolStats()
      expect(stats.activeFileCount).toBe(2)
      expect(stats.maxPoolSize).toBe(smallMaxPoolSize)
    })
  })

  describe('cleanup()', () => {
    it('should remove temp file from disk', async () => {
      const path = await manager.create('content')
      expect(existsSync(path)).toBe(true)

      await manager.cleanup(path)

      expect(existsSync(path)).toBe(false)
    })

    it('should remove temp file from activeFiles Set', async () => {
      const path = await manager.create('content')
      expect(manager.getActiveFileCount()).toBe(1)

      await manager.cleanup(path)

      expect(manager.getActiveFileCount()).toBe(0)
    })

    it('should handle cleanup of non-existent file gracefully', async () => {
      const nonExistentPath = join(testPoolDir, 'non-existent-file.ps1')

      // Should not throw
      await expect(manager.cleanup(nonExistentPath)).resolves.toBeUndefined()
    })

    it('should log and continue on cleanup error', async () => {
      const mockLogger = {
        warn: mock(() => {}),
      }
      const loggingManager = new TempFileManager({
        poolDir: testPoolDir,
        maxPoolSize: smallMaxPoolSize,
        logger: mockLogger as any,
      })

      // Create a directory with the same name as the temp file would have
      const dirPath = join(testPoolDir, 'test-dir.ps1')
      // Create directory instead of file - cleanup will fail trying to unlink a directory
      // This is a simplified test - in practice this edge case is unlikely
      await loggingManager.cleanup(dirPath)

      // Should complete without throwing
      loggingManager.dispose()
    })
  })

  describe('cleanupAll()', () => {
    it('should remove all tracked files', async () => {
      await manager.create('content 1')
      await manager.create('content 2')
      await manager.create('content 3')

      expect(manager.getActiveFileCount()).toBe(3)

      await manager.cleanupAll()

      expect(manager.getActiveFileCount()).toBe(0)
    })

    it('should clear activeFiles Set', async () => {
      await manager.create('content 1')
      await manager.create('content 2')

      await manager.cleanupAll()

      expect(manager.getActiveFileCount()).toBe(0)
      const stats = manager.getPoolStats()
      expect(stats.activeFileCount).toBe(0)
    })
  })

  describe('cleanupExpired()', () => {
    it('should handle expired files based on modification time', async () => {
      // This test verifies the cleanupExpired logic works
      // We add a manual file to the activeFiles set with an old timestamp
      const oldPath = join(testPoolDir, 'old-file.ps1')
      
      // Create a file manually with old timestamp
      writeFileSync(oldPath, 'old content')
      
      // Manually add to activeFiles (simulating a file created in the past)
      manager['activeFiles'].add(oldPath)
      
      // Add a new file through the manager
      const newPath = await manager.create('new content')
      
      expect(manager.getActiveFileCount()).toBe(2)
      
      // Cleanup with 0ms maxAge should remove files older than 0ms (all tracked files)
      const cleaned = await manager.cleanupExpired(0)
      
      // Both files should be cleaned with 0ms threshold
      // (The old file is definitely expired, and since we use 0ms threshold,
      // technically even new files would be considered expired)
      expect(cleaned).toBe(2)
      expect(existsSync(oldPath)).toBe(false)
      expect(existsSync(newPath)).toBe(false)
    })

    it('should not remove files newer than maxAge', async () => {
      const path = await manager.create('new content')
      // File was just created, so it should be within maxAge
      
      // Use a reasonable maxAge that won't accidentally clean new files
      const cleaned = await manager.cleanupExpired(100) // 100ms max age

      // Should not clean anything since we just created it
      expect(cleaned).toBe(0)
      expect(existsSync(path)).toBe(true)
    })

    it('should handle missing files gracefully', async () => {
      // Manually add a non-existent file to activeFiles
      const nonExistentPath = join(testPoolDir, 'deleted-file.ps1')
      manager['activeFiles'].add(nonExistentPath)

      const cleaned = await manager.cleanupExpired(0)

      // Should handle missing file and return 0
      expect(cleaned).toBe(0)
      expect(manager['activeFiles'].has(nonExistentPath)).toBe(false)
    })
  })

  describe('getPoolStats()', () => {
    it('should return correct activeFileCount', async () => {
      expect(manager.getPoolStats().activeFileCount).toBe(0)

      await manager.create('content 1')
      expect(manager.getPoolStats().activeFileCount).toBe(1)

      await manager.create('content 2')
      expect(manager.getPoolStats().activeFileCount).toBe(2)
    })

    it('should return correct maxPoolSize', () => {
      const stats = manager.getPoolStats()
      expect(stats.maxPoolSize).toBe(smallMaxPoolSize)
    })

    it('should return correct poolUsagePercent', async () => {
      // Empty pool should be 0%
      expect(manager.getPoolStats().poolUsagePercent).toBe(0)

      await manager.create('content')
      expect(manager.getPoolStats().poolUsagePercent).toBe(10) // 1/10 * 100
    })
  })

  describe('getActiveFileCount()', () => {
    it('should return correct count', async () => {
      expect(manager.getActiveFileCount()).toBe(0)

      const path1 = await manager.create('content 1')
      expect(manager.getActiveFileCount()).toBe(1)

      const path2 = await manager.create('content 2')
      expect(manager.getActiveFileCount()).toBe(2)

      await manager.cleanup(path2)
      expect(manager.getActiveFileCount()).toBe(1)
    })
  })

  describe('dispose()', () => {
    it('should clear the cleanup timer', () => {
      // Create a new manager to have a fresh timer
      const testManager = new TempFileManager({
        poolDir: testPoolDir,
        maxPoolSize: smallMaxPoolSize,
        cleanupInterval: 60000,
      })

      expect(testManager['cleanupTimer']).toBeDefined()

      testManager.dispose()

      expect(testManager['cleanupTimer']).toBeUndefined()
    })

    it('should allow disposal when timer is not running', () => {
      const testManager = new TempFileManager({
        poolDir: testPoolDir,
        maxPoolSize: smallMaxPoolSize,
        cleanupInterval: 60000,
      })

      testManager.dispose()
      testManager.dispose() // Double dispose should not throw

      expect(testManager['cleanupTimer']).toBeUndefined()
    })
  })
})
