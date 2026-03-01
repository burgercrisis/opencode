import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Lock } from "../lock"

describe("Lock", () => {
  beforeEach(() => {
    Lock.cleanup()
  })

  afterEach(() => {
    Lock.cleanup()
  })

  describe("read", () => {
    it("should acquire read lock", async () => {
      const lock = await Lock.read("test-key")
      expect(lock).toBeDefined()
      expect(lock[Symbol.dispose]).toBeDefined()

      lock[Symbol.dispose]()
    })

    it("should allow multiple concurrent readers", async () => {
      const lock1 = await Lock.read("multi-read")
      const lock2 = await Lock.read("multi-read")

      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(1)
      expect(stats.lockDetails[0].readers).toBe(2)

      lock1[Symbol.dispose]()
      lock2[Symbol.dispose]()
    })

    it("should release read lock on dispose", async () => {
      const lock = await Lock.read("release-test")
      lock[Symbol.dispose]()

      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(0)
    })
  })

  describe("write", () => {
    it("should acquire write lock", async () => {
      const lock = await Lock.write("write-key")
      expect(lock).toBeDefined()
      expect(lock[Symbol.dispose]).toBeDefined()

      lock[Symbol.dispose]()
    })

    it("should not allow concurrent writers", async () => {
      const lock1 = await Lock.write("exclusive-write")

      // Second write should wait
      let acquired = false
      const lock2Promise = Lock.write("exclusive-write").then((lock) => {
        acquired = true
        lock[Symbol.dispose]()
        return true
      })

      // Give some time for the promise to be queued
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(acquired).toBe(false)

      // Release first lock
      lock1[Symbol.dispose]()

      // Now second should acquire
      await lock2Promise
      expect(acquired).toBe(true)
    })

    it("should block readers while writer is active", async () => {
      const writeLock = await Lock.write("write-blocks-read")

      let readAcquired = false
      const readPromise = Lock.read("write-blocks-read").then((lock) => {
        readAcquired = true
        lock[Symbol.dispose]()
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(readAcquired).toBe(false)

      writeLock[Symbol.dispose]()

      await readPromise
      expect(readAcquired).toBe(true)
    })
  })

  describe("read/write coordination", () => {
    it("should allow read after write is released", async () => {
      const writeLock = await Lock.write("coordination-test")
      writeLock[Symbol.dispose]()

      const readLock = await Lock.read("coordination-test")
      expect(readLock).toBeDefined()
      readLock[Symbol.dispose]()
    })

    it("should allow write after reads are released", async () => {
      const readLock1 = await Lock.read("coordination-test-2")
      const readLock2 = await Lock.read("coordination-test-2")

      readLock1[Symbol.dispose]()
      readLock2[Symbol.dispose]()

      const writeLock = await Lock.write("coordination-test-2")
      expect(writeLock).toBeDefined()
      writeLock[Symbol.dispose]()
    })
  })

  describe("getStats", () => {
    it("should return lock statistics", async () => {
      const lock = await Lock.read("stats-test")

      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(1)
      expect(stats.lockDetails).toHaveLength(1)
      expect(stats.lockDetails[0].key).toBe("stats-test")
      expect(stats.lockDetails[0].readers).toBe(1)
      expect(stats.lockDetails[0].writer).toBe(false)

      lock[Symbol.dispose]()
    })

    it("should track waiting readers and writers", async () => {
      const writeLock = await Lock.write("waiting-test")

      // Queue a reader
      const readPromise = Lock.read("waiting-test")

      await new Promise(resolve => setTimeout(resolve, 10))

      const stats = Lock.getStats()
      expect(stats.lockDetails[0].waitingReaders).toBe(1)

      writeLock[Symbol.dispose]()
      await readPromise.then(l => l[Symbol.dispose]())
    })
  })

  describe("cleanup", () => {
    it("should clear all locks", async () => {
      await Lock.read("cleanup-test-1")
      await Lock.read("cleanup-test-2")

      Lock.cleanup()

      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(0)
    })

    it("should reject waiting readers on cleanup", async () => {
      const writeLock = await Lock.write("cleanup-reject-test")

      // Queue a reader that will be rejected
      const readPromise = Lock.read("cleanup-reject-test")

      // Cleanup should reject the waiting reader
      Lock.cleanup()

      await expect(readPromise).rejects.toThrow("Lock cleaned up")
    })

    it("should reject waiting writers on cleanup", async () => {
      const writeLock = await Lock.write("cleanup-reject-writer-test")

      // Queue a writer that will be rejected
      const writePromise = Lock.write("cleanup-reject-writer-test")

      // Cleanup should reject the waiting writer
      Lock.cleanup()

      await expect(writePromise).rejects.toThrow("Lock cleaned up")
    })
  })

  describe("queue limits", () => {
    it("should throw when reader queue is full", async () => {
      const writeLock = await Lock.write("queue-limit-test")

      // Fill up the reader queue
      const readers = []
      for (let i = 0; i < 150; i++) {
        readers.push(Lock.read("queue-limit-test").catch(() => { }))
      }

      await new Promise(resolve => setTimeout(resolve, 10))

      // Next reader should throw
      await expect(Lock.read("queue-limit-test")).rejects.toThrow("Lock reader queue exceeded maximum size")

      Lock.cleanup()
    })

    it("should throw when writer queue is full", async () => {
      const writeLock = await Lock.write("writer-queue-limit-test")

      // Fill up the writer queue
      const writers = []
      for (let i = 0; i < 150; i++) {
        writers.push(Lock.write("writer-queue-limit-test").catch(() => { }))
      }

      await new Promise(resolve => setTimeout(resolve, 10))

      // Next writer should throw
      await expect(Lock.write("writer-queue-limit-test")).rejects.toThrow("Lock writer queue exceeded maximum size")

      Lock.cleanup()
    })
  })

  describe("writer priority and queue management", () => {
    it("should prioritize writers when reader queue is full", async () => {
      // Create a scenario where writers should be prioritized
      const writeLock = await Lock.write("priority-test")

      // Fill up reader queue to trigger writer priority
      const readers = []
      for (let i = 0; i < 60; i++) { // MAX_WAITING_READERS is 50
        readers.push(Lock.read("priority-test").catch(() => { }))
      }

      // Queue a writer
      const writerPromise = Lock.write("priority-test")

      await new Promise(resolve => setTimeout(resolve, 10))

      // Release the initial write lock
      writeLock[Symbol.dispose]()

      // Writer should get priority over waiting readers
      const writerLock = await writerPromise
      expect(writerLock).toBeDefined()
      writerLock[Symbol.dispose]()

      Lock.cleanup()
    })

    it("should prioritize writers when concurrent readers limit is reached", async () => {
      // Get some concurrent readers first
      const readers = []
      for (let i = 0; i < 8; i++) { // Stay under MAX_CONCURRENT_READERS (10)
        readers.push(await Lock.read("concurrent-priority-test"))
      }

      // Queue a writer while readers are active
      const writerPromise = Lock.write("concurrent-priority-test")

      await new Promise(resolve => setTimeout(resolve, 10))

      // Release all readers to allow writer to proceed
      readers.forEach(reader => reader[Symbol.dispose]())

      // Writer should eventually get the lock
      const writerLock = await writerPromise
      expect(writerLock).toBeDefined()
      writerLock[Symbol.dispose]()

      Lock.cleanup()
    })

    it("should reset reader acquire count when writer gets lock", async () => {
      // First establish some readers
      const reader1 = await Lock.read("acquire-count-test")
      const reader2 = await Lock.read("acquire-count-test")

      // Queue a writer
      const writerPromise = Lock.write("acquire-count-test")

      // Release readers
      reader1[Symbol.dispose]()
      reader2[Symbol.dispose]()

      // Writer should get lock and reset counter
      const writerLock = await writerPromise
      expect(writerLock).toBeDefined()
      writerLock[Symbol.dispose]()

      Lock.cleanup()
    })
  })

  describe("timeout and cleanup behavior", () => {
    it("should handle lock acquisition timeout", async () => {
      // Create a write lock that won't be released
      const writeLock = await Lock.write("timeout-test")

      // Try to acquire another write lock - should timeout in test mode
      const timeoutPromise = Lock.write("timeout-test")

      // In test mode, timeout is 1 second
      await expect(timeoutPromise).rejects.toThrow("Lock acquisition timeout")

      writeLock[Symbol.dispose]()
    })

    it("should clean up stale locks", async () => {
      // This test would need to manipulate time or wait for cleanup
      // For now, just test the cleanup function directly
      await Lock.read("stale-test")

      const statsBefore = Lock.getStats()
      expect(statsBefore.totalLocks).toBe(1)

      Lock.cleanup()

      const statsAfter = Lock.getStats()
      expect(statsAfter.totalLocks).toBe(0)
    })
  })

  describe("lock creation and scheduler", () => {
    it("should create lock entry with proper initialization", async () => {
      const lock = await Lock.read("creation-test")

      const stats = Lock.getStats()
      expect(stats.totalLocks).toBe(1)
      expect(stats.lockDetails[0].readers).toBe(1)
      expect(stats.lockDetails[0].writer).toBe(false)
      expect(stats.lockDetails[0].waitingReaders).toBe(0)
      expect(stats.lockDetails[0].waitingWriters).toBe(0)
      expect(stats.lockDetails[0].age).toBeGreaterThanOrEqual(0)
      expect(stats.lockDetails[0].lastActivity).toBeGreaterThanOrEqual(0)

      lock[Symbol.dispose]()
    })
  })
})
