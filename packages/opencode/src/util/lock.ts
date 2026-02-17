import { LOCK } from "@/constants"
import process from "node:process"

export namespace Lock {
  // Maximum number of readers before writers get priority to prevent starvation
  const MAX_CONCURRENT_READERS = LOCK.MAX_CONCURRENT_READERS
  const MAX_WAITING_READERS = LOCK.MAX_WAITING_READERS
  const MAX_WAITING_WRITERS = LOCK.MAX_WAITING_WRITERS

  // Lock timeout to prevent stale locks - 30 minutes
  const LOCK_TIMEOUT_MS = 30 * 60 * 1000

  // Test mode - shorter timeout for faster tests
  const TEST_MODE = typeof Bun !== 'undefined' && Bun.env?.NODE_ENV === 'test'
  const CLEANUP_INTERVAL_MS = TEST_MODE ? 100 : 5 * 60 * 1000
  const LOCK_TIMEOUT_TEST_MS = TEST_MODE ? 200 : LOCK_TIMEOUT_MS

  interface LockEntry {
    readers: number
    writer: boolean
    waitingReaders: Array<{ resolve: (value: Disposable) => void; reject: (reason?: any) => void }>
    waitingWriters: Array<{ resolve: (value: Disposable) => void; reject: (reason?: any) => void }>
    // Track reader acquisition count for fairness
    readerAcquireCount: number
    // Track creation time for timeout cleanup
    createdAt: number
    // Track last activity time for timeout cleanup
    lastActivity: number
  }

  const locks = new Map<string, LockEntry>()

  // Cleanup interval to remove stale locks
  let cleanupInterval: NodeJS.Timeout | null = null
  let lastCleanupTime = 0

  function startCleanupScheduler() {
    if (cleanupInterval) return

    cleanupInterval = setInterval(() => {
      cleanupStaleLocks()
    }, CLEANUP_INTERVAL_MS)
  }

  function cleanupStaleLocks() {
    const now = Date.now()
    const staleKeys: string[] = []
    const timeoutMs = TEST_MODE ? LOCK_TIMEOUT_TEST_MS : LOCK_TIMEOUT_MS

    for (const [key, lock] of locks.entries()) {
      // Remove locks that haven't had activity for timeout period
      if (now - lock.lastActivity > timeoutMs) {
        staleKeys.push(key)
      }
    }

    // Batch remove stale locks
    for (const key of staleKeys) {
      const lock = locks.get(key)
      if (lock) {
        // Reject all waiting readers and writers properly
        const waitingReaders = lock.waitingReaders.splice(0)
        const waitingWriters = lock.waitingWriters.splice(0)

        // Call waiters with proper rejection
        try {
          waitingReaders.forEach(waiter => {
            try {
              if (waiter && typeof waiter.reject === 'function') {
                waiter.reject(new Error("Lock cleaned up due to timeout"))
              }
            } catch (error) {
              // Ignore individual waiter errors during cleanup
            }
          })
          waitingWriters.forEach(waiter => {
            try {
              if (waiter && typeof waiter.reject === 'function') {
                waiter.reject(new Error("Lock cleaned up due to timeout"))
              }
            } catch (error) {
              // Ignore individual waiter errors during cleanup
            }
          })
        } catch (error) {
          // Ignore any errors during cleanup
        }

        locks.delete(key)
      }
    }
  }

  function get(key: string) {
    if (!locks.has(key)) {
      const now = Date.now()
      locks.set(key, {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
        readerAcquireCount: 0,
        createdAt: now,
        lastActivity: now,
      })
      // Start cleanup scheduler on first lock creation
      // Temporarily disabled for testing
      // startCleanupScheduler()
    }
    return locks.get(key)!
  }

