import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Lock } from '@/util/lock'

describe('Lock System Fixes', () => {
  beforeEach(() => {
    // Clear all locks before each test
    Lock.cleanup()
  })

  afterEach(() => {
    // Clean up after each test
    Lock.cleanup()
  })

  it('should handle concurrent readers and writers correctly', async () => {
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

    // Wait for all to complete
    await Promise.all([...readerPromises, writerPromise])

    expect(readerResults).toHaveLength(3)
    expect(writerResult).toBe('writer-completed')
  })

  it('should prevent writer starvation with many readers', async () => {
    const lockKey = 'test-lock-starvation'
    let writerCompleted = false
    let readersCompleted = 0

    // Start many readers
    const readerPromises = Array.from({ length: 20 }, async (_, i) => {
      const disposable = await Lock.read(lockKey)
      try {
        readersCompleted++
        await new Promise(resolve => setTimeout(resolve, 5))
      } finally {
        disposable[Symbol.dispose]()
      }
    })

    // Start a writer
    const writerPromise = (async () => {
      const disposable = await Lock.write(lockKey)
      try {
        writerCompleted = true
        await new Promise(resolve => setTimeout(resolve, 5))
      } finally {
        disposable[Symbol.dispose]()
      }
    })()

    // Wait for all to complete
    await Promise.all([...readerPromises, writerPromise])

    expect(writerCompleted).toBe(true)
    expect(readersCompleted).toBeGreaterThan(0)
  })

  it('should handle cleanup without throwing errors', () => {
    expect(() => Lock.cleanup()).not.toThrow()
  })

  it('should provide lock statistics', () => {
    const stats = Lock.getStats()
    expect(stats).toHaveProperty('totalLocks')
    expect(stats).toHaveProperty('lockDetails')
    expect(Array.isArray(stats.lockDetails)).toBe(true)
  })

  it('should handle stale lock cleanup', async () => {
    const lockKey = 'test-lock-stale'

    // Create a lock
    const disposable = await Lock.write(lockKey)
    try {
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 1))
    } finally {
      disposable[Symbol.dispose]()
    }

    // Wait a bit and check stats
    await new Promise(resolve => setTimeout(resolve, 10))

    const stats = Lock.getStats()
    // Lock should be cleaned up after use
    expect(stats.totalLocks).toBe(0)
  })

  it('should handle concurrent lock operations safely', async () => {
    const lockKey = 'test-lock-concurrent'
    const results: string[] = []

    // Start multiple concurrent operations
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const disposable = await Lock.write(lockKey)
      try {
        results.push(`operation-${i}`)
        await new Promise(resolve => setTimeout(resolve, 1))
      } finally {
        disposable[Symbol.dispose]()
      }
    })

    await Promise.all(promises)

    // All operations should complete
    expect(results).toHaveLength(10)
    expect(new Set(results).size).toBe(10) // All unique
  })
})
