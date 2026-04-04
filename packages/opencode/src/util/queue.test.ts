import { describe, it, expect } from "bun:test"
import { AsyncQueue, work } from "./queue"

describe("AsyncQueue", () => {
  it("should push and next items in order", async () => {
    const queue = new AsyncQueue<number>()
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
    expect(await queue.next()).toBe(3)
  })

  it("should wait for items when queue is empty", async () => {
    const queue = new AsyncQueue<string>()
    
    let resolved = false
    const promise = queue.next().then((value) => {
      resolved = true
      return value
    })
    
    // Allow microtask to run
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
    
    queue.push("hello")
    
    const result = await promise
    expect(result).toBe("hello")
    expect(resolved).toBe(true)
  })

  it("should work as an async iterable", async () => {
    const queue = new AsyncQueue<number>()
    const results: number[] = []
    
    const consumer = async () => {
      let count = 0
      for await (const item of queue) {
        results.push(item)
        count++
        if (count >= 3) break
      }
    }
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    await consumer()
    
    expect(results).toEqual([1, 2, 3])
  })

  it("should handle multiple waiting consumers", async () => {
    const queue = new AsyncQueue<number>()
    
    const promise1 = queue.next()
    const promise2 = queue.next()
    const promise3 = queue.next()
    
    queue.push(10)
    queue.push(20)
    queue.push(30)
    
    const results = await Promise.all([promise1, promise2, promise3])
    expect(results).toEqual([10, 20, 30])
  })
})

describe("work", () => {
  it("should process items with given concurrency", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    let maxConcurrent = 0
    let currentConcurrent = 0
    
    await work(2, items, async (item) => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 10))
      processed.push(item)
      currentConcurrent--
    })
    
    expect(processed.length).toBe(5)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it("should process all items even with concurrency 1", async () => {
    const items = [1, 2, 3]
    const processed: number[] = []
    
    await work(1, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2, 3])
  })

  it("should handle empty items array", async () => {
    const processed: number[] = []
    
    await work(3, [], async (item) => {
      processed.push(item)
    })
    
    expect(processed).toEqual([])
  })

  it("should handle concurrency greater than items length", async () => {
    const items = [1, 2]
    const processed: number[] = []
    
    await work(10, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2])
  })

  it("should process items in parallel when possible", async () => {
    const items = [1, 2, 3, 4]
    const startTimes: number[] = []
    const delays = [50, 10, 50, 10]
    
    const startTime = Date.now()
    
    await work(4, items, async (item, index) => {
      startTimes.push(Date.now() - startTime)
      await new Promise((resolve) => setTimeout(resolve, delays[index ?? 0]))
    })
    
    // All items should start roughly at the same time (within 20ms)
    const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes)
    expect(maxStartDiff).toBeLessThan(20)
  })
})
import { AsyncQueue, work } from "./queue"

describe("AsyncQueue", () => {
  it("should push and next items in order", async () => {
    const queue = new AsyncQueue<number>()
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
    expect(await queue.next()).toBe(3)
  })

  it("should wait for items when queue is empty", async () => {
    const queue = new AsyncQueue<string>()
    
    let resolved = false
    const promise = queue.next().then((value) => {
      resolved = true
      return value
    })
    
    // Allow microtask to run
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
    
    queue.push("hello")
    
    const result = await promise
    expect(result).toBe("hello")
    expect(resolved).toBe(true)
  })

  it("should work as an async iterable", async () => {
    const queue = new AsyncQueue<number>()
    const results: number[] = []
    
    const consumer = async () => {
      let count = 0
      for await (const item of queue) {
        results.push(item)
        count++
        if (count >= 3) break
      }
    }
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    await consumer()
    
    expect(results).toEqual([1, 2, 3])
  })

  it("should handle multiple waiting consumers", async () => {
    const queue = new AsyncQueue<number>()
    
    const promise1 = queue.next()
    const promise2 = queue.next()
    const promise3 = queue.next()
    
    queue.push(10)
    queue.push(20)
    queue.push(30)
    
    const results = await Promise.all([promise1, promise2, promise3])
    expect(results).toEqual([10, 20, 30])
  })
})

