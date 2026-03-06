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
import { abortAfter, abortAfterAny } from "../abort"

describe("abort", () => {
  describe("abortAfter", () => {
    it("should create an AbortController that aborts after timeout", async () => {
      const { controller, signal, clearTimeout } = abortAfter(100)
      
      expect(signal.aborted).toBe(false)
      expect(controller.signal.aborted).toBe(false)
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))
      
      expect(signal.aborted).toBe(true)
      expect(controller.signal.aborted).toBe(true)
    })

    it("should allow clearing the timeout", async () => {
      const { signal, clearTimeout } = abortAfter(50)
      
      clearTimeout()
      
      // Wait longer than the original timeout
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should not have aborted because we cleared the timeout
      expect(signal.aborted).toBe(false)
    })

    it("should return the same signal as the controller", () => {
      const { controller, signal } = abortAfter(1000)
      
      expect(signal).toBe(controller.signal)
    })
  })

  describe("abortAfterAny", () => {
    it("should abort on timeout", async () => {
      const { signal, clearTimeout } = abortAfterAny(50)
      
      expect(signal.aborted).toBe(false)
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(signal.aborted).toBe(true)
      
      clearTimeout()
    })

    it("should abort when any input signal aborts", async () => {
      const controller = new AbortController()
      const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)
      
      expect(signal.aborted).toBe(false)
      
      // Abort the input signal
      controller.abort()
      
      expect(signal.aborted).toBe(true)
      
      clearTimeout()
    })

    it("should abort when timeout occurs before signal aborts", async () => {
      const controller = new AbortController()
      const { signal, clearTimeout } = abortAfterAny(50, controller.signal)
      
      expect(signal.aborted).toBe(false)
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(signal.aborted).toBe(true)
      // Input signal should not be aborted
      expect(controller.signal.aborted).toBe(false)
      
      clearTimeout()
    })

    it("should work with multiple signals", async () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const { signal, clearTimeout } = abortAfterAny(1000, controller1.signal, controller2.signal)
      
      expect(signal.aborted).toBe(false)
      
      controller2.abort()
      
      expect(signal.aborted).toBe(true)
      
      clearTimeout()
    })

    it("should work with no additional signals", async () => {
      const { signal, clearTimeout } = abortAfterAny(50)
      
      expect(signal.aborted).toBe(false)
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(signal.aborted).toBe(true)
      
      clearTimeout()
    })
  })
})
