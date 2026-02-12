import { expect, test, describe } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.queue", () => {
  test("AsyncQueue should push and pull items", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
  })

  test("AsyncQueue should wait for items", async () => {
    const queue = new AsyncQueue<number>()
    const nextPromise = queue.next()
    
    queue.push(3)
    expect(await nextPromise).toBe(3)
  })

  test("AsyncQueue should work as async iterator with for-await", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.push(3)
    
    const results: number[] = []
    for await (const item of queue) {
      results.push(item)
      if (results.length === 3) break
    }
    
    expect(results).toEqual([1, 2, 3])
  })

  test("work() should handle concurrency higher than item count", async () => {
    const items = [1, 2]
    const processed: number[] = []
    await work(10, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(2)
  })

  test("work() should process items in parallel", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    await work(2, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(5)
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5])
  })

  test("work() should handle empty items", async () => {
    const processed: number[] = []
    await work(2, [], async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(0)
  })

  test("work() should handle concurrency of 0 (though not recommended)", async () => {
    const items = [1, 2]
    const processed: number[] = []
    await work(0, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(0)
  })

  test("AsyncQueue should handle rapid push/pull", async () => {
    const queue = new AsyncQueue<number>()
    const results: number[] = []
    
    const p = (async () => {
      for (let i = 0; i < 100; i++) {
        results.push(await queue.next())
      }
    })()

    for (let i = 0; i < 100; i++) {
      queue.push(i)
    }

    await p
    expect(results.length).toBe(100)
    expect(results[99]).toBe(99)
  })

  test("AsyncQueue should resolve next() when push() is called later", async () => {
    const queue = new AsyncQueue<number>()
    const nextPromise = queue.next()
    
    // This triggers line 13's resolver.push
    setTimeout(() => queue.push(42), 10)
    
    expect(await nextPromise).toBe(42)
  })

  test("AsyncQueue iterator should wait for items", async () => {
    const queue = new AsyncQueue<number>()
    const results: number[] = []
    
    const pushPromise = (async () => {
      await new Promise(r => setTimeout(r, 10))
      queue.push(1)
      await new Promise(r => setTimeout(r, 10))
      queue.push(2)
    })()
    
    for await (const item of queue) {
      results.push(item)
      if (results.length === 2) break
    }
    
    await pushPromise
    expect(results).toEqual([1, 2])
  })

  test("AsyncQueue.push should resolve multiple waiting next() calls", async () => {
    const queue = new AsyncQueue<number>()
    const p1 = queue.next()
    const p2 = queue.next()
    
    queue.push(10)
    queue.push(20)
    
    expect(await p1).toBe(10)
    expect(await p2).toBe(20)
  })
})
