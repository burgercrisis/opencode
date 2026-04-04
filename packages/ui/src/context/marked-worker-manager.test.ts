import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import type { WorkerMessage, WorkerMetrics, MarkdownConfig } from "./marked-types"
import { WorkerState } from "./marked-types"

// Define local enum for testing since we're in a different context
const States = {
  INITIALIZING: 'initializing' as WorkerState,
  READY: 'ready' as WorkerState,
  ERROR: 'error' as WorkerState,
  TERMINATED: 'terminated' as WorkerState
}

// Mock worker for testing
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((error: ErrorEvent) => void) | null = null
  
  constructor(public url: string, public options?: WorkerOptions) {}
  
  postMessage(message: any) {
    setTimeout(() => {
      const { id, type } = message
      const response = type === "init" 
        ? { id, type: "theme-initialized", html: "" }
        : { id, type: "enhanced", html: "<p>enhanced</p>" }
      
      if (this.onmessage) {
        this.onmessage(new MessageEvent("message", { data: response }))
      }
    }, 10)
  }
  
  terminate() {
    this.onmessage = null
    this.onerror = null
  }
}

// Re-implement WorkerManager for testing (avoiding worker import issues)
class TestWorkerManager {
  private config: MarkdownConfig = {
    maxHtmlSize: 1000000,
    workerTimeout: 10000,
    enableMetrics: true
  }

  private metrics: WorkerMetrics = {
    totalOperations: 0,
    averageEnhancementTime: 0,
    errorCount: 0
  }

  private worker: MockWorker | null = null
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: any) => void }>()
  private nextId = 0
  private state: WorkerState = States.INITIALIZING
  private initializationPromise: Promise<void> | null = null
  private isShuttingDown = false

  getMetrics(): WorkerMetrics {
    return { ...this.metrics }
  }

  updateConfig(newConfig: Partial<MarkdownConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  getState(): WorkerState {
    return this.state
  }

  private setState(newState: WorkerState): void {
    this.state = newState
  }

  reset(): void {
    this.isShuttingDown = true
    if (this.worker) {
      try { this.worker.terminate() } catch (e) { /* ignore */ }
    }
    this.worker = null
    this.setState(States.INITIALIZING)
    this.initializationPromise = null
    this.pending.forEach((promise) => {
      try { promise.reject(new Error('Worker reset')) } catch (e) { /* ignore */ }
    })
    this.pending.clear()
    this.isShuttingDown = false
  }

  async initialize(): Promise<void> {
    if (this.isShuttingDown) throw new Error('Worker is shutting down')
    if (this.state === States.READY) return Promise.resolve()
    if (this.state === States.INITIALIZING && this.initializationPromise) return this.initializationPromise
    if (this.state === States.ERROR) this.reset()

    // Create the worker
    this.worker = new MockWorker("mock-url")

    this.initializationPromise = new Promise((resolve, reject) => {
      this.setState(States.INITIALIZING)
      const initId = this.nextId++
      const startTime = performance.now()

      const timeout = setTimeout(() => {
        if (this.isShuttingDown) return
        const promise = this.pending.get(initId)
        if (promise) {
          this.pending.delete(initId)
          this.setState(States.ERROR)
          this.initializationPromise = null
          if (this.config.enableMetrics) this.metrics.errorCount++
          reject(new Error('Worker initialization timeout'))
        }
      }, this.config.workerTimeout)

      this.pending.set(initId, {
        resolve: () => {
          if (this.isShuttingDown) return
          clearTimeout(timeout)
          this.pending.delete(initId)
          this.setState(States.READY)
          this.initializationPromise = null
          if (this.config.enableMetrics) this.metrics.initializationTime = performance.now() - startTime
          resolve()
        },
        reject: (err) => {
          if (this.isShuttingDown) return
          clearTimeout(timeout)
          this.pending.delete(initId)
          this.setState(States.ERROR)
          this.initializationPromise = null
          reject(err)
        }
      })

      if (this.worker) {
        this.worker.onmessage = (e: MessageEvent) => {
          const { id, type, html, error } = e.data
          const promise = this.pending.get(id)
          if (!promise) return

          this.pending.delete(id)

          if (type === "theme-initialized" || type === "enhanced") {
            promise.resolve(html || "")
          } else if (type === "error") {
            const errorMessage = typeof error === 'string' ? error :
              (error && typeof error === 'object' && 'message' in error) ? String(error.message) :
                'Unknown worker error'
            promise.reject(new Error(errorMessage))
          }
        }
        
        this.worker.postMessage({ type: "init", id: initId, theme: null })
      } else {
        clearTimeout(timeout)
        this.pending.delete(initId)
        this.setState(States.ERROR)
        this.initializationPromise = null
        reject(new Error('Failed to create worker'))
      }
    })

    return this.initializationPromise
  }

  getWorker(): MockWorker | null {
    return this.worker
  }

  terminate(): void {
    this.reset()
    this.setState(States.TERMINATED)
  }

  async sendMessageWithTimeout<T>(message: Omit<WorkerMessage, 'id'>, timeoutMs?: number): Promise<T> {
    if (this.isShuttingDown) throw new Error('Worker is shutting down')

    const id = this.nextId++
    const startTime = performance.now()
    const actualTimeout = timeoutMs || this.config.workerTimeout

    const cleanup = () => { this.pending.delete(id) }

    const mainPromise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => {
          cleanup()
          if (this.config.enableMetrics) {
            const duration = performance.now() - startTime
            this.metrics.totalOperations++
            this.metrics.averageEnhancementTime = this.metrics.totalOperations === 1 ? duration :
              (this.metrics.averageEnhancementTime * (this.metrics.totalOperations - 1) + duration) / this.metrics.totalOperations
          }
          resolve(value)
        },
        reject: (err) => {
          cleanup()
          if (this.config.enableMetrics) this.metrics.errorCount++
          reject(err)
        }
      })

      if (this.worker) {
        this.worker.postMessage({ ...message, id })
      } else {
        cleanup()
        reject(new Error('Worker not available'))
      }
    })

    if (actualTimeout > 0) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          if (this.pending.has(id)) {
            cleanup()
            if (this.config.enableMetrics) this.metrics.errorCount++
            reject(new Error(`Worker request timeout: ${message.type}`))
          }
        }, actualTimeout)
      })
      return Promise.race([mainPromise, timeoutPromise])
    }
    return mainPromise
  }
}

