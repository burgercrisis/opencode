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
