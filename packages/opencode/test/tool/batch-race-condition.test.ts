import { describe, it, expect, beforeEach } from "bun:test"
import { executeWithConcurrencyLimit } from "../../src/tool/batch"

describe("executeWithConcurrencyLimit - Race Condition Tests", () => {
  it("should handle concurrent promise completion without race conditions", async () => {
    // Create tasks that complete at the same time to trigger the race condition
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      // All tasks complete at roughly the same time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
      return i
    })

    const results = await executeWithConcurrencyLimit(tasks, 3)

    expect(results).toHaveLength(10)
    expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it("should handle tasks that resolve with identical values", async () => {
    // This tests the specific case where indexOf could find the wrong promise
    const tasks = Array.from({ length: 5 }, () => async () => "same-value")

    const results = await executeWithConcurrencyLimit(tasks, 2)

    expect(results).toHaveLength(5)
    expect(results.every(result => result === "same-value")).toBe(true)
  })

  it("should handle mixed success and failure cases", async () => {
    const tasks = [
      async () => "success1",
      async () => { throw new Error("error1") },
      async () => "success2",
      async () => { throw new Error("error2") },
      async () => "success3"
    ]

    // Should return all results (both successes and failures), not reject
    const results = await executeWithConcurrencyLimit(tasks, 3)
    expect(results).toHaveLength(5)

    // Check that we have both success and error results
    const successes = results.filter(r => typeof r === 'string')
    const errors = results.filter(r => r instanceof Error)

    expect(successes).toHaveLength(3)
    expect(errors).toHaveLength(2)
    expect(successes).toEqual(["success1", "success2", "success3"])
    expect(errors.map(e => e.message)).toEqual(["error1", "error2"])
  })

  it("should respect concurrency limit", async () => {
    let concurrentCount = 0
    let maxConcurrent = 0

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)

      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10))

      concurrentCount--
      return i
    })

    await executeWithConcurrencyLimit(tasks, 3)

    // Should never exceed the concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it("should handle empty task array", async () => {
    const results = await executeWithConcurrencyLimit([], 5)
    expect(results).toEqual([])
  })

  it("should handle single task", async () => {
    const tasks = [async () => "single-result"]
    const results = await executeWithConcurrencyLimit(tasks, 5)
    expect(results).toEqual(["single-result"])
  })

  it("should handle limit of 1 (sequential execution)", async () => {
    const executionOrder: number[] = []

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      executionOrder.push(i)
      await new Promise(resolve => setTimeout(resolve, 5))
      return i
    })

    const results = await executeWithConcurrencyLimit(tasks, 1)

    expect(results).toEqual([0, 1, 2, 3, 4])
    expect(executionOrder).toEqual([0, 1, 2, 3, 4])
  })

  it("should handle limit larger than task count", async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => async () => i)
    const results = await executeWithConcurrencyLimit(tasks, 10)
    expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it("should not lose results under high concurrency stress", async () => {
    const taskCount = 100
    const limit = 10

    const tasks = Array.from({ length: taskCount }, (_, i) => async () => {
      // Random delay to increase chance of race conditions
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
      return i
    })

    const results = await executeWithConcurrencyLimit(tasks, limit)

    expect(results).toHaveLength(taskCount)
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: taskCount }, (_, i) => i))
  })
})
