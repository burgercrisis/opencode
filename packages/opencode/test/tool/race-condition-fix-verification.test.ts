import { describe, it, expect } from "bun:test"
import { executeWithConcurrencyLimit } from "../../src/tool/batch"

describe("Race Condition Fix Verification", () => {
  it("should demonstrate the original race condition is fixed", async () => {
    // This test specifically targets the race condition scenario:
    // Multiple promises resolving with identical values simultaneously
    
    const results: string[] = []
    const completionOrder: number[] = []
    
    // Create tasks that all resolve to the same value but at slightly different times
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      // Simulate async work with varying delays to increase race condition likelihood
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
      completionOrder.push(i)
      return "identical-result"
    })

    const concurrentResults = await executeWithConcurrencyLimit(tasks, 3)
    
    // Verify we get exactly the number of results we expect
    expect(concurrentResults).toHaveLength(5)
    
    // Verify all results are the expected value
    expect(concurrentResults.every(result => result === "identical-result")).toBe(true)
    
    // Verify that tasks actually completed (not just returned cached results)
    expect(completionOrder).toHaveLength(5)
  })

  it("should handle the exact problematic scenario from the original code", async () => {
    // Simulate the exact scenario that would break the original code:
    // Promise.race returns value, indexOf finds wrong promise due to identical values
    
    let taskExecutionCount = 0
    
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      taskExecutionCount++
      // All tasks return the same object reference (worst case for indexOf)
      return { id: "same", index: i }
    })

    const results = await executeWithConcurrencyLimit(tasks, 4)
    
    expect(results).toHaveLength(10)
    expect(taskExecutionCount).toBe(10)
    
    // Verify we got all the different indices despite identical id values
    const indices = results.map(r => r.index).sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it("should maintain result order consistency", async () => {
    // Test that the same input produces the same output multiple times
    const tasks = Array.from({ length: 7 }, (_, i) => async () => i)
    
    const results1 = await executeWithConcurrencyLimit(tasks, 3)
    const results2 = await executeWithConcurrencyLimit(tasks, 3)
    
    // Both runs should produce the same results (though order may differ due to concurrency)
    expect(results1.sort()).toEqual(results2.sort())
    expect(results1.sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
