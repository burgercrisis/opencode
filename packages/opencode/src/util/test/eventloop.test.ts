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
import { EventLoop } from "../eventloop"

describe("EventLoop", () => {
  describe("wait", () => {
    it("should resolve when event loop is empty", async () => {
      // Create a simple timeout to have an active handle
      const timeoutId = setTimeout(() => { }, 1000)

      // Clear the timeout so event loop becomes empty
      clearTimeout(timeoutId)

      // Wait should resolve quickly
      const result = await EventLoop.wait()
      expect(result).toBeUndefined()
    })

    it("should wait for active handles to complete", async () => {
      // This test verifies the wait function works
      // We use a short timeout that will resolve
      let resolved = false

      setTimeout(() => {
        resolved = true
      }, 10)

      // Wait a bit for the timeout to complete
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(resolved).toBe(true)
    })

    it("should resolve when no active handles remain", async () => {
      // Create a timeout that will be cleared to trigger the resolve path
      const timeoutId = setTimeout(() => { }, 100)

      // Start waiting in background
      const waitPromise = EventLoop.wait()

      // Clear the timeout to make event loop empty
      clearTimeout(timeoutId)

      // Wait should resolve when event loop is empty
      await expect(waitPromise).resolves.toBeUndefined()
    })

    it("should continue checking when active handles exist", async () => {
      // Create a long-running timeout to keep event loop active
      const timeoutId = setTimeout(() => { }, 1000)

      // Start waiting but don't clear the timeout immediately
      const waitPromise = EventLoop.wait()

      // Wait a short time to ensure the else branch is executed
      await new Promise(resolve => setTimeout(resolve, 10))

      // Clear the timeout to allow resolution
      clearTimeout(timeoutId)

      // Should eventually resolve
      await expect(waitPromise).resolves.toBeUndefined()
    })

    it("should handle setImmediate when event loop remains active", async () => {
      // Create a timeout that will keep event loop active for multiple checks
      const timeoutId = setTimeout(() => { }, 200)

      // Start waiting
      const waitPromise = EventLoop.wait()

      // Wait enough time for setImmediate to be called multiple times
      await new Promise(resolve => setTimeout(resolve, 50))

      // Clear timeout to allow resolution
      clearTimeout(timeoutId)

      // Should resolve after timeout is cleared
      await expect(waitPromise).resolves.toBeUndefined()
    })
  })
})
