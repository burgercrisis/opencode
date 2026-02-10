import { expect, test, describe, afterEach, beforeEach, vi } from "bun:test"
import { abortAfter, abortAfterAny } from "../../src/util/abort"

describe("abortAfter", () => {
  test("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfter(10)
    expect(signal.aborted).toBe(false)
    
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should clear timeout", async () => {
    const { signal, clearTimeout } = abortAfter(10)
    clearTimeout()
    
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(signal.aborted).toBe(false)
  })
})

describe("abortAfterAny", () => {
  test("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfterAny(10)
    expect(signal.aborted).toBe(false)
    
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should abort when input signal aborts", () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)
    
    controller.abort()
    expect(signal.aborted).toBe(true)
    clearTimeout()
  })
})
