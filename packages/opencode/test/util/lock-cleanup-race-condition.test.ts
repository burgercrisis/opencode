import { describe, test, expect } from "bun:test"
import { Lock } from "../../src/util/lock"

describe("Lock Cleanup Race Condition Fix", () => {
  test("should properly reject waiting promises during cleanup", async () => {
    const key = "test-key"

    // First, acquire a write lock to force others to wait
    const writeLock = await Lock.write(key)

    // Start read operations that will wait (since writer has lock)
    const readPromise1 = Lock.read(key)
    const readPromise2 = Lock.read(key)

    // Start another write operation that will wait
    const writePromise = Lock.write(key)

    // Wait a bit to ensure they're queued
    await new Promise(resolve => setTimeout(resolve, 10))

    // Trigger cleanup
    Lock.cleanup()

    // All waiting promises should be rejected due to cleanup
    await expect(readPromise1).rejects.toThrow("Lock cleaned up due to timeout")
    await expect(readPromise2).rejects.toThrow("Lock cleaned up due to timeout")
    await expect(writePromise).rejects.toThrow("Lock cleaned up due to timeout")

    // Release the original write lock
    writeLock[Symbol.dispose]()
  })

  test("should handle normal lock operations correctly", async () => {
    const key = "test-key-normal"

    // Normal read operation should work
    const readLock = await Lock.read(key)
    expect(readLock).toBeDefined()

    // Should be able to release and acquire again
    readLock[Symbol.dispose]()

    const readLock2 = await Lock.read(key)
    expect(readLock2).toBeDefined()
    readLock2[Symbol.dispose]()
  })

  test("should prevent deadlocks with timeout cleanup", async () => {
    const key = "test-key-timeout"

    // Acquire a lock first
    const writeLock = await Lock.write(key)

    // Start a read operation that will wait
    const readPromise = Lock.read(key)

    // Wait a bit to ensure it's queued
    await new Promise(resolve => setTimeout(resolve, 10))

    // Manually trigger cleanup to simulate timeout
    Lock.cleanup()

    // Promise should eventually be rejected, not hang forever
    const startTime = Date.now()
    await expect(readPromise).rejects.toThrow()
    const endTime = Date.now()

    // Should not take more than 1 second (much less than actual timeout)
    expect(endTime - startTime).toBeLessThan(1000)

    // Release the original lock
    writeLock[Symbol.dispose]()
  })
})
