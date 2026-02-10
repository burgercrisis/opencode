import { expect, test, describe } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("AsyncQueue", () => {
  test("should push and pop items", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
  })

  test("should resolve pending next calls", async () => {
    const queue = new AsyncQueue<number>()
    const nextPromise = queue.next()
    
    queue.push(10)
    expect(await nextPromise).toBe(10)
  })

  test("should work as an async iterator", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    const results: number[] = []
    let count = 0
    for await (const item of queue) {
      results.push(item)
      count++
      if (count === 3) break
    }
    
    expect(results).toEqual([1, 2, 3])
  })
})

describe("work", () => {
  test("should process items with concurrency", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    
    await work(2, items, async (item) => {
      processed.push(item)
    })
    
    // items.pop() means it processes in reverse order
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5])
  })

  test("should handle empty items", async () => {
    const processed: number[] = []
    await work(2, [], async (item) => {
      processed.push(item as any)
    })
    expect(processed).toEqual([])
  })
})
