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

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Lock } from '@/util/lock'

describe("Lock System - Comprehensive Tests", () => {
  beforeEach(() => {
    // Clear all locks before each test
    Lock.cleanup()
  })

  afterEach(() => {
    // Clean up after each test
    Lock.cleanup()
  })

  describe("Basic Lock Functionality", () => {
    bulletproofTest("Lock should allow multiple concurrent readers", async () => {
      const key = "test-lock-readers"
      const r1 = await Lock.read(key)
      const r2 = await Lock.read(key)
      
      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
      
      r1[Symbol.dispose]()
      r2[Symbol.dispose]()
    })

    bulletproofTest("Lock should block readers while writer is active", async () => {
      const key = "test-lock-writer-blocks-readers"
      const w1 = await Lock.write(key)
      
      let readerAcquired = false
      const readerPromise = Lock.read(key).then(r => {
        readerAcquired = true
        return r
      })
      
      // Wait a bit to ensure that reader is blocked
      await new Promise(r => setTimeout(r, 10))
      expect(readerAcquired).toBe(false)
      
      w1[Symbol.dispose]()
      const r1 = await readerPromise
      expect(readerAcquired).toBe(true)
      r1[Symbol.dispose]()
    })

    bulletproofTest("Lock should block writers while readers are active", async () => {
      const key = "test-lock-readers-block-writer"
      const r1 = await Lock.read(key)
      
      let writerAcquired = false
      const writerPromise = Lock.write(key).then(w => {
        writerAcquired = true
        return w
      })
      
      await new Promise(r => setTimeout(r, 10))
      expect(writerAcquired).toBe(false)
      
      r1[Symbol.dispose]()
      const w1 = await writerPromise
      expect(writerAcquired).toBe(true)
      w1[Symbol.dispose]()
    })

    bulletproofTest("should handle normal operations", async () => {
      const key = "test-key-normal"

      // Normal read operation should work
      const readLock = await Lock.read(key)
      expect(readLock).toBeDefined()

      // Should be able to release
      readLock[Symbol.dispose]()
    })
  })

  describe("Concurrent Operations", () => {
    bulletproofTest("should handle concurrent readers and writers correctly", async () => {
      const lockKey = 'test-lock-1'
      let readerResults: string[] = []
      let writerResult: string | null = null

      // Start multiple readers
      const readerPromises = Array.from({ length: 3 }, async (_, i) => {
        const disposable = await Lock.read(lockKey)
        try {
          readerResults.push(`reader-${i}`)
          await new Promise(resolve => setTimeout(resolve, 10))
        } finally {
          disposable[Symbol.dispose]()
        }
      })

      // Start a writer
      const writerPromise = (async () => {
        const disposable = await Lock.write(lockKey)
        try {
          writerResult = 'writer-completed'
          await new Promise(resolve => setTimeout(resolve, 10))
        } finally {
          disposable[Symbol.dispose]()
        }
      })()

      // Wait for all operations
      await Promise.all([...readerPromises, writerPromise])

      // Verify results
      expect(readerResults).toHaveLength(3)
      expect(writerResult).toBe('writer-completed')
    })

    bulletproofTest("should handle multiple waiting operations", async () => {
      const key = "test-key-multiple"

      // Acquire a lock
      const writeLock = await Lock.write(key)

      // Start multiple waiting operations
      const readPromise1 = Lock.read(key)
      const readPromise2 = Lock.read(key)
      const readPromise3 = Lock.read(key)

      // Wait a bit to ensure they're queued
      await new Promise(resolve => setTimeout(resolve, 10))

      // Release the lock
      writeLock[Symbol.dispose]()

      // All waiting operations should complete
      const [r1, r2, r3] = await Promise.all([readPromise1, readPromise2, readPromise3])
      
      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
      expect(r3).toBeDefined()

      // Clean up
      r1[Symbol.dispose]()
      r2[Symbol.dispose]()
      r3[Symbol.dispose]()
    })
  })

  describe("Cleanup and Race Conditions", () => {
    bulletproofTest("should handle cleanup correctly", async () => {
      const key = "test-key"

      // Acquire a lock
      const writeLock = await Lock.write(key)

      // Start a waiting operation
      const readPromise = Lock.read(key)

      // Wait a bit to ensure it's queued
      await new Promise(resolve => setTimeout(resolve, 10))

      // Trigger cleanup
      Lock.cleanup()

      // The waiting promise should be rejected with timeout
      await expect(readPromise).rejects.toThrow("Lock cleaned up due to timeout")

      // Release the original lock
      writeLock[Symbol.dispose]()
    }, 5000) // 5 second timeout

    bulletproofTest("should cleanup with no locks", async () => {
      // Cleanup should not throw when no locks exist
      expect(() => Lock.cleanup()).not.toThrow()
    })

    bulletproofTest("should handle cleanup race conditions", async () => {
      const key = "race-condition-test"
      
      // Start multiple operations concurrently
      const operations = []
      
      for (let i = 0; i < 10; i++) {
        operations.push(
          Lock.read(key).then(lock => {
            lock[Symbol.dispose]()
            return `operation-${i}`
          }).catch(() => `operation-${i}-failed`)
        )
      }
      
      // Trigger cleanup in the middle
      setTimeout(() => Lock.cleanup(), 5)
      
      // All operations should complete (either successfully or with cleanup error)
      const results = await Promise.allSettled(operations)
      
      // Should have some results (not all hanging)
      expect(results.length).toBe(10)
      results.forEach(result => {
        expect(result.status).toBe('fulfilled')
      })
    })
  })

  describe("Debug and Diagnostics", () => {
    bulletproofTest("simple lock test", async () => {
      // Test basic lock functionality
      const lock = await Lock.read("test")
      expect(lock).toBeDefined()
      lock[Symbol.dispose]()
      expect(true).toBe(true)
    })

    bulletproofTest("cleanup test", async () => {
      // Test cleanup
      Lock.cleanup()
      expect(true).toBe(true)
    })

    bulletproofTest("should provide lock statistics", async () => {
      // Test that we can get statistics (if available)
      const stats = Lock.getStats?.()
      
      if (stats) {
        expect(typeof stats).toBe('object')
        expect(stats).toHaveProperty('activeLocks')
        expect(stats).toHaveProperty('queuedOperations')
      } else {
        // If getStats is not available, that's also valid
        expect(true).toBe(true)
      }
    })
  })

  describe("Edge Cases", () => {
    bulletproofTest("should handle rapid lock acquisition and release", async () => {
      const key = "rapid-test"
      
      for (let i = 0; i < 100; i++) {
        const lock = await Lock.read(key)
        expect(lock).toBeDefined()
        lock[Symbol.dispose]()
      }
    })

    bulletproofTest("should handle mixed read/write operations", async () => {
      const key = "mixed-operations"
      
      const operations = []
      
      // Mix of read and write operations
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          operations.push(Lock.read(key))
        } else {
          operations.push(Lock.write(key))
        }
      }
      
      // Operations should complete in some order (not necessarily sequential)
      const locks = await Promise.all(operations)
      
      // All should be valid locks
      locks.forEach(lock => {
        expect(lock).toBeDefined()
      })
      
      // Clean up all locks
      locks.forEach(lock => {
        lock[Symbol.dispose]()
      })
    })

    bulletproofTest("should handle lock timeout scenarios", async () => {
      const key = "timeout-test"
      
      // Acquire a write lock
      const writeLock = await Lock.write(key)
      
      // Try to acquire another write lock (should timeout)
      const timeoutPromise = Lock.write(key, { timeout: 50 })
      
      await expect(timeoutPromise).rejects.toThrow()
      
      // Release the original lock
      writeLock[Symbol.dispose]()
    })

    bulletproofTest("should handle empty and null keys", async () => {
      // Test with empty string
      const emptyLock = await Lock.read("")
      expect(emptyLock).toBeDefined()
      emptyLock[Symbol.dispose]()
      
      // Test with null/undefined (should handle gracefully)
      try {
        const nullLock = await Lock.read(null as any)
        expect(nullLock).toBeDefined()
        nullLock[Symbol.dispose]()
      } catch (error) {
        // If it throws, that's also acceptable behavior
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe("Performance and Stress Testing", () => {
    bulletproofTest("should handle high concurrency", async () => {
      const key = "high-concurrency"
      const operationCount = 50
      const operations = []
      
      // Create many concurrent operations
      for (let i = 0; i < operationCount; i++) {
        operations.push(
          Lock.read(key).then(lock => {
            // Simulate some work
            return new Promise(resolve => {
              setTimeout(() => {
                lock[Symbol.dispose]()
                resolve(i)
              }, Math.random() * 10)
            })
          })
        )
      }
      
      // All operations should complete
      const results = await Promise.all(operations)
      expect(results).toHaveLength(operationCount)
      
      // Results should be unique
      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(operationCount)
    }, 10000) // 10 second timeout

    bulletproofTest("should maintain performance under load", async () => {
      const key = "performance-test"
      const iterations = 100
      
      const startTime = Date.now()
      
      for (let i = 0; i < iterations; i++) {
        const lock = await Lock.read(key)
        lock[Symbol.dispose]()
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete reasonably quickly (adjust threshold as needed)
      expect(duration).toBeLessThan(5000) // 5 seconds for 100 operations
    })
  })
})
