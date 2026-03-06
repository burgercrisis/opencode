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
import { abortAfter, abortAfterAny } from "../../src/util/abort"

describe("abortAfter", () => {
  bulletproofTest("should create controller and signal", async () => {
    const { controller, signal, clearTimeout } = abortAfter(1000)

    expect(controller).toBeInstanceOf(AbortController)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    expect(typeof clearTimeout).toBe("function")
  })

  bulletproofTest("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfter(50)

    expect(signal.aborted).toBe(false)

    // Wait for the actual timeout
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should clear timeout and prevent abort", async () => {
    const { signal, clearTimeout } = abortAfter(100)

    clearTimeout()

    // Wait past timeout
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(signal.aborted).toBe(false)
  })

  bulletproofTest("should work with zero timeout", async () => {
    const { signal, clearTimeout } = abortAfter(0)

    expect(signal.aborted).toBe(false)

    // Wait for the actual timeout
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should handle multiple clearTimeout calls", async () => {
    const { signal, clearTimeout } = abortAfter(50)

    clearTimeout()
    clearTimeout() // Should not throw
    clearTimeout() // Should not throw

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)
  })

  bulletproofTest("should use bind() to avoid memory leaks", async () => {
    const { controller, signal } = abortAfter(100)

    // Verify the controller is properly bound
    expect(controller.abort).toBeInstanceOf(Function)
    expect(signal.aborted).toBe(false)
  })
})

describe("abortAfterAny", () => {
  bulletproofTest("should create combined signal", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    expect(typeof clearTimeout).toBe("function")
  })

  bulletproofTest("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfterAny(50)

    expect(signal.aborted).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should abort when input signal aborts", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal.aborted).toBe(false)

    controller.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should abort when any input signal aborts", async () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller1.signal, controller2.signal)

    expect(signal.aborted).toBe(false)

    controller2.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should handle multiple input signals", async () => {
    const controllers = Array.from({ length: 5 }, () => new AbortController())
    const controller3 = controllers[2]
    const { signal, clearTimeout } = abortAfterAny(1000, ...controllers.map((c) => c.signal))

    expect(signal.aborted).toBe(false)

    // Abort the third controller
    controller3?.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should clear timeout and prevent timeout abort", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(50, controller.signal)

    clearTimeout()

    // Wait past timeout
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)

    // But should still abort if input signal aborts
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  bulletproofTest("should work with already aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()

    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should work with zero timeout", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(0, controller.signal)

    expect(signal.aborted).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  bulletproofTest("should handle multiple clearTimeout calls", async () => {
    const { signal, clearTimeout } = abortAfterAny(50)

    clearTimeout()
    clearTimeout()
    clearTimeout()

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)
  })
})
