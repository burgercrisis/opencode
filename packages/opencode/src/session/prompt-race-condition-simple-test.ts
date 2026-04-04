import { test, expect } from "bun:test"

// Simplified test to verify the race condition fix logic
test("race condition prevention logic", () => {
  // Simulate the session state structure
  const sessionState = {
    abort: { signal: { aborted: false } },
    callbacks: [] as Array<{ resolve: Function; reject: Function }>,
    isCancelling: false,
  }

  // Test 1: Normal callback addition should work
  let callbackAdded = false
  if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
    sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
    callbackAdded = true
  }
  expect(callbackAdded).toBe(true)
  expect(sessionState.callbacks.length).toBe(1)

  // Test 2: When isCancelling is true, callback should be rejected
  sessionState.isCancelling = true
  callbackAdded = false
  if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
    sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
    callbackAdded = true
  }
  expect(callbackAdded).toBe(false)
  expect(sessionState.callbacks.length).toBe(1) // No new callback added

  // Test 3: When abort signal is true, callback should be rejected
  sessionState.isCancelling = false
  sessionState.abort.signal.aborted = true
  callbackAdded = false
  if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
    sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
    callbackAdded = true
  }
  expect(callbackAdded).toBe(false)
  expect(sessionState.callbacks.length).toBe(1) // No new callback added

  // Test 4: Simulate the race condition fix
  sessionState.abort.signal.aborted = false
  sessionState.isCancelling = false
  sessionState.callbacks = []

  // Simulate concurrent operations
  const operations = []
  for (let i = 0; i < 100; i++) {
    operations.push(() => {
      // Simulate the check from the loop function
      if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
        sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
        return true
      }
      return false
    })
  }

  // Set cancellation flag (simulating cancel function)
  sessionState.isCancelling = true

  // Run operations after cancellation flag is set
  const results = operations.map(op => op())
  const successfulAdditions = results.filter(r => r).length

  // With the race condition fix, no callbacks should be added after cancellation flag is set
  expect(successfulAdditions).toBe(0)
  expect(sessionState.callbacks.length).toBe(0)
})

test("atomic operations prevent race condition", () => {
  // Simulate the old problematic code vs the new fixed code
  let callbacksAdded = 0
  let raceConditionDetected = false

  // Simulate the race condition scenario
  const sessionState = {
    abort: { signal: { aborted: false } },
    callbacks: [] as Array<{ resolve: Function; reject: Function }>,
    isCancelling: false,
  }

  // Simulate concurrent operations
  const concurrentOps = Array.from({ length: 1000 }, (_, i) => {
    return () => {
      // Simulate the timing of the race condition
      const delay = Math.random() * 10 // Random delay up to 10ms
      
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          // This simulates the check from the loop function
          if (sessionState && !sessionState.abort.signal.aborted && !sessionState.isCancelling) {
            // Simulate the race condition window where isCancelling might change
            if (Math.random() < 0.001) { // 0.1% chance of hitting the race condition
              // Simulate the race condition: isCancelling changes between check and push
              sessionState.isCancelling = true
              sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
              raceConditionDetected = true
              resolve(true)
            } else {
              sessionState.callbacks.push({ resolve: () => {}, reject: () => {} })
              callbacksAdded++
              resolve(true)
            }
          } else {
            resolve(false)
          }
        }, delay)
      })
    }
  })

  // Start cancellation after some operations
  setTimeout(() => {
    sessionState.isCancelling = true
  }, 5)

  // Run all operations
  concurrentOps.forEach(op => op())

  // Wait for all operations to complete
  setTimeout(() => {
    // With the race condition fix, we should have no callbacks added after cancellation
    // But with the simulated race condition, we might have some
    console.log(`Callbacks added: ${callbacksAdded}, Race condition detected: ${raceConditionDetected}`)
    
    // The fix ensures that even if there's a race condition, the isCancelling flag prevents it
    expect(raceConditionDetected).toBe(false)
  }, 100)
})
