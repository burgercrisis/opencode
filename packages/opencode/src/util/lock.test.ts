import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Lock } from "./lock"

describe("Lock System", () => {
  beforeEach(() => {
    Lock.cleanup()
  })

  afterEach(() => {
    Lock.cleanup()
  })

  test("basic read lock acquisition", async () => {
    const lock = await Lock.read("test-basic")
    expect(lock).toBeDefined()
    lock[Symbol.dispose]()
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  test("basic write lock acquisition", async () => {
    const lock = await Lock.write("test-write")
    expect(lock).toBeDefined()
    lock[Symbol.dispose]()
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  test("multiple concurrent readers", async () => {
    const lock1 = await Lock.read("test-multi")
    const lock2 = await Lock.read("test-multi")
    const lock3 = await Lock.read("test-multi")

    expect(lock1).toBeDefined()
    expect(lock2).toBeDefined()
    expect(lock3).toBeDefined()

    lock1[Symbol.dispose]()
    lock2[Symbol.dispose]()
    lock3[Symbol.dispose]()

    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  test("writer excludes readers", async () => {
    const writeLock = await Lock.write("test-exclude")
    
    // Reader should wait since writer is active
    const readerPromise = Lock.read("test-exclude")
    
    // Give time for reader to be queued
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const stats = Lock.getStats()
    const lockDetail = stats.lockDetails.find(d => d.key === "test-exclude")
    expect(lockDetail?.waitingReaders).toBe(1)
    
    // Release writer
    writeLock[Symbol.dispose]()
    
    // Wait for reader to be acquired
    const readLock = await readerPromise
    expect(readLock).toBeDefined()
    readLock[Symbol.dispose]()
  })

  test("reader releases before writer acquires", async () => {
    const readLock = await Lock.read("test-seq")
    readLock[Symbol.dispose]()
    
    const writeLock = await Lock.write("test-seq")
    expect(writeLock).toBeDefined()
    writeLock[Symbol.dispose]()
  })

  test("lock stats tracking", async () => {
    await Lock.read("stats-1")
    await Lock.read("stats-2")
    
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(2)
  })

  test("cleanup clears all locks", async () => {
    await Lock.read("cleanup-1")
    await Lock.read("cleanup-2")
    
    Lock.cleanup()
    
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  test("cleanup rejects waiting readers", async () => {
    const writeLock = await Lock.write("reject-test")
    
    const readerPromise = Lock.read("reject-test")
    
    Lock.cleanup()
    
    await expect(readerPromise).rejects.toThrow()
    writeLock[Symbol.dispose]()
  })

  test("cleanup rejects waiting writers", async () => {
    const writeLock1 = await Lock.write("reject-writer-test")
    
    const writerPromise = Lock.write("reject-writer-test")
    
    Lock.cleanup()
    
    await expect(writerPromise).rejects.toThrow()
    writeLock1[Symbol.dispose]()
  })
})