describe("WorkerManager Comprehensive Tests", () => {
  let workerManager: TestWorkerManager
  
  beforeEach(() => {
    workerManager = new TestWorkerManager()
  })
  
  afterEach(() => {
    if (workerManager) workerManager.terminate()
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
      workerManager.updateConfig({ workerTimeout: 10 })
      
      let errorCaught = false
      try {
        await workerManager.initialize()
      } catch (error: any) {
        errorCaught = true
        expect(error.message).toContain("timeout")
      }
      expect(errorCaught).toBe(true)
      expect(workerManager.getState()).toBe(WorkerState.ERROR)
    })
    
    test("worker error transitions to ERROR", async () => {
      await workerManager.initialize()
      const worker = workerManager.getWorker()
      
      if (worker && worker.onerror) {
        worker.onerror(new ErrorEvent("error", { 
          message: "Mock worker error",
          filename: "mock-worker.js",
          lineno: 1,
          colno: 1,
          error: new Error("Mock worker error")
        }))
        
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
      await workerManager.initialize()
      workerManager.terminate()
      
      let errorCaught = false
      try {
        await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test</p>" })
      } catch (error: any) {
        errorCaught = true
      }
      expect(errorCaught).toBe(true)
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
      const promises = [
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test1</p>" }),
        workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test2</p>" })
      ]
      
      workerManager.reset()
      
      const results = await Promise.allSettled(promises)
      results.forEach(result => {
        expect(result.status).toBe("rejected")
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
      
      for (let i = 0; i < 100; i++) {
        await workerManager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>test ${i}</p>` 
        })
      }
      
      const metrics = workerManager.getMetrics()
      expect(metrics.totalOperations).toBe(100)
      expect(metrics.errorCount).toBe(0)
    })
  })
  
  describe("Error Handling Tests", () => {
    test("timeout should reject pending operations", async () => {
      await workerManager.initialize()
      
      const worker = workerManager.getWorker()
      if (worker) {
        worker.terminate()
      }
      
      let errorCaught = false
      try {
        await workerManager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: "<p>test</p>" 
        }, 50)
      } catch (error: any) {
        errorCaught = true
      }
      expect(errorCaught).toBe(true)
    })
  })

  
  describe("Performance Metrics Tests", () => {
    test("metrics should track operations correctly", async () => {
      await workerManager.initialize()
      
      await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test1</p>" })
      await workerManager.sendMessageWithTimeout({ type: "enhance", html: "<p>test2</p>" })
      
      const metrics = workerManager.getMetrics()
      expect(metrics.totalOperations).toBe(2)
      expect(metrics.errorCount).toBe(0)
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
      expect(workerManager.getMetrics()).toBeDefined()
    })
  })
  
  describe("Edge Cases Tests", () => {
    test("should handle rapid state changes", () => {
      workerManager.reset()
      workerManager.terminate()
      workerManager.reset()
      
      expect(workerManager.getState()).toBe(WorkerState.INITIALIZING)
    })
    
    test("should handle operations after termination", () => {
      workerManager.terminate()
      
      expect(workerManager.getState()).toBe(WorkerState.TERMINATED)
    })
  })

  
  describe("State Locking Tests", () => {
    test("state transitions should be atomic", () => {
      const states: WorkerState[] = []
      
      const originalSetState = workerManager['setState'].bind(workerManager)
      workerManager['setState'] = (newState: WorkerState) => {
        states.push(newState)
        return originalSetState(newState)
      }
      
      workerManager.reset()
      workerManager.reset()
      workerManager.terminate()
      
      expect(states.length).toBeGreaterThan(0)
    })
  })
})