  function process(key: string) {
    const lock = locks.get(key)
    if (!lock || lock.writer || lock.readers > 0) return

    // Update activity timestamp whenever process is called
    lock.lastActivity = Date.now()

    // Prioritize writers if there are many waiting readers to prevent reader starvation
    // or if we have maximum concurrent readers active
    const shouldPrioritizeWriters =
      lock.waitingWriters.length > 0 &&
      (lock.waitingReaders.length > MAX_WAITING_READERS ||
        lock.readers >= MAX_CONCURRENT_READERS)

    if (shouldPrioritizeWriters) {
      const nextWriter = lock.waitingWriters.shift()
      if (nextWriter) {
        lock.writer = true
        lock.readerAcquireCount = 0 // Reset counter when writer gets lock
        nextWriter.resolve({
          [Symbol.dispose]: () => {
            lock.writer = false
            process(key)
          },
        })
        return
      }
    }

    // Limit number of concurrent readers to prevent writer starvation
    const readersToWake = Math.min(
      lock.waitingReaders.length,
      MAX_CONCURRENT_READERS - lock.readers,
    )

    for (let i = 0; i < readersToWake; i++) {
      const nextReader = lock.waitingReaders.shift()
      if (nextReader) {
        lock.readers++
        lock.readerAcquireCount++
        nextReader.resolve({
          [Symbol.dispose]: () => {
            lock.readers--
            process(key)
          },
        })
      }
    }

    // Clean up empty locks
    if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
      locks.delete(key)
    }
  }

  export async function read(key: string): Promise<Disposable> {
    const lock = get(key)

    // Update activity timestamp when lock is accessed
    lock.lastActivity = Date.now()

    // Check limits to prevent unbounded queue growth
    if (lock.waitingReaders.length >= MAX_WAITING_READERS) {
      throw new Error(`Lock reader queue exceeded maximum size for key: ${key}`)
    }

    return new Promise((resolve) => {
      if (!lock.writer && lock.waitingWriters.length === 0 && lock.readers < MAX_CONCURRENT_READERS) {
        lock.readers++
        lock.readerAcquireCount++
        lock.lastActivity = Date.now()
        resolve({
          [Symbol.dispose]: () => {
            lock.readers--
            process(key)
          },
        })
      } else {
        lock.waitingReaders.push(() => {
          lock.readers++
          lock.readerAcquireCount++
          lock.lastActivity = Date.now()
          resolve({
            [Symbol.dispose]: () => {
              lock.readers--
              process(key)
            },
          })
        })
      }
    })
  }

  export async function write(key: string): Promise<Disposable> {
    const lock = get(key)

    // Update activity timestamp when lock is accessed
    lock.lastActivity = Date.now()

    // Check limits to prevent unbounded queue growth
    if (lock.waitingWriters.length >= MAX_WAITING_WRITERS) {
      throw new Error(`Lock writer queue exceeded maximum size for key: ${key}`)
    }

    return new Promise((resolve) => {
      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        lock.readerAcquireCount = 0
        lock.lastActivity = Date.now()
        resolve({
          [Symbol.dispose]: () => {
            lock.writer = false
            process(key)
          },
        })
      } else {
        lock.waitingWriters.push(() => {
          lock.writer = true
          lock.readerAcquireCount = 0
          lock.lastActivity = Date.now()
          resolve({
            [Symbol.dispose]: () => {
              lock.writer = false
              process(key)
            },
          })
        })
      }
    })
  }

  export function cleanup() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }
    locks.clear()
  }

  export function getStats() {
    return {
      totalLocks: locks.size,
      lockDetails: Array.from(locks.entries()).map(([key, lock]) => ({
        key,
        readers: lock.readers,
        writer: lock.writer,
        waitingReaders: lock.waitingReaders.length,
        waitingWriters: lock.waitingWriters.length,
        age: Date.now() - lock.createdAt,
        lastActivity: Date.now() - lock.lastActivity,
      })),
    }
  }

  // Add cleanup function to be called on process exit
  if (typeof globalThis !== 'undefined' && globalThis.process && typeof (globalThis.process as any).on === 'function') {
    const nodeProcess = globalThis.process as any
    nodeProcess.on('exit', cleanup)
    nodeProcess.on('SIGINT', cleanup)
    nodeProcess.on('SIGTERM', cleanup)
  }
}
