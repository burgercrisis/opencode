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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as State from "../state"

describe("State Module", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  beforeEach(() => {
    // Reset state before each test
    State.resetForTest()
  })

  afterEach(() => {
    // Clean up after each test
    State.resetForTest()
  })

  describe("create function", () => {
    it("should create new state for new root", () => {
      const rootFn = () => "test-key"
      const initFn = () => ({ value: "test-value" })

      const getState = State.create(rootFn, initFn)

      const state = getState()
      expect(state).toEqual({ value: "test-value" })
    })

    it("should return existing state for same root and init", () => {
      const rootFn = () => "test-key"
      const initFn = () => ({ value: "test-value" })

      const getState1 = State.create(rootFn, initFn)
      const state1 = getState1()
      
      const getState2 = State.create(rootFn, initFn)
      const state2 = getState2()

      expect(state1).toBe(state2) // Should be the same object reference
    })

    it("should create separate states for different roots", () => {
      const rootFn1 = () => "key1"
      const rootFn2 = () => "key2"
      const initFn = () => ({ value: "test-value" })

      const getState1 = State.create(rootFn1, initFn)
      const getState2 = State.create(rootFn2, initFn)

      const state1 = getState1()
      const state2 = getState2()

      expect(state1).not.toBe(state2) // Should be different objects
    })

    it("should create separate states for different init functions", () => {
      const rootFn = () => "test-key"
      const initFn1 = () => ({ value: "value1" })
      const initFn2 = () => ({ value: "value2" })

      const getState1 = State.create(rootFn, initFn1)
      const getState2 = State.create(rootFn, initFn2)

      const state1 = getState1()
      const state2 = getState2()

      expect(state1).not.toBe(state2) // Should be different objects
      expect(state1).toEqual({ value: "value1" })
      expect(state2).toEqual({ value: "value2" })
    })

    it("should handle async init function", async () => {
      const rootFn = () => "test-key"
      const initFn = async () => ({ value: "async-value" })

      const getState = State.create(rootFn, initFn)
      const state = await getState()

      expect(state).toEqual({ value: "async-value" })
    })

    it("should handle dispose function", () => {
      const rootFn = () => "test-key"
      let disposeCalled = false
      let disposeState: any

      const initFn = () => ({ value: "test-value" })
      const disposeFn = async (state: any) => {
        disposeCalled = true
        disposeState = state
      }

      const getState = State.create(rootFn, initFn, disposeFn)
      const state = getState()

      expect(state).toEqual({ value: "test-value" })

      // The dispose function should be stored but not called yet
      expect(disposeCalled).toBe(false)
    })
  })

  describe("dispose function", () => {
    it("should dispose state for existing key", async () => {
      const rootFn = () => "dispose-test-key"
      let disposeCalled = false
      let disposeState: any

      const initFn = () => ({ value: "test-value" })
      const disposeFn = async (state: any) => {
        disposeCalled = true
        disposeState = state
      }

      // Create state
      State.create(rootFn, initFn, disposeFn)

      // Dispose the state
      await State.dispose("dispose-test-key")

      expect(disposeCalled).toBe(true)
      expect(disposeState).toEqual({ value: "test-value" })
    })

    it("should handle non-existent key gracefully", async () => {
      // Should not throw for non-existent key
      await expect(State.dispose("non-existent-key")).resolves.toBeUndefined()
    })

    it("should handle multiple states for same key", async () => {
      const rootFn = () => "multi-test-key"
      const disposeCalls: any[] = []

      const initFn1 = () => ({ id: 1, value: "value1" })
      const initFn2 = () => ({ id: 2, value: "value2" })
      const disposeFn1 = async (state: any) => disposeCalls.push({ id: 1, state })
      const disposeFn2 = async (state: any) => disposeCalls.push({ id: 2, state })

      // Create multiple states for same key
      State.create(rootFn, initFn1, disposeFn1)
      State.create(rootFn, initFn2, disposeFn2)

      // Dispose all states for the key
      await State.dispose("multi-test-key")

      expect(disposeCalls).toHaveLength(2)
      expect(disposeCalls[0]).toEqual({ id: 1, state: { id: 1, value: "value1" } })
      expect(disposeCalls[1]).toEqual({ id: 2, state: { id: 2, value: "value2" } })
    })

    it("should handle dispose function errors gracefully", async () => {
      const rootFn = () => "error-test-key"
      let errorLogged = false
      let logError: any
      let logKey: any

      const initFn = () => ({ value: "test-value" })
      const disposeFn = async (state: any) => {
        throw new Error("Dispose failed")
      }

      // Mock log.error
      const originalLogError = (global as any).log?.error
      ;(global as any).log = {
        error: (message: string, data: any) => {
          errorLogged = true
          logError = message
          logKey = data.key
        }
      }

      // Create state
      State.create(rootFn, initFn, disposeFn)

      // Dispose should handle error gracefully
      await State.dispose("error-test-key")

      expect(errorLogged).toBe(true)
      expect(logError).toBe("Error while disposing state:")
      expect(logKey).toBe("error-test-key")

      // Restore
      if (originalLogError) {
        ;(global as any).log.error = originalLogError
      }
    })

    it("should handle dispose function without error", async () => {
      const rootFn = () => "no-dispose-test-key"
      let errorLogged = false

      const initFn = () => ({ value: "test-value" })
      const disposeFn = async (state: any) => {
        // Successful dispose
      }

      // Mock log.error
      const originalLogError = (global as any).log?.error
      ;(global as any).log = {
        error: (message: string, data: any) => {
          errorLogged = true
        }
      }

      // Create state
      State.create(rootFn, initFn, disposeFn)

      // Dispose should not log errors
      await State.dispose("no-dispose-test-key")

      expect(errorLogged).toBe(false)

      // Restore
      if (originalLogError) {
        ;(global as any).log.error = originalLogError
      }
    })

    it("should clear entries and delete key", async () => {
      const rootFn = () => "cleanup-test-key"
      const initFn = () => ({ value: "test-value" })

      // Create state
      const getState = State.create(rootFn, initFn)
      const state = getState()
      expect(state).toEqual({ value: "test-value" })

      // Dispose
      await State.dispose("cleanup-test-key")

      // Try to create state again - should create new instance
      const getStateAfter = State.create(rootFn, initFn)
      const stateAfter = getStateAfter()

      expect(stateAfter).not.toBe(state) // Should be different object
      expect(stateAfter).toEqual({ value: "test-value" })
    })

    it("should log disposal start and completion", async () => {
      const rootFn = () => "log-test-key"
      let logMessages: string[] = []

      const initFn = () => ({ value: "test-value" })

      // Mock log.info and log.warn
      const originalLogInfo = (global as any).log?.info
      const originalLogWarn = (global as any).log?.warn
      ;(global as any).log = {
        info: (message: string, data: any) => {
          logMessages.push(`info: ${message}`)
        },
        warn: (message: string, data: any) => {
          logMessages.push(`warn: ${message}`)
        }
      }

      // Create and dispose state
      State.create(rootFn, initFn)
      await State.dispose("log-test-key")

      expect(logMessages).toContain("info: waiting for state disposal to complete")
      expect(logMessages).toContain("info: state disposal completed")

      // Restore
      if (originalLogInfo) {
        ;(global as any).log.info = originalLogInfo
      }
      if (originalLogWarn) {
        ;(global as any).log.warn = originalLogWarn
      }
    })
  })

  describe("resetForTest function", () => {
    it("should clear all state records", () => {
      const rootFn1 = () => "reset-test-1"
      const rootFn2 = () => "reset-test-2"
      const initFn = () => ({ value: "test" })

      // Create states
      State.create(rootFn1, initFn)
      State.create(rootFn2, initFn)

      // Reset
      State.resetForTest()

      // After reset, creating states should work normally
      const getState1 = State.create(rootFn1, initFn)
      const getState2 = State.create(rootFn2, initFn)

      const state1 = getState1()
      const state2 = getState2()

      expect(state1).toEqual({ value: "test" })
      expect(state2).toEqual({ value: "test" })
      expect(state1).not.toBe(state2) // Should be different objects
    })
  })

  describe("timeout handling", () => {
    it("should warn on long disposal", async () => {
      const rootFn = () => "timeout-test-key"
      let warnLogged = false

      const initFn = () => ({ value: "test-value" })
      const slowDisposeFn = async (state: any) => {
        // Simulate slow disposal
        await new Promise(resolve => setTimeout(resolve, 15000))
      }

      // Mock log.warn
      const originalLogWarn = (global as any).log?.warn
      ;(global as any).log = {
        info: () => {},
        warn: (message: string, data: any) => {
          if (message.includes("taking an unusually long time")) {
            warnLogged = true
          }
        }
      }

      // Create state and start disposal
      State.create(rootFn, initFn, slowDisposeFn)
      
      // Start disposal but don't wait for it
      const disposePromise = State.dispose("timeout-test-key")

      // Wait for warning to be logged
      await new Promise(resolve => setTimeout(resolve, 12000))

      expect(warnLogged).toBe(true)

      // Clean up
      await disposePromise

      // Restore
      if (originalLogWarn) {
        ;(global as any).log.warn = originalLogWarn
      }
    })
  })

  describe("complex scenarios", () => {
    it("should handle mixed sync/async init functions", async () => {
      const rootFn1 = () => "sync-key"
      const rootFn2 = () => "async-key"
      
      const syncInitFn = () => ({ type: "sync", value: "sync-value" })
      const asyncInitFn = async () => ({ type: "async", value: "async-value" })

      const getStateSync = State.create(rootFn1, syncInitFn)
      const getStateAsync = State.create(rootFn2, asyncInitFn)

      const syncState = getStateSync()
      const asyncState = await getStateAsync()

      expect(syncState).toEqual({ type: "sync", value: "sync-value" })
      expect(asyncState).toEqual({ type: "async", value: "async-value" })
    })

    it("should handle dispose function returning promises", async () => {
      const rootFn = () => "promise-dispose-key"
      let disposeOrder: number[] = []

      const initFn1 = () => ({ id: 1 })
      const initFn2 = () => ({ id: 2 })
      const disposeFn1 = async (state: any) => {
        disposeOrder.push(1)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      const disposeFn2 = async (state: any) => {
        disposeOrder.push(2)
        await new Promise(resolve => setTimeout(resolve, 5))
      }

      // Create states
      State.create(rootFn1, initFn1, disposeFn1)
      State.create(rootFn2, initFn2, disposeFn2)

      // Dispose - should wait for all dispose functions
      await State.dispose("promise-dispose-key")

      // Both dispose functions should have been called
      expect(disposeOrder).toContain(1)
      expect(disposeOrder).toContain(2)
    })

    it("should handle function names in logging", async () => {
      const rootFn = () => "named-key"
      let loggedInit: any

      const namedInitFn = function testInit() {
        return { value: "test" }
      }

      const disposeFn = async (state: any) => {
        // Dispose function
      }

      // Mock log.error
      const originalLogError = (global as any).log?.error
      ;(global as any).log = {
        info: () => {},
        error: (message: string, data: any) => {
          if (data.init) {
            loggedInit = data.init
          }
        }
      }

      // Create state with named function
      State.create(rootFn, namedInitFn, disposeFn)
      await State.dispose("named-key")

      // The function name should be logged if there's an error
      // In this case, no error, so we just verify the setup
      expect(typeof loggedInit).toBe("string")

      // Restore
      if (originalLogError) {
        ;(global as any).log.error = originalLogError
      }
    })
  })
})
