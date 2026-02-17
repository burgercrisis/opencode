import { describe, it, expect, afterEach } from "bun:test"
import { Lock } from "./lock"

describe("Lock System - Simple Memory Leak Test", () => {
  afterEach(() => {
    Lock.cleanup()
  })

  it("should prevent memory leaks with cleanup", async () => {
    // Test basic functionality
    const key = "test-memory-leak"
    
    // Create and release a lock
    const lock = await Lock.read(key)
    expect(lock).toBeDefined()
    lock[Symbol.dispose]()
    
    // Check that lock is cleaned up
    const stats = Lock.getStats()
    const lockDetails = stats.lockDetails.find((d: any) => d.key === key)
    expect(lockDetails).toBeUndefined() // Should be cleaned up
    
    // System should still work
    const anotherLock = await Lock.read("another-key")
    expect(anotherLock).toBeDefined()
    anotherLock[Symbol.dispose]()
  })

  it("should handle concurrent operations", async () => {
    const key = "test-concurrent"
    
    // Create multiple concurrent readers
    const readers = []
    for (let i = 0; i < 5; i++) {
      readers.push(Lock.read(key))
    }
    
    // All should resolve
    const locks = await Promise.all(readers)
    expect(locks).toHaveLength(5)
    
    // Release all
    for (const lock of locks) {
      lock[Symbol.dispose]()
    }
    
    // Should be cleaned up
    const stats = Lock.getStats()
    const lockDetails = stats.lockDetails.find((d: any) => d.key === key)
    expect(lockDetails).toBeUndefined()
  })

  it("should track activity correctly", async () => {
    const key = "test-activity"
    
    // Get initial stats
    const initialStats = Lock.getStats()
    expect(initialStats.totalLocks).toBe(0)
    
    // Create a lock
    const lock = await Lock.read(key)
    
    // Check stats after lock creation
    const duringStats = Lock.getStats()
    const duringLockDetails = duringStats.lockDetails.find((d: any) => d.key === key)
    
    expect(duringLockDetails).toBeDefined()
    expect(duringLockDetails!.lastActivity).toBeGreaterThan(0)
    expect(duringLockDetails!.lastActivity).toBeLessThan(1000)
    
    // Release lock
    lock[Symbol.dispose]()
    
    // Should be cleaned up
    const finalStats = Lock.getStats()
    const finalLockDetails = finalStats.lockDetails.find((d: any) => d.key === key)
    expect(finalLockDetails).toBeUndefined()
  })
})
