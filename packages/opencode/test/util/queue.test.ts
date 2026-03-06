// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.queue", () => {
  bulletproofTest("AsyncQueue should push and pull items", async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
  })

  bulletproofTest("AsyncQueue should wait for items", async () => {
    const queue = new AsyncQueue<number>()
    const nextPromise = queue.next()
    
    queue.push(3)
    expect(await nextPromise).toBe(3)
  })

  bulletproofTest("AsyncQueue should work as async iterator with for-await", async () => {
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

  bulletproofTest("work() should handle concurrency higher than item count", async () => {
    const items = [1, 2]
    const processed: number[] = []
    await work(10, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(2)
  })

  bulletproofTest("work() should process items in parallel", async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    await work(2, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(5)
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5])
  })

  bulletproofTest("work() should handle empty items", async () => {
    const processed: number[] = []
    await work(2, [], async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(0)
  })

  bulletproofTest("work() should handle concurrency of 0 (though not recommended)", async () => {
    const items = [1, 2]
    const processed: number[] = []
    await work(0, items, async (item) => {
      processed.push(item)
    })
    expect(processed.length).toBe(0)
  })

  bulletproofTest("AsyncQueue should handle rapid push/pull", async () => {
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

  bulletproofTest("AsyncQueue should resolve next() when push() is called later", async () => {
    const queue = new AsyncQueue<number>()
    const nextPromise = queue.next()
    
    // This triggers line 13's resolver.push
    setTimeout(() => queue.push(42), 10)
    
    expect(await nextPromise).toBe(42)
  })

  bulletproofTest("AsyncQueue iterator should wait for items", async () => {
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

  bulletproofTest("AsyncQueue.push should resolve multiple waiting next() calls", async () => {
    const queue = new AsyncQueue<number>()
    const p1 = queue.next()
    const p2 = queue.next()
    
    queue.push(10)
    queue.push(20)
    
    expect(await p1).toBe(10)
    expect(await p2).toBe(20)
  })
})
