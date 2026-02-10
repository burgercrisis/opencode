import { expect, test, describe, vi } from "bun:test"
import { EventLoop } from "../../src/util/eventloop"

describe("EventLoop", () => {
  test("wait() should resolve when event loop is empty", async () => {
    // We can mock the internals to test the logic
    const originalHandles = (process as any)._getActiveHandles
    const originalRequests = (process as any)._getActiveRequests
    
    let count = 2
    ;(process as any)._getActiveHandles = () => count > 0 ? [1] : []
    ;(process as any)._getActiveRequests = () => []
    
    const waitPromise = EventLoop.wait()
    
    // Decrease count over time
    setTimeout(() => { count = 1 }, 10)
    setTimeout(() => { count = 0 }, 20)
    
    await waitPromise
    expect(count).toBe(0)
    
    ;(process as any)._getActiveHandles = originalHandles
    ;(process as any)._getActiveRequests = originalRequests
  })
})
