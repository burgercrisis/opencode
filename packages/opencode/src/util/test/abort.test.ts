import { describe, it, expect } from "bun:test"
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