describe("work", () => {
  it("should process items with given concurrency", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    let maxConcurrent = 0
    let currentConcurrent = 0
    
    await work(2, items, async (item) => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 10))
      processed.push(item)
      currentConcurrent--
    })
    
    expect(processed.length).toBe(5)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it("should process all items even with concurrency 1", async () => {
    const items = [1, 2, 3]
    const processed: number[] = []
    
    await work(1, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2, 3])
  })

  it("should handle empty items array", async () => {
    const processed: number[] = []
    
    await work(3, [], async (item) => {
      processed.push(item)
    })
    
    expect(processed).toEqual([])
  })

  it("should handle concurrency greater than items length", async () => {
    const items = [1, 2]
    const processed: number[] = []
    
    await work(10, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2])
  })

  it("should process items in parallel when possible", async () => {
    const items = [1, 2, 3, 4]
    const startTimes: number[] = []
    const delays = [50, 10, 50, 10]
    
    const startTime = Date.now()
    
    await work(4, items, async (item, index) => {
      startTimes.push(Date.now() - startTime)
      await new Promise((resolve) => setTimeout(resolve, delays[index ?? 0]))
    })
    
    // All items should start roughly at the same time (within 20ms)
    const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes)
    expect(maxStartDiff).toBeLessThan(20)
  })
})


describe("AsyncQueue", () => {
  it("should push and next items in order", async () => {
    const queue = new AsyncQueue<number>()
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
    expect(await queue.next()).toBe(3)
  })

  it("should wait for items when queue is empty", async () => {
    const queue = new AsyncQueue<string>()
    
    let resolved = false
    const promise = queue.next().then((value) => {
      resolved = true
      return value
    })
    
    // Allow microtask to run
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(resolved).toBe(false)
    
    queue.push("hello")
    
    const result = await promise
    expect(result).toBe("hello")
    expect(resolved).toBe(true)
  })

  it("should work as an async iterable", async () => {
    const queue = new AsyncQueue<number>()
    const results: number[] = []
    
    const consumer = async () => {
      let count = 0
      for await (const item of queue) {
        results.push(item)
        count++
        if (count >= 3) break
      }
    }
    
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    await consumer()
    
    expect(results).toEqual([1, 2, 3])
  })

  it("should handle multiple waiting consumers", async () => {
    const queue = new AsyncQueue<number>()
    
    const promise1 = queue.next()
    const promise2 = queue.next()
    const promise3 = queue.next()
    
    queue.push(10)
    queue.push(20)
    queue.push(30)
    
    const results = await Promise.all([promise1, promise2, promise3])
    expect(results).toEqual([10, 20, 30])
  })
})

describe("work", () => {
  it("should process items with given concurrency", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    let maxConcurrent = 0
    let currentConcurrent = 0
    
    await work(2, items, async (item) => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 10))
      processed.push(item)
      currentConcurrent--
    })
    
    expect(processed.length).toBe(5)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it("should process all items even with concurrency 1", async () => {
    const items = [1, 2, 3]
    const processed: number[] = []
    
    await work(1, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2, 3])
  })

  it("should handle empty items array", async () => {
    const processed: number[] = []
    
    await work(3, [], async (item) => {
      processed.push(item)
    })
    
    expect(processed).toEqual([])
  })

  it("should handle concurrency greater than items length", async () => {
    const items = [1, 2]
    const processed: number[] = []
    
    await work(10, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2])
  })

  it("should process items in parallel when possible", async () => {
    const items = [1, 2, 3, 4]
    const startTimes: number[] = []
    const delays = [50, 10, 50, 10]
    
    const startTime = Date.now()
    
    await work(4, items, async (item, index) => {
      startTimes.push(Date.now() - startTime)
      await new Promise((resolve) => setTimeout(resolve, delays[index ?? 0]))
    })
    
    // All items should start roughly at the same time (within 20ms)
    const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes)
    expect(maxStartDiff).toBeLessThan(20)
  })
})

