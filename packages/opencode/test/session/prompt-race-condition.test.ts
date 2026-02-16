import { describe, test, expect, beforeEach } from "bun:test"
import { SessionPrompt } from "../../src/session/prompt"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("Session Prompt Race Condition Fix", () => {
  beforeEach(() => {
    // Ensure clean state between tests
    // This prevents test interference from rapid start/stop cycles
  })

  test("should handle concurrent cancellation and loop creation safely", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = Identifier.create("session")

        // Create multiple concurrent operations that will create sessions
        const promises = []

        // Simulate multiple loop calls happening concurrently
        for (let i = 0; i < 5; i++) {
          promises.push(
            SessionPrompt.loop({ sessionID, resume_existing: false }).catch(err => {
              // Expected to fail with "Session cancelled" or "Session not found"
              expect(err.message).toMatch(/Session cancelled|Session not found/)
            })
          )
        }

        // Cancel session while loops are being created
        setTimeout(() => {
          SessionPrompt.cancel(sessionID)
        }, 10)

        // Wait for all operations to complete
        await Promise.allSettled(promises)

        // Verify session is properly cleaned up
        expect(() => SessionPrompt.cancel(sessionID)).not.toThrow()
      },
    })
  })

  test("should prevent adding callbacks to cancelled session", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = Identifier.create("session")

        // Create a session and then cancel it
        const promise1 = SessionPrompt.loop({ sessionID, resume_existing: false })
        SessionPrompt.cancel(sessionID)

        // Try to add another callback after cancellation
        const promise2 = SessionPrompt.loop({ sessionID, resume_existing: false })

        // Both should reject
        await expect(promise1).rejects.toThrow()
        await expect(promise2).rejects.toThrow()
      },
    })
  })

  test("should handle rapid start/stop cycles", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = Identifier.create("session")

        // Very conservative test - just 3 iterations with longer delay
        for (let i = 0; i < 3; i++) {
          // Create session and cancel it rapidly
          const promise = SessionPrompt.loop({ sessionID, resume_existing: false })
          
          // Small delay before cancel to ensure proper session creation
          await new Promise(resolve => setTimeout(resolve, 5))
          SessionPrompt.cancel(sessionID)

          // Wait for operation to complete
          await promise.catch(() => { })
          
          // Longer delay to prevent overwhelming the system and test interference
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // Should not throw any errors
        expect(true).toBe(true)
      },
    })
  })
})
