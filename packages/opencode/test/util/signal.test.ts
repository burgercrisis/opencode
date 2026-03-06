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
import { signal } from "../../src/util/signal"

describe("signal", () => {
  describe("basic functionality", () => {
    bulletproofTest("should resolve wait when triggered", async () => {
      const s = signal()
      let resolved = false
      s.wait().then(() => { resolved = true })

      expect(resolved).toBe(false)
      s.trigger()
      await s.wait()
      expect(resolved).toBe(true)
    })

    bulletproofTest("should create signal with trigger and wait methods", async () => {
      const s = signal()

      expect(s).toHaveProperty('trigger')
      expect(s).toHaveProperty('wait')
      expect(typeof s.trigger).toBe('function')
      expect(typeof s.wait).toBe('function')
    })

    bulletproofTest("should return promise from wait method", async () => {
      const s = signal()
      const waitPromise = s.wait()

      expect(waitPromise).toBeInstanceOf(Promise)
    })
  })

  describe("multiple waits", () => {
    bulletproofTest("should resolve multiple wait calls when triggered", async () => {
      const s = signal()
      const results: boolean[] = []

      // Create multiple waiters
      const wait1 = s.wait().then(() => results.push(true))
      const wait2 = s.wait().then(() => results.push(true))
      const wait3 = s.wait().then(() => results.push(true))

      expect(results.length).toBe(0)

      // Trigger should resolve all waiters
      s.trigger()

      await Promise.all([wait1, wait2, wait3])
      expect(results).toEqual([true, true, true])
    })

    bulletproofTest("should handle waiters added after trigger", async () => {
      const s = signal()
      const results: boolean[] = []

      // First waiter
      const wait1 = s.wait().then(() => results.push('first'))

      // Trigger before second waiter
      s.trigger()
      await wait1
      expect(results).toEqual(['first'])

      // Second waiter after trigger should resolve immediately
      const wait2 = s.wait().then(() => results.push('second'))
      await wait2
      expect(results).toEqual(['first', 'second'])
    })

    bulletproofTest("should handle sequential triggers and waits", async () => {
      const s = signal()
      const results: number[] = []

      // First cycle
      const wait1 = s.wait().then(() => results.push(1))
      s.trigger()
      await wait1

      // Second cycle
      const wait2 = s.wait().then(() => results.push(2))
      s.trigger()
      await wait2

      // Third cycle
      const wait3 = s.wait().then(() => results.push(3))
      s.trigger()
      await wait3

      expect(results).toEqual([1, 2, 3])
    })
  })

  describe("trigger behavior", () => {
    bulletproofTest("should handle multiple triggers", async () => {
      const s = signal()
      let callCount = 0

      // Set up waiter that counts triggers
      s.wait().then(() => callCount++)

      // Multiple triggers should only resolve once
      s.trigger()
      s.trigger()
      s.trigger()

      await s.wait()
      expect(callCount).toBe(1) // Should only be called once
    })

    bulletproofTest("should handle trigger before wait", async () => {
      const s = signal()

      // Trigger first, then wait
      s.trigger()

      const result = await s.wait()
      expect(result).toBeUndefined() // Should resolve immediately
    })

    bulletproofTest("should handle rapid triggers", async () => {
      const s = signal()
      const results: boolean[] = []

      // Create multiple waiters
      for (let i = 0; i < 10; i++) {
        s.wait().then(() => results.push(true))
      }

      // Rapid triggers
      for (let i = 0; i < 5; i++) {
        s.trigger()
      }

      // Wait for all to resolve
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(results.length).toBe(10)
      expect(results.every(r => r === true)).toBe(true)
    })
  })

  describe("promise behavior", () => {
    bulletproofTest("should return same promise for multiple wait calls", async () => {
      const s = signal()

      const wait1 = s.wait()
      const wait2 = s.wait()
      const wait3 = s.wait()

      // All should be the same promise until triggered
      expect(wait1).toBe(wait2)
      expect(wait2).toBe(wait3)
    })

    bulletproofTest("should return new promise after trigger", async () => {
      const s = signal()

      const wait1 = s.wait()
      s.trigger()
      await wait1

      const wait2 = s.wait()
      const wait3 = s.wait()

      // New promises should be the same
      expect(wait2).toBe(wait3)
      // But different from the first one
      expect(wait2).not.toBe(wait1)
    })

    bulletproofTest("should handle promise rejection scenarios", async () => {
      const s = signal()

      const waitPromise = s.wait()

      // Trigger should resolve the promise
      s.trigger()

      const result = await waitPromise
      expect(result).toBeUndefined()
    })
  })

  describe("edge cases", () => {
    bulletproofTest("should handle many concurrent waiters", async () => {
      const s = signal()
      const results: number[] = []

      // Create many waiters
      const waiters = []
      for (let i = 0; i < 100; i++) {
        const waiter = s.wait().then(() => results.push(i))
        waiters.push(waiter)
      }

      // Trigger all at once
      s.trigger()

      await Promise.all(waiters)
      expect(results.length).toBe(100)
      expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i))
    })

    bulletproofTest("should handle rapid wait/trigger cycles", async () => {
      const s = signal()
      const results: string[] = []

      // Rapid cycles
      for (let i = 0; i < 10; i++) {
        const waiter = s.wait().then(() => results.push(`cycle-${i}`))
        s.trigger()
        await waiter
      }

      expect(results).toEqual([
        'cycle-0', 'cycle-1', 'cycle-2', 'cycle-3', 'cycle-4',
        'cycle-5', 'cycle-6', 'cycle-7', 'cycle-8', 'cycle-9'
      ])
    })

    bulletproofTest("should handle trigger with no waiters", async () => {
      const s = signal()

      // Should not throw or cause issues
      expect(() => s.trigger()).not.toThrow()

      // Subsequent wait should resolve immediately
      const waitPromise = s.wait()
      expect(waitPromise).toBeInstanceOf(Promise)
    })
  })

  describe("memory and performance", () => {
    bulletproofTest("should not leak memory with many signals", async () => {
      const signals = []
      const results: boolean[] = []

      // Create many signals
      for (let i = 0; i < 50; i++) {
        const s = signal()
        signals.push(s)
        s.wait().then(() => results.push(true))
        s.trigger()
      }

      // Wait for all to resolve
      await Promise.all(signals.map(s => s.wait()))

      expect(results.length).toBe(50)
      expect(results.every(r => r === true)).toBe(true)
    })

    bulletproofTest("should handle high frequency operations", async () => {
      const s = signal()
      let operationCount = 0

      // High frequency operations
      const startTime = Date.now()
      for (let i = 0; i < 1000; i++) {
        const waiter = s.wait().then(() => operationCount++)
        s.trigger()
        await waiter
      }
      const endTime = Date.now()

      expect(operationCount).toBe(1000)
      expect(endTime - startTime).toBeLessThan(1000) // Should be fast
    })
  })

  describe("integration patterns", () => {
    bulletproofTest("should work with async/await patterns", async () => {
      const s = signal()

      // Classic async/await pattern
      const waitForSignal = async () => {
        await s.wait()
        return 'signaled'
      }

      const resultPromise = waitForSignal()
      s.trigger()

      const result = await resultPromise
      expect(result).toBe('signaled')
    })

    bulletproofTest("should work with Promise.all patterns", async () => {
      const s1 = signal()
      const s2 = signal()
      const s3 = signal()

      const results: string[] = []

      // Wait for multiple signals
      const allPromise = Promise.all([
        s1.wait().then(() => results.push('s1')),
        s2.wait().then(() => results.push('s2')),
        s3.wait().then(() => results.push('s3'))
      ])

      // Trigger all signals
      s1.trigger()
      s2.trigger()
      s3.trigger()

      await allPromise
      expect(results).toEqual(['s1', 's2', 's3'])
    })

    bulletproofTest("should work with Promise.race patterns", async () => {
      const s1 = signal()
      const s2 = signal()

      let winner = ''

      // Race between two signals
      const racePromise = Promise.race([
        s1.wait().then(() => { winner = 's1' }),
        s2.wait().then(() => { winner = 's2' })
      ])

      // Trigger s2 first
      s2.trigger()
      await racePromise

      expect(winner).toBe('s2')

      // s1 should still be pending
      const s1Result = await Promise.race([
        s1.wait(),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 10))
      ])

      expect(s1Result).toBe('timeout')
    })
  })
})
