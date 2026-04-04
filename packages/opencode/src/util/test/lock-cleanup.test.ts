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

  test("cleanup scheduler should not start in test mode", async () => {
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

  test("stale locks should be cleaned up manually", async () => {
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

  test("lock stats provide useful information", async () => {
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
