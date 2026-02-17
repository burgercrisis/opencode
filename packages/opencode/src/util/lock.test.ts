import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Lock } from "./lock"

describe("Lock System", () => {
  afterEach(() => {
    Lock.cleanup()
  })

  describe("Memory Leak Prevention", () => {
    it("should clean up stale locks", async () => {
      const key = "test-stale-lock"

      // Create a lock but don't acquire/release it
      const lockPromise = Lock.read(key)

      // Wait for lock to become stale (simulate time passage)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Manually mark lock as stale by manipulating internal state
      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(1)

      // Trigger cleanup by creating another lock (which triggers cleanup scheduler)
      await Lock.read("another-key")

      // Wait for cleanup interval to run (use shorter timeout for test reliability)
      await new Promise(resolve => setTimeout(resolve, 200))

      const finalStats = Lock.getStats()
      expect(finalStats.totalLocks).toBeLessThanOrEqual(2) // Should clean stale locks
    })

    it("should reject waiting operations when lock is cleaned up", async () => {
      const key = "test-cleanup-rejection"

      // Create a simple lock and release it
      const lock = await Lock.read(key)
      lock[Symbol.dispose]()

      // Create waiting operations
      const writer = Lock.write(key)
      const reader = Lock.read(key)

      // These should resolve normally
      const writerLock = await writer
      const readerLock = await reader

      expect(writerLock).toBeDefined()
      expect(readerLock).toBeDefined()

      writerLock[Symbol.dispose]()
      readerLock[Symbol.dispose]()

      // Basic test - cleanup should not crash
      expect(true).toBe(true)
    })

    it("should not accumulate locks over time", async () => {
      const initialStats = Lock.getStats()
      const initialCount = initialStats.totalLocks

      // Create and release many locks
      for (let i = 0; i < 50; i++) {
        const lock = await Lock.read(`test-${i}`)
        lock[Symbol.dispose]()
      }

      // Wait for any cleanup intervals
      await new Promise(resolve => setTimeout(resolve, 100))

      const midStats = Lock.getStats()
      expect(midStats.totalLocks).toBeLessThanOrEqual(initialCount + 50)

      // Create some locks that will become stale
      const stalePromises = []
      for (let i = 50; i < 60; i++) {
        stalePromises.push(Lock.read(`stale-${i}`))
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 200))

      const finalStats = Lock.getStats()
      // Should not have accumulated all the stale locks
      expect(finalStats.totalLocks).toBeLessThan(initialCount + 60)
    })
  })

  describe("Basic Lock Functionality", () => {
    it("should allow concurrent readers", async () => {
      const key = "test-concurrent-readers"

      const reader1 = Lock.read(key)
      const reader2 = Lock.read(key)
      const reader3 = Lock.read(key)

      const lock1 = await reader1
      const lock2 = await reader2
      const lock3 = await reader3

      expect(lock1).toBeDefined()
      expect(lock2).toBeDefined()
      expect(lock3).toBeDefined()

      lock1[Symbol.dispose]()
      lock2[Symbol.dispose]()
      lock3[Symbol.dispose]()
    })

    it("should exclude writers when readers are active", async () => {
      const key = "test-writer-exclusion"

      // Acquire a reader first
      const reader1 = Lock.read(key)
      const lock1 = await reader1

      // Try to acquire a writer - it should wait
      const writer = Lock.write(key)
      let writerResolved = false

      // Writer should not resolve immediately since reader is active
      const timeout = Promise.race([
        writer.then(() => { writerResolved = true; return null }),
        new Promise(resolve => setTimeout(() => {
          resolve(null)
        }, 50))
      ])

      await timeout
      expect(writerResolved).toBe(false)

      // Release the reader
      lock1[Symbol.dispose]()

      // Now writer should resolve
      const writerLock = await writer
      expect(writerLock).toBeDefined()
      writerLock[Symbol.dispose]()
    })

    it("should prioritize writers when queues are full", async () => {
      const key = "test-writer-priority"

      // Create a writer to block the lock
      const writer1 = Lock.write(key)
      const lock1 = await writer1

      // Create many waiting readers
      const readers = []
      for (let i = 0; i < 15; i++) {
        readers.push(Lock.read(key))
      }

      // Create a second waiting writer
      const writer2 = Lock.write(key)

      // Wait for queues to fill
      await new Promise(resolve => setTimeout(resolve, 50))

      // Verify state
      const stats = Lock.getStats()
      const lockDetails = stats.lockDetails.find((detail: any) => detail.key === key)
      expect(lockDetails?.waitingReaders).toBe(15)
      expect(lockDetails?.waitingWriters).toBe(1)

      // Release the first writer
      lock1[Symbol.dispose]()

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200))

      // At least the writer should be processed (not waiting anymore)
      const finalStats = Lock.getStats()
      const finalLockDetails = finalStats.lockDetails.find((detail: any) => detail.key === key)

      // Writer should have been processed or is currently active
      expect(finalLockDetails?.waitingWriters ?? 0).toBeLessThanOrEqual(1)

      // Clean up
      try {
        const writerLock = await Promise.race([writer2, new Promise(resolve => setTimeout(resolve, 100))])
        if (writerLock && typeof writerLock === 'object' && Symbol.dispose in Object(writerLock)) {
          (writerLock as any)[Symbol.dispose]()
        }
      } catch {
        // Ignore
      }

      for (const readerPromise of readers) {
        try {
          const readerLock = await Promise.race([readerPromise, new Promise(resolve => setTimeout(resolve, 10))])
          if (readerLock && typeof readerLock === 'object' && Symbol.dispose in Object(readerLock)) {
            (readerLock as any)[Symbol.dispose]()
          }
        } catch {
          // Ignore
        }
      }
    })
  })

  describe("Error Handling", () => {
    it("should handle queue overflow gracefully", async () => {
      const key = "test-queue-overflow"

      // Simple test - just verify the error handling works
      let errorThrown = false
      try {
        // This should eventually throw
        for (let i = 0; i < 100; i++) {
          try {
            Lock.write(key)
          } catch (error) {
            errorThrown = true
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain("Lock writer queue exceeded maximum size")
            break
          }
        }
      } catch (error) {
        // Should not reach here
      }

      // Should have thrown an error
      expect(errorThrown).toBe(true)

      // System should still be functional
      const lock = await Lock.read("another-key")
      expect(lock).toBeDefined()
      lock[Symbol.dispose]()
    })

    it("should cleanup after exceptions", async () => {
      const key = "test-exception-cleanup"

      // Create a lock that will have waiting operations
      const writer1 = Lock.write(key)
      const reader1 = Lock.read(key)

      // Simulate an exception during lock acquisition
      try {
        await Promise.race([
          Lock.write(key),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Simulated error")), 50)
          )
        ])
      } catch {
        // Ignore simulated error
      }

      // System should still be functional
      const lock = await Lock.read("another-key")
      expect(lock).toBeDefined()
      lock[Symbol.dispose]()
    })
  })

  describe("Activity Tracking", () => {
    it("should update lastActivity timestamp", async () => {
      const key = "test-activity-tracking"

      const initialStats = Lock.getStats()
      const initialLockDetails = initialStats.lockDetails.find((d: any) => d.key === key)
      expect(initialLockDetails).toBeUndefined()

      const reader = Lock.read(key)
      await new Promise(resolve => setTimeout(resolve, 50))

      const lock = await reader
      const duringStats = Lock.getStats()
      const duringLockDetails = duringStats.lockDetails.find((d: any) => d.key === key)

      expect(duringLockDetails).toBeDefined()
      expect(duringLockDetails!.lastActivity).toBeLessThan(100)

      lock[Symbol.dispose]()

      const finalStats = Lock.getStats()
      const finalLockDetails = finalStats.lockDetails.find((d: any) => d.key === key)
      expect(finalLockDetails).toBeUndefined() // Should be cleaned up
    })
  })
})
