import { describe, it, expect } from "bun:test"
import { AsyncQueue, work } from "../queue"

describe("AsyncQueue", () => {
  describe("push and next", () => {
    it("should push items and retrieve them with next", async () => {
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
      
      // Should not resolve immediately
      expect(resolved).toBe(false)
      
      // Push an item
      queue.push("hello")
      
      const result = await promise
      
      expect(result).toBe("hello")
      expect(resolved).toBe(true)
    })
    
    it("should handle multiple waiters", async () => {
      const queue = new AsyncQueue<number>()
      
      const p1 = queue.next()
      const p2 = queue.next()
      const p3 = queue.next()
      
      queue.push(1)
      queue.push(2)
      queue.push(3)
      
      const results = await Promise.all([p1, p2, p3])
      
      expect(results).toEqual([1, 2, 3])
    })
  })
  
  describe("async iterator", () => {
    it("should work as async iterable", async () => {
      const queue = new AsyncQueue<number>()
      
      queue.push(1)
      queue.push(2)
      queue.push(3)
      
      const results: number[] = []
      
      // Take only first 3 items
      let count = 0
      for await (const item of queue) {
        results.push(item)
        count++
        if (count >= 3) break
      }
      
      expect(results).toEqual([1, 2, 3])
    })
  })
})

describe("work", () => {
  it("should process items with given concurrency", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    
    await work(2, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.length).toBe(5)
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5])
  })
  
  it("should respect concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5]
    let concurrentCount = 0
    let maxConcurrent = 0
    
    await work(2, items, async () => {
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)
      await new Promise(resolve => setTimeout(resolve, 10))
      concurrentCount--
    })
    
    expect(maxConcurrent).toBe(2)
  })
  
  it("should handle empty items array", async () => {
    const processed: number[] = []
    
    await work(2, [], async (item) => {
      processed.push(item)
    })
    
    expect(processed).toEqual([])
  })
  
  it("should handle single item", async () => {
    const items = [42]
    const processed: number[] = []
    
    await work(1, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed).toEqual([42])
  })
  
  it("should process all items even with higher concurrency than items", async () => {
    const items = [1, 2]
    const processed: number[] = []
    
    await work(10, items, async (item) => {
      processed.push(item)
    })
    
    expect(processed.sort()).toEqual([1, 2])
  })
})