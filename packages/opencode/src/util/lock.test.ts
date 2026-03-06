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

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Lock } from "./lock"

describe("Lock System", () => {
  beforeEach(() => {
    Lock.cleanup()
  })

  afterEach(() => {
    Lock.cleanup()
  })

  bulletproofTest("basic read lock acquisition", async () => {
    const lock = await Lock.read("test-basic")
    expect(lock).toBeDefined()
    lock[Symbol.dispose]()
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  bulletproofTest("basic write lock acquisition", async () => {
    const lock = await Lock.write("test-write")
    expect(lock).toBeDefined()
    lock[Symbol.dispose]()
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  bulletproofTest("multiple concurrent readers", async () => {
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

  bulletproofTest("writer excludes readers", async () => {
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

  bulletproofTest("reader releases before writer acquires", async () => {
    const readLock = await Lock.read("test-seq")
    readLock[Symbol.dispose]()
    
    const writeLock = await Lock.write("test-seq")
    expect(writeLock).toBeDefined()
    writeLock[Symbol.dispose]()
  })

  bulletproofTest("lock stats tracking", async () => {
    await Lock.read("stats-1")
    await Lock.read("stats-2")
    
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(2)
  })

  bulletproofTest("cleanup clears all locks", async () => {
    await Lock.read("cleanup-1")
    await Lock.read("cleanup-2")
    
    Lock.cleanup()
    
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  bulletproofTest("cleanup rejects waiting readers", async () => {
    const writeLock = await Lock.write("reject-test")
    
    const readerPromise = Lock.read("reject-test")
    
    Lock.cleanup()
    
    await expect(readerPromise).rejects.toThrow()
    writeLock[Symbol.dispose]()
  })

  bulletproofTest("cleanup rejects waiting writers", async () => {
    const writeLock1 = await Lock.write("reject-writer-test")
    
    const writerPromise = Lock.write("reject-writer-test")
    
    Lock.cleanup()
    
    await expect(writerPromise).rejects.toThrow()
    writeLock1[Symbol.dispose]()
  })
})
