export namespace Lock {
  // Maximum number of readers before writers get priority to prevent starvation
  const MAX_CONCURRENT_READERS = 10
  const MAX_WAITING_READERS = 50
  const MAX_WAITING_WRITERS = 20

  const locks = new Map<
    string,
    {
      readers: number
      writer: boolean
      waitingReaders: (() => void)[]
      waitingWriters: (() => void)[]
      // Track reader acquisition count for fairness
      readerAcquireCount: number
    }
  >()

  function get(key: string) {
    if (!locks.has(key)) {
      locks.set(key, {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
        readerAcquireCount: 0,
      })
    }
    return locks.get(key)!
  }

  function process(key: string) {
    const lock = locks.get(key)
    if (!lock || lock.writer || lock.readers > 0) return

    // Prioritize writers if there are many waiting readers to prevent reader starvation
    // or if writer has been waiting too long
    const shouldPrioritizeWriters =
      lock.waitingWriters.length > 0 &&
      (lock.waitingReaders.length > MAX_WAITING_READERS ||
        lock.readerAcquireCount > MAX_CONCURRENT_READERS)

    if (shouldPrioritizeWriters) {
      const nextWriter = lock.waitingWriters.shift()
      if (nextWriter) {
        lock.writer = true
        lock.readerAcquireCount = 0 // Reset counter when writer gets lock
        nextWriter()
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
        nextReader()
      }
    }

    // Clean up empty locks
    if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
      locks.delete(key)
    }
  }

  export async function read(key: string): Promise<Disposable> {
    const lock = get(key)

    // Check limits to prevent unbounded queue growth
    if (lock.waitingReaders.length >= MAX_WAITING_READERS) {
      throw new Error(`Lock reader queue exceeded maximum size for key: ${key}`)
    }

    return new Promise((resolve) => {
      if (!lock.writer && lock.waitingWriters.length === 0 && lock.readers < MAX_CONCURRENT_READERS) {
        lock.readers++
        lock.readerAcquireCount++
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

    // Check limits to prevent unbounded queue growth
    if (lock.waitingWriters.length >= MAX_WAITING_WRITERS) {
      throw new Error(`Lock writer queue exceeded maximum size for key: ${key}`)
    }

    return new Promise((resolve) => {
      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        lock.readerAcquireCount = 0
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
}
