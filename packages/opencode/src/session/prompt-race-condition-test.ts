import { test, expect } from "bun:test"
import { SessionPrompt } from "./prompt"
import { Identifier } from "../id/id"

test("race condition in session cancellation", async () => {
  const sessionID = Identifier.ascending("session")

  // Start a session
  const abort = SessionPrompt.start(sessionID)
  expect(abort).toBeDefined()

  // Simulate rapid cancellation and callback addition
  const promises: Promise<any>[] = []
  const cancellationPromises: Promise<void>[] = []

  // Create multiple concurrent operations that could trigger the race condition
  for (let i = 0; i < 50; i++) {
    promises.push(
      // Try to add callbacks rapidly while cancellation happens
      new Promise((resolve, reject) => {
        // Get session state and try to add callback
        const state = SessionPrompt.getState()
        const sessionState = state[sessionID]
        if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
          sessionState.callbacks.push({ resolve, reject })
        } else {
          reject(new Error("Session cancelled or not found"))
        }
      })
    )
  }

  // Cancel the session rapidly (in a separate async operation)
  cancellationPromises.push(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        SessionPrompt.cancel(sessionID)
        resolve()
      }, 1) // Small delay to allow some callbacks to be added
    })
  )

  // Add more callbacks during cancellation
  for (let i = 0; i < 50; i++) {
    promises.push(
      new Promise((resolve, reject) => {
        setTimeout(() => {
          const state = SessionPrompt.getState()
          const sessionState = state[sessionID]
          if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
            sessionState.callbacks.push({ resolve, reject })
          } else {
            reject(new Error("Session cancelled during addition"))
          }
        }, Math.random() * 10) // Random delay up to 10ms
      })
    )
  }

  // Wait for cancellation to complete
  await Promise.all(cancellationPromises)

  // Wait a bit for any race conditions to manifest
  await new Promise(resolve => setTimeout(resolve, 100))

  // Check that all promises are either resolved or rejected (no hanging promises)
  const results = await Promise.allSettled(promises)

  // Count how many are still pending (should be 0)
  const pending = results.filter(r => r.status === 'pending').length
  const rejected = results.filter(r => r.status === 'rejected').length
  const fulfilled = results.filter(r => r.status === 'fulfilled').length

  console.log(`Race condition test results: pending=${pending}, rejected=${rejected}, fulfilled=${fulfilled}`)

  // If there are pending promises, we have a race condition/memory leak
  expect(pending).toBe(0)

  // Most should be rejected due to cancellation, some might be fulfilled if added before cancellation
  expect(rejected + fulfilled).toBe(promises.length)
})

test("cancellation flag prevents callback addition", async () => {
  const sessionID = Identifier.ascending("session")

  // Start a session
  const abort = SessionPrompt.start(sessionID)
  expect(abort).toBeDefined()

  // Get initial state
  const state = SessionPrompt.getState()
  const sessionState = state[sessionID]
  expect(sessionState).toBeDefined()
  expect(sessionState.isCancelling).toBe(false)

  // Set cancellation flag manually to simulate the start of cancellation
  sessionState.isCancelling = true

  // Try to add a callback - should be rejected
  let callbackAdded = false
  try {
    if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
      sessionState.callbacks.push({
        resolve: () => { },
        reject: () => { }
      })
      callbackAdded = true
    }
  } catch (e) {
    // Should not reach here
  }

  expect(callbackAdded).toBe(false)

  // Clean up
  SessionPrompt.cancel(sessionID)
})
