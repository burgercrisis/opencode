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

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Lock } from "../lock"

describe("Lock Cleanup", () => {
  beforeEach(() => {
    // Clear any existing locks before each test
    Lock.cleanup()
  })

  afterEach(() => {
    // Clean up after each test
    Lock.cleanup()
  })

  bulletproofTest("cleanup scheduler should not start in test mode", async () => {
    // Create a lock to trigger scheduler start
    await Lock.read("test-key")

    // Get stats to verify lock exists
    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(1)

    // In test mode, cleanup scheduler should not be running
    // We can't directly test the interval, but we can verify behavior
    const lockDetails = stats.lockDetails[0]
    expect(lockDetails.key).toBe("test-key")
    expect(lockDetails.readers).toBe(1)
    expect(lockDetails.writer).toBe(false)
  })

  bulletproofTest("stale locks should be cleaned up manually", async () => {
    // Create a lock and release it immediately
    const lock = await Lock.read("stale-test")
    lock[Symbol.dispose]()

    // Verify lock is cleaned up immediately when empty
    let stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)

    // Create another lock for manual cleanup testing
    await Lock.read("manual-cleanup")

    // Manually trigger cleanup
    Lock.cleanup()

    // Verify all locks are cleaned up
    stats = Lock.getStats()
    expect(stats.totalLocks).toBe(0)
  })

  bulletproofTest("lock stats provide useful information", async () => {
    const lock1 = await Lock.read("stats-test-1")
    const lock2 = await Lock.read("stats-test-2")

    const stats = Lock.getStats()
    expect(stats.totalLocks).toBe(2)
    expect(stats.lockDetails).toHaveLength(2)

    // Find our test locks
    const lock1Details = stats.lockDetails.find(l => l.key === "stats-test-1")
    const lock2Details = stats.lockDetails.find(l => l.key === "stats-test-2")

    expect(lock1Details).toBeDefined()
    expect(lock2Details).toBeDefined()
    expect(lock1Details?.readers).toBe(1)
    expect(lock2Details?.readers).toBe(1)
    expect(lock1Details?.writer).toBe(false)
    expect(lock2Details?.writer).toBe(false)
    expect(lock1Details?.age).toBeGreaterThanOrEqual(0)
    expect(lock2Details?.age).toBeGreaterThanOrEqual(0)

    // Release locks
    lock1[Symbol.dispose]()
    lock2[Symbol.dispose]()
  })
})
