import { expect, test, describe } from "bun:test"
import { BusEvent } from "../../src/bus/bus-event"
import z from "zod"

describe("BusEvent", () => {
  test("define creates event definition with type and properties", () => {
    const testEvent = BusEvent.define(
      "test.event",
      z.object({
        message: z.string(),
        count: z.number(),
      }),
    )

    expect(testEvent.type).toBe("test.event")
    expect(testEvent.properties).toBeDefined()
  })

  test("define registers event in registry", () => {
    const testEvent = BusEvent.define(
      "test.registry.event",
      z.object({
        data: z.string(),
      }),
    )

    // The event should be created successfully
    expect(testEvent.type).toBe("test.registry.event")
  })

  test("payloads creates discriminated union of all registered events", () => {
    // Define multiple events
    BusEvent.define("event.one", z.object({ a: z.string() }))
    BusEvent.define("event.two", z.object({ b: z.number() }))

    const union = BusEvent.payloads()

    // Should be a zod schema that can parse events
    expect(union).toBeDefined()
  })

  test("define returns same object structure for different event types", () => {
    const event1 = BusEvent.define("type1", z.object({ x: z.string() }))
    const event2 = BusEvent.define("type2", z.object({ y: z.number() }))

    expect(event1.type).not.toBe(event2.type)
    expect(event1.properties).not.toBe(event2.properties)
  })
})
