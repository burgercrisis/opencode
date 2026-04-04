import { describe, test, expect } from "bun:test"
import { Lock } from "../../src/util/lock"

describe("Lock Cleanup Race Condition Fix", () => {
  test("should handle cleanup correctly", async () => {
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

  test("should handle normal operations", async () => {
    const key = "test-key-normal"

    // Normal read operation should work
    const readLock = await Lock.read(key)
    expect(readLock).toBeDefined()

    // Should be able to release
    readLock[Symbol.dispose]()
  }, 5000) // 5 second timeout

  test("should cleanup with no locks", () => {
    // Cleanup should not throw when no locks exist
    expect(() => Lock.cleanup()).not.toThrow()
  })

  test("should handle multiple waiting operations", async () => {
    const key = "test-key-multiple"

    // Acquire a lock
    const writeLock = await Lock.write(key)

    // Start multiple waiting operations
    const readPromise1 = Lock.read(key)
    const readPromise2 = Lock.read(key)
    const writePromise = Lock.write(key)

    // Wait a bit to ensure they're queued
    await new Promise(resolve => setTimeout(resolve, 10))

    // Trigger cleanup
    Lock.cleanup()

    // All waiting promises should be rejected
    await expect(readPromise1).rejects.toThrow("Lock cleaned up due to timeout")
    await expect(readPromise2).rejects.toThrow("Lock cleaned up due to timeout")
    await expect(writePromise).rejects.toThrow("Lock cleaned up due to timeout")

    // Release the original lock
    writeLock[Symbol.dispose]()
  }, 5000) // 5 second timeout
})
