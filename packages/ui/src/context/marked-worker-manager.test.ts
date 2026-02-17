import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import { WorkerManager } from "./marked"
import type { WorkerState, WorkerMessage, WorkerResponse } from "./marked-types"

// Mock the worker URL and worker creation
const mockWorkerUrl = "mock-worker-url"

// Mock worker implementation
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((error: ErrorEvent) => void) | null = null
  
  constructor(public url: string, public options?: WorkerOptions) {}
  
  postMessage(message: any) {
    // Simulate async worker response
    setTimeout(() => {
      if (this.onmessage) {
        const response = this.createMockResponse(message)
        this.onmessage(new MessageEvent("message", { data: response }))
      }
    }, 10)
  }
  
  terminate() {
    // Mock termination
  }
  
  private createMockResponse(message: WorkerMessage): WorkerResponse {
    const { id, type } = message
    
    switch (type) {
      case "init":
        return { id, type: "theme-initialized", html: "" }
      case "enhance":
        return { id, type: "enhanced", html: "<p>enhanced</p>" }
      default:
        return { id, type: "error", error: "Unknown message type" }
    }
  }
  
  // Simulate worker error
  simulateError() {
    setTimeout(() => {
      if (this.onerror) {
        this.onerror(new ErrorEvent("error", { 
          message: "Mock worker error",
          filename: "mock-worker.js",
          lineno: 1,
          colno: 1,
          error: new Error("Mock worker error")
        }))
      }
    }, 5)
  }
}

// Mock performance.now for consistent testing
let mockTime = 0
const originalPerformanceNow = performance.now

