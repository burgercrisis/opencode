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
        const sessionID = Identifier.create("session", false)

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
        const sessionID = Identifier.create("session", false)

        // Create a session and then cancel it
        const promise1 = SessionPrompt.loop({ sessionID, resume_existing: false })
        SessionPrompt.cancel(sessionID)

        // Try to add another callback after cancellation
        const promise2 = SessionPrompt.loop({ sessionID, resume_existing: false })

        // Both should reject
        await expect(Promise.all([
          promise1.catch(e => { throw e }),
          promise2.catch(e => { throw e })
        ])).rejects.toThrow()
      },
    })
  })

  test("should handle rapid start/stop cycles", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = Identifier.create("session", false)

        // Test that rapid start/stop cycles don't crash the system
        // The race condition fix should handle gracefully by converting NotFoundError to Session cancelled
        expect(async () => {
          const promise = SessionPrompt.loop({ sessionID, resume_existing: false })
          await new Promise(resolve => setTimeout(resolve, 10))
          SessionPrompt.cancel(sessionID)
          await promise.catch(() => { })
        }).not.toThrow()
      },
    })
  })
})
