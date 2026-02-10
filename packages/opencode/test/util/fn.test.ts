import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { fn } from "../../src/util/fn"

describe("util.fn", () => {
  test("wraps a zod-validated function and exposes schema", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().int().min(0),
    })

    const wrapped = fn(schema, (input) => {
      return `${input.name}:${input.count}`
    })

    expect(wrapped.schema).toBe(schema)

    const result = wrapped({ name: "foo", count: 1 })
    expect(result).toBe("foo:1")
  })

  test("throws on invalid input via validated call", () => {
    const schema = z.object({
      value: z.number().int().min(0),
    })

    const wrapped = fn(schema, (input) => input.value * 2)

    expect(() => wrapped({ value: -1 } as any)).toThrow()
  })

  test("force skips validation but still runs callback", () => {
    const schema = z.object({
      value: z.number().int().min(0),
    })

    const wrapped = fn(schema, (input) => input.value * 2)

    const result = wrapped.force({ value: -5 } as any)
    expect(result).toBe(-10)
  })
})