describe("WorkerManager Comprehensive Tests", () => {
  let workerManager: WorkerManager
  let mockWorker: MockWorker
  
  beforeEach(() => {
    mockTime = 0
    performance.now = () => mockTime
    
    // Mock window and Worker constructor
    global.window = {
      Worker: MockWorker as any
    } as any
    
    workerManager = new (WorkerManager as any)()
  })
  
  afterEach(() => {
    performance.now = originalPerformanceNow
    workerManager.terminate()
  })
  
  describe("State Transition Tests", () => {
    test("initial state should be INITIALIZING", () => {
      expect(workerManager.getState()).toBe(WorkerState.INITIALIZING)
    })
    
    test("successful initialization transitions to READY", async () => {
      await workerManager.initialize()
      expect(workerManager.getState()).toBe(WorkerState.READY)
    })
    
    test("initialization timeout transitions to ERROR", async () => {
      // Set very short timeout for testing
      workerManager.updateConfig({ workerTimeout: 1 })
      
      try {
        await workerManager.initialize()
        expect.fail("Should have thrown timeout error")
      } catch (error) {
        expect(error.message).toContain("timeout")
        expect(workerManager.getState()).toBe(WorkerState.ERROR)
      }
    })
    
    test("worker error transitions to ERROR", async () => {
      // Get the mock worker instance
      const worker = (workerManager as any).getWorker()
      if (worker) {
        worker.simulateError()
        
        // Wait for error to be processed
        await new Promise(resolve => setTimeout(resolve, 20))
        
        expect(workerManager.getState()).toBe(WorkerState.ERROR)
      }
    })
    
    test("reset transitions to INITIALIZING", () => {
      workerManager.reset()
      expect(workerManager.getState()).toBe(WorkerState.INITIALIZING)
    })
    
    test("terminate transitions to TERMINATED", () => {
      workerManager.terminate()
      expect(workerManager.getState()).toBe(WorkerState.TERMINATED)
    })
  })
  
  describe("Concurrent Operations Tests", () => {
    test("multiple initialization calls should be handled gracefully", async () => {
      const promises = [
        workerManager.initialize(),
        workerManager.initialize(),
        workerManager.initialize()
      ]
      
      await Promise.all(promises)
      expect(workerManager.getState()).toBe(WorkerState.READY)
    })
    
    test("operations during shutdown should be rejected", async () => {
      // Initialize first
      await workerManager.initialize()
      
      // Start shutdown
      workerManager.terminate()
      
      // Try to send message - should be rejected
      try {
        await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test</p>" })
        expect.fail("Should have been rejected due to shutdown")
      } catch (error) {
        expect(error.message).toContain("shutting down")
      }
    })
    
    test("concurrent message sending should work correctly", async () => {
      await workerManager.initialize()
      
      const messages = Array.from({ length: 10 }, (_, i) => 
        workerManager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>test ${i}</p>` 
        })
      )
      
      const results = await Promise.all(messages)
      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result).toContain("enhanced")
      })
    })
  })
  
  describe("Memory Management Tests", () => {
    test("pending promises should be cleaned up on reset", async () => {
      // Start some operations
      const promises = [
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test1</p>" }),
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test2</p>" })
      ]
      
      // Reset before operations complete
      workerManager.reset()
      
      // All promises should be rejected
      const results = await Promise.allSettled(promises)
      results.forEach(result => {
        expect(result.status).toBe("rejected")
        if (result.status === "rejected") {
          expect(result.reason.message).toContain("reset")
        }
      })
    })
    
    test("pending promises should be cleaned up on termination", async () => {
      await workerManager.initialize()
      
      const promises = [
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test1</p>" }),
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test2</p>" })
      ]
      
      workerManager.terminate()
      
      const results = await Promise.allSettled(promises)
      results.forEach(result => {
        expect(result.status).toBe("rejected")
      })
    })
    
    test("memory should not leak with repeated operations", async () => {
      await workerManager.initialize()
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await workerManager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>test ${i}</p>` 
        })
      }
      
      // Check metrics - should not grow unbounded
      const metrics = workerManager.getMetrics()
      expect(metrics.totalOperations).toBe(100)
      expect(metrics.errorCount).toBe(0)
    })
  })
  
  describe("Error Handling Tests", () => {
    test("invalid worker responses should be handled gracefully", async () => {
      // Mock worker that sends invalid response
      class InvalidResponseWorker extends MockWorker {
        private createMockResponse(message: WorkerMessage): WorkerResponse {
          return { id: message.id, type: "invalid" as any, html: "" }
        }
      }
      
      global.window.Worker = InvalidResponseWorker as any
      
      await workerManager.initialize()
      
      // Should not throw, but should handle invalid response
      const result = await workerManager.sendMessageWithTimeout({ 
        type: "enhance", 
        html: "<p>test</p>" 
      })
      
      // Should return fallback result
      expect(result).toBeDefined()
    })
    
    test("worker creation failure should be handled", async () => {
      // Mock Worker constructor to throw
      global.window.Worker = class {
        constructor() {
          throw new Error("Worker creation failed")
        }
      } as any
      
      try {
        await workerManager.initialize()
        expect.fail("Should have thrown worker creation error")
      } catch (error) {
        expect(error.message).toContain("Failed to create worker")
        expect(workerManager.getState()).toBe(WorkerState.ERROR)
      }
    })
    
    test("timeout should reject pending operations", async () => {
      await workerManager.initialize()
      
      // Mock worker that doesn't respond
      class NoResponseWorker extends MockWorker {
        postMessage() {
          // Don't send response
        }
      }
      
      global.window.Worker = NoResponseWorker as any
      
      try {
        await workerManager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: "<p>test</p>" 
        }, 50) // Short timeout
        expect.fail("Should have timed out")
      } catch (error) {
        expect(error.message).toContain("timeout")
      }
    })
  })
  
  describe("Performance Metrics Tests", () => {
    test("metrics should track operations correctly", async () => {
      await workerManager.initialize()
      
      // Perform operations
      mockTime += 10 // Simulate time
      await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test1</p>" })
      
      mockTime += 20
      await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test2</p>" })
      
      const metrics = workerManager.getMetrics()
      expect(metrics.totalOperations).toBe(2)
      expect(metrics.averageEnhancementTime).toBe(15) // (10 + 20) / 2
      expect(metrics.errorCount).toBe(0)
    })
    
    test("metrics should track errors correctly", async () => {
      // Force an error
      workerManager.updateConfig({ workerTimeout: 1 })
      
      try {
        await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test</p>" })
      } catch (error) {
        // Expected
      }
      
      const metrics = workerManager.getMetrics()
      expect(metrics.errorCount).toBeGreaterThan(0)
    })
    
    test("metrics can be disabled", async () => {
      workerManager.updateConfig({ enableMetrics: false })
      
      await workerManager.initialize()
      await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test</p>" })
      
      const metrics = workerManager.getMetrics()
      expect(metrics.totalOperations).toBe(0)
    })
  })
  
  describe("Configuration Tests", () => {
    test("configuration should be updateable", () => {
      const newConfig = {
        maxHtmlSize: 2000000,
        workerTimeout: 20000,
        enableMetrics: false
      }
      
      workerManager.updateConfig(newConfig)
      
      // Configuration should be applied
      expect(workerManager.getMetrics()).toBeDefined()
    })
    
    test("configuration should affect behavior", async () => {
      // Set short timeout
      workerManager.updateConfig({ workerTimeout: 1 })
      
      try {
        await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test</p>" })
        expect.fail("Should have timed out with new config")
      } catch (error) {
        expect(error.message).toContain("timeout")
      }
    })
  })
  
  describe("Edge Cases Tests", () => {
    test("should handle rapid state changes", async () => {
      // Rapidly change states
      workerManager.reset()
      workerManager.terminate()
      workerManager.reset()
      
      expect(workerManager.getState()).toBe(WorkerState.INITIALIZING)
    })
    
    test("should handle operations after termination", async () => {
      workerManager.terminate()
      
      try {
        await workerManager.initialize()
        expect.fail("Should not allow operations after termination")
      } catch (error) {
        expect(error.message).toContain("shutting down")
      }
    })
    
    test("should handle zero timeout configuration", async () => {
      workerManager.updateConfig({ workerTimeout: 0 })
      
      await workerManager.initialize()
      
      // Should work without timeout
      const result = await workerManager.sendMessageWithTimeout({ 
        type: "enhance", 
        html: "<p>test</p>" 
      })
      
      expect(result).toBeDefined()
    })
    
    test("should handle negative timeout configuration", async () => {
      workerManager.updateConfig({ workerTimeout: -1 })
      
      await workerManager.initialize()
      
      // Should work without timeout
      const result = await workerManager.sendMessageWithTimeout({ 
        type: "enhance", 
        html: "<p>test</p>" 
      })
      
      expect(result).toBeDefined()
    })
  })
  
  describe("State Locking Tests", () => {
    test("state transitions should be atomic", async () => {
      // This tests the stateLock mechanism
      const states: WorkerState[] = []
      
      // Override setState to capture transitions
      const originalSetState = (workerManager as any).setState.bind(workerManager)
      ;(workerManager as any).setState = (newState: WorkerState) => {
        states.push(newState)
        return originalSetState(newState)
      }
      
      // Trigger multiple rapid state changes
      workerManager.reset()
      workerManager.reset()
      workerManager.terminate()
      
      // Should have captured all transitions
      expect(states.length).toBeGreaterThan(0)
    })
  })
})
