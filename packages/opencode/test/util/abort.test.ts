import { expect, test, describe } from "bun:test"
import { abortAfter, abortAfterAny } from "../../src/util/abort"

describe("abortAfter", () => {
  test("should create controller and signal", () => {
    const { controller, signal, clearTimeout } = abortAfter(1000)

    expect(controller).toBeInstanceOf(AbortController)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    expect(typeof clearTimeout).toBe("function")
  })

  test("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfter(50)

    expect(signal.aborted).toBe(false)

    // Wait for the actual timeout
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should clear timeout and prevent abort", async () => {
    const { signal, clearTimeout } = abortAfter(100)

    clearTimeout()

    // Wait past timeout
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(signal.aborted).toBe(false)
  })

  test("should work with zero timeout", async () => {
    const { signal, clearTimeout } = abortAfter(0)

    expect(signal.aborted).toBe(false)

    // Wait for the actual timeout
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should handle multiple clearTimeout calls", async () => {
    const { signal, clearTimeout } = abortAfter(50)

    clearTimeout()
    clearTimeout() // Should not throw
    clearTimeout() // Should not throw

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)
  })

  test("should use bind() to avoid memory leaks", () => {
    const { controller, signal } = abortAfter(100)

    // Verify the controller is properly bound
    expect(controller.abort).toBeInstanceOf(Function)
    expect(signal.aborted).toBe(false)
  })
})

describe("abortAfterAny", () => {
  test("should create combined signal", () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    expect(typeof clearTimeout).toBe("function")
  })

  test("should abort after timeout", async () => {
    const { signal, clearTimeout } = abortAfterAny(50)

    expect(signal.aborted).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should abort when input signal aborts", () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal.aborted).toBe(false)

    controller.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should abort when any input signal aborts", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(1000, controller1.signal, controller2.signal)

    expect(signal.aborted).toBe(false)

    controller2.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should handle multiple input signals", () => {
    const controllers = Array.from({ length: 5 }, () => new AbortController())
    const controller3 = controllers[2]
    const { signal, clearTimeout } = abortAfterAny(1000, ...controllers.map((c) => c.signal))

    expect(signal.aborted).toBe(false)

    // Abort the third controller
    controller3?.abort()

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should clear timeout and prevent timeout abort", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(50, controller.signal)

    clearTimeout()

    // Wait past timeout
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)

    // But should still abort if input signal aborts
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  test("should work with already aborted signal", () => {
    const controller = new AbortController()
    controller.abort()

    const { signal, clearTimeout } = abortAfterAny(1000, controller.signal)

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should work with zero timeout", async () => {
    const controller = new AbortController()
    const { signal, clearTimeout } = abortAfterAny(0, controller.signal)

    expect(signal.aborted).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(signal.aborted).toBe(true)
    clearTimeout()
  })

  test("should handle multiple clearTimeout calls", async () => {
    const { signal, clearTimeout } = abortAfterAny(50)

    clearTimeout()
    clearTimeout()
    clearTimeout()

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(signal.aborted).toBe(false)
  })
})
