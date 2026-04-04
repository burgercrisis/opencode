import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { FileTime } from "../time"
import { Instance } from "../../project/instance"
import { Flag } from "../../flag/flag"

describe("FileTime", () => {
  beforeEach(() => {
    // Reset the FileTime state before each test
    const mockState = {
      read: {},
      locks: new Map()
    }
    
    mock(async () => {
      const mod = await import("../time")
      return {
        ...mod.FileTime,
        state: () => mockState
      }
    })()
  })

  afterEach(() => {
    // Clean up any locks
    const currentState = FileTime.state()
    currentState.locks.clear()
  })

  describe("read function", () => {
    it("should record file read time for session", () => {
      const sessionId = "test-session-1"
      const filepath = "/test/file.txt"
      
      FileTime.read(sessionId, filepath)
      
      const recordedTime = FileTime.get(sessionId, filepath)
      expect(recordedTime).toBeInstanceOf(Date)
      expect(recordedTime?.getTime()).toBeGreaterThan(0)
    })

    it("should handle multiple files for same session", () => {
      const sessionId = "test-session-2"
      const file1 = "/test/file1.txt"
      const file2 = "/test/file2.txt"
      
      FileTime.read(sessionId, file1)
      FileTime.read(sessionId, file2)
      
      const time1 = FileTime.get(sessionId, file1)
      const time2 = FileTime.get(sessionId, file2)
      
      expect(time1).toBeInstanceOf(Date)
      expect(time2).toBeInstanceOf(Date)
      expect(time1?.getTime()).toBeGreaterThan(0)
      expect(time2?.getTime()).toBeGreaterThan(0)
    })

    it("should handle multiple sessions for same file", () => {
      const sessionId1 = "test-session-3a"
      const sessionId2 = "test-session-3b"
      const filepath = "/test/shared.txt"
      
      // Read file in first session
      FileTime.read(sessionId1, filepath)
      const time1 = FileTime.get(sessionId1, filepath)
      
      // Wait a bit and read in second session
      setTimeout(() => {
        FileTime.read(sessionId2, filepath)
        const time2 = FileTime.get(sessionId2, filepath)
        
        expect(time1).toBeInstanceOf(Date)
        expect(time2).toBeInstanceOf(Date)
        expect(time2?.getTime()).toBeGreaterThanOrEqual(time1?.getTime() || 0)
      }, 10)
    })

    it("should initialize session read object if not exists", () => {
      const sessionId = "test-session-4"
      const filepath = "/test/new.txt"
      
      // Should not throw when session doesn't exist
      expect(() => FileTime.read(sessionId, filepath)).not.toThrow()
      
      const recordedTime = FileTime.get(sessionId, filepath)
      expect(recordedTime).toBeInstanceOf(Date)
    })
  })

  describe("get function", () => {
    it("should return recorded time for existing session and file", () => {
      const sessionId = "test-session-5"
      const filepath = "/test/existing.txt"
      const testTime = new Date("2023-01-01T00:00:00Z")
      
      // Manually set the time
      FileTime.read(sessionId, filepath)
      
      const recordedTime = FileTime.get(sessionId, filepath)
      expect(recordedTime).toBeInstanceOf(Date)
    })

    it("should return undefined for non-existent session", () => {
      const sessionId = "non-existent-session"
      const filepath = "/test/file.txt"
      
      const time = FileTime.get(sessionId, filepath)
      expect(time).toBeUndefined()
    })

    it("should return undefined for non-existent file", () => {
      const sessionId = "test-session-6"
      const filepath = "/non-existent/file.txt"
      
      const time = FileTime.get(sessionId, filepath)
      expect(time).toBeUndefined()
    })

    it("should return undefined for existing session but non-existent file", () => {
      const sessionId = "test-session-7"
      const existingFile = "/test/existing.txt"
      const nonExistentFile = "/test/non-existent.txt"
      
      FileTime.read(sessionId, existingFile)
      
      const existingTime = FileTime.get(sessionId, existingFile)
      const nonExistentTime = FileTime.get(sessionId, nonExistentFile)
      
      expect(existingTime).toBeInstanceOf(Date)
      expect(nonExistentTime).toBeUndefined()
    })
  })

  describe("withLock function", () => {
    it("should execute function with lock", async () => {
      const filepath = "/test/lock.txt"
      let executed = false
      
      const result = await FileTime.withLock(filepath, async () => {
        executed = true
        return "test-result"
      })
      
      expect(executed).toBe(true)
      expect(result).toBe("test-result")
    })

    it("should serialize concurrent access to same file", async () => {
      const filepath = "/test/concurrent.txt"
      const results: string[] = []
      
      // Start multiple concurrent operations
      const promises = Array.from({ length: 5 }, (_, i) => 
        FileTime.withLock(filepath, async () => {
          results.push(`operation-${i}`)
          await new Promise(resolve => setTimeout(resolve, 10))
          return `result-${i}`
        })
      )
      
      await Promise.all(promises)
      
      // All operations should have executed
      expect(results).toHaveLength(5)
      expect(results[0]).toBe("operation-0")
      expect(results[1]).toBe("operation-1")
      expect(results[2]).toBe("operation-2")
      expect(results[3]).toBe("operation-3")
      expect(results[4]).toBe("operation-4")
    })

    it("should handle different files concurrently", async () => {
      const file1 = "/test/file1.txt"
      const file2 = "/test/file2.txt"
      let file1Executed = false
      let file2Executed = false
      
      const promise1 = FileTime.withLock(file1, async () => {
        file1Executed = true
        await new Promise(resolve => setTimeout(resolve, 10))
        return "result1"
      })
      
      const promise2 = FileTime.withLock(file2, async () => {
        file2Executed = true
        await new Promise(resolve => setTimeout(resolve, 10))
        return "result2"
      })
      
      const [result1, result2] = await Promise.all([promise1, promise2])
      
      expect(file1Executed).toBe(true)
      expect(file2Executed).toBe(true)
      expect(result1).toBe("result1")
      expect(result2).toBe("result2")
    })

    it("should handle function throwing error", async () => {
      const filepath = "/test/error.txt"
      const testError = new Error("Test error")
      
      await expect(FileTime.withLock(filepath, async () => {
        throw testError
      })).rejects.toThrow("Test error")
    })

    it("should clean up lock after function completes", async () => {
      const filepath = "/test/cleanup.txt"
      
      await FileTime.withLock(filepath, async () => {
        // Function completes successfully
      })
      
      // Lock should be cleaned up (no easy way to test this directly)
      // But we can ensure subsequent operations work
      await expect(FileTime.withLock(filepath, async () => {
        return "success"
      })).resolves.toBe("success")
    })

    it("should clean up lock after function throws", async () => {
      const filepath = "/test/cleanup-error.txt"
      
      try {
        await FileTime.withLock(filepath, async () => {
          throw new Error("Test error")
        })
      } catch (error) {
        expect(error.message).toBe("Test error")
      }
      
      // Lock should still be cleaned up
      await expect(FileTime.withLock(filepath, async () => {
        return "success-after-error"
      })).resolves.toBe("success-after-error")
    })
  })

  describe("assert function", () => {
    beforeEach(() => {
      // Mock Flag to be false by default
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_DISABLE_FILETIME_CHECK: false
        }
      })()
    })

    it("should pass when file was read and not modified", async () => {
      const sessionId = "test-session-8"
      const filepath = "/test/valid.txt"
      const readTime = new Date()
      const mockMtime = new Date(readTime.getTime() + 1000) // 1 second later
      
      // Set up the state
      FileTime.read(sessionId, filepath)
      
      // Mock Filesystem.stat
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          stat: () => ({ mtime: mockMtime })
        }
      })()
      
      // Should not throw
      await expect(FileTime.assert(sessionId, filepath)).resolves.toBeUndefined()
    })

    it("should throw when file was not read", async () => {
      const sessionId = "test-session-9"
      const filepath = "/test/not-read.txt"
      
      // Don't read the file
      
      await expect(FileTime.assert(sessionId, filepath)).rejects.toThrow(
        "You must read file /test/not-read.txt before overwriting it. Use Read tool first"
      )
    })

    it("should throw when file was modified after read", async () => {
      const sessionId = "test-session-10"
      const filepath = "/test/modified.txt"
      const readTime = new Date("2023-01-01T00:00:00Z")
      const mockMtime = new Date("2023-01-01T00:01:00Z") // 1 minute later
      
      // Set up the state
      FileTime.read(sessionId, filepath)
      
      // Mock Filesystem.stat
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          stat: () => ({ mtime: mockMtime })
        }
      })()
      
      await expect(FileTime.assert(sessionId, filepath)).rejects.toThrow(
        /File .* has been modified since it was last read/
      )
    })

    it("should include timestamps in error message", async () => {
      const sessionId = "test-session-11"
      const filepath = "/test/timestamps.txt"
      const readTime = new Date("2023-01-01T00:00:00Z")
      const mockMtime = new Date("2023-01-01T00:01:00Z")
      
      FileTime.read(sessionId, filepath)
      
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          stat: () => ({ mtime: mockMtime })
        }
      })()
      
      try {
        await FileTime.assert(sessionId, filepath)
      } catch (error) {
        expect(error.message).toContain(readTime.toISOString())
        expect(error.message).toContain(mockMtime.toISOString())
      }
    })

    it("should pass when OPENCODE_DISABLE_FILETIME_CHECK is true", async () => {
      const sessionId = "test-session-12"
      const filepath = "/test/disabled.txt"
      
      // Enable the flag
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_DISABLE_FILETIME_CHECK: true
        }
      })()
      
      // Don't read the file and don't mock stat
      // Should still pass because checks are disabled
      await expect(FileTime.assert(sessionId, filepath)).resolves.toBeUndefined()
    })

    it("should handle missing mtime", async () => {
      const sessionId = "test-session-13"
      const filepath = "/test/no-mtime.txt"
      const readTime = new Date()
      
      FileTime.read(sessionId, filepath)
      
      // Mock Filesystem.stat to return undefined mtime
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          stat: () => ({ mtime: undefined })
        }
      })()
      
      // Should pass when mtime is undefined
      await expect(FileTime.assert(sessionId, filepath)).resolves.toBeUndefined()
    })
  })

  describe("state management", () => {
    it("should maintain separate read times for different sessions", () => {
      const session1 = "session-1"
      const session2 = "session-2"
      const filepath = "/test/shared.txt"
      
      FileTime.read(session1, filepath)
      const time1 = FileTime.get(session1, filepath)
      
      // Read same file in different session
      FileTime.read(session2, filepath)
      const time2 = FileTime.get(session2, filepath)
      
      expect(time1).toBeInstanceOf(Date)
      expect(time2).toBeInstanceOf(Date)
      expect(time2?.getTime()).toBeGreaterThanOrEqual(time1?.getTime() || 0)
    })

    it("should maintain locks independently of read times", () => {
      const sessionId = "session-locks"
      const filepath = "/test/locks.txt"
      
      // Read file
      FileTime.read(sessionId, filepath)
      const readTime = FileTime.get(sessionId, filepath)
      expect(readTime).toBeInstanceOf(Date)
      
      // Use lock - should not affect read time
      await FileTime.withLock(filepath, async () => {
        const timeAfterLock = FileTime.get(sessionId, filepath)
        expect(timeAfterLock).toEqual(readTime)
      })
    })
  })

  describe("edge cases", () => {
    it("should handle empty session ID", () => {
      const sessionId = ""
      const filepath = "/test/empty-session.txt"
      
      expect(() => FileTime.read(sessionId, filepath)).not.toThrow()
      
      const time = FileTime.get(sessionId, filepath)
      expect(time).toBeInstanceOf(Date)
    })

    it("should handle empty filepath", () => {
      const sessionId = "test-session-empty-path"
      const filepath = ""
      
      expect(() => FileTime.read(sessionId, filepath)).not.toThrow()
      
      const time = FileTime.get(sessionId, filepath)
      expect(time).toBeInstanceOf(Date)
    })

    it("should handle special characters in filepath", () => {
      const sessionId = "test-session-special"
      const filepath = "/test/file with spaces.txt"
      
      expect(() => FileTime.read(sessionId, filepath)).not.toThrow()
      
      const time = FileTime.get(sessionId, filepath)
      expect(time).toBeInstanceOf(Date)
    })

    it("should handle concurrent operations on same file", async () => {
      const sessionId = "test-session-concurrent"
      const filepath = "/test/concurrent-ops.txt"
      const results: number[] = []
      
      // Start multiple operations
      const operations = Array.from({ length: 10 }, (_, i) => 
        FileTime.withLock(filepath, async () => {
          results.push(i)
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
          return i
        })
      )
      
      await Promise.all(operations)
      
      // All operations should complete
      expect(results).toHaveLength(10)
      expect(new Set(results).size).toBe(10) // All unique
    })
  })
})
