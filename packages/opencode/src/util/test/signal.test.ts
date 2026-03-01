import { describe, it, expect } from "bun:test"
import { signal } from "../signal"

describe("signal", () => {
  it("should create a signal that can be triggered", async () => {
    const { trigger, wait } = signal()
    
    let resolved = false
    const promise = wait().then(() => {
      resolved = true
    })
    
    expect(resolved).toBe(false)
    
    trigger()
    
    await promise
    
    expect(resolved).toBe(true)
  })

  it("should resolve wait promise when trigger is called", async () => {
    const { trigger, wait } = signal()
    
    const start = Date.now()
    
    setTimeout(() => trigger(), 50)
    
    await wait()
    
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  it("should allow multiple waiters on same signal", async () => {
    const { trigger, wait } = signal()
    
    let count = 0
    
    const p1 = wait().then(() => count++)
    const p2 = wait().then(() => count++)
    const p3 = wait().then(() => count++)
    
    trigger()
    
    await Promise.all([p1, p2, p3])
    
    expect(count).toBe(3)
  })

  it("should resolve immediately if already triggered", async () => {
    const { trigger, wait } = signal()
    
    trigger()
    
    // Should resolve immediately
    await expect(wait()).resolves.toBeUndefined()
  })

  it("should work with async operations", async () => {
    const { trigger, wait } = signal()
    
    const results: number[] = []
    
    // Start waiting
    const waiter = wait().then(() => results.push(2))
    
    results.push(1)
    trigger()
    
    await waiter
    
    results.push(3)
    
    expect(results).toEqual([1, 2, 3])
  })
})