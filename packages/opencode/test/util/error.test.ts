import { describe, expect, test } from "bun:test"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"

describe("util.error NamedError.create", () => {
  const DataSchema = z.object({
    code: z.number().int(),
    message: z.string(),
  })

  const CustomError = NamedError.create("CustomError", DataSchema)

  test("creates a subclass with static Schema and meta ref", () => {
    expect(CustomError.Schema).toBeDefined()
    const parsed = CustomError.Schema.parse({
      name: "CustomError",
      data: { code: 1, message: "msg" },
    })
    expect(parsed.name).toBe("CustomError")
    expect((CustomError.Schema as any).meta().ref).toBe("CustomError")
  })

  test("instance exposes name, data, schema, and toObject", () => {
    const err = new CustomError({ code: 404, message: "Not found" })

    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("CustomError")
    expect(err.data).toEqual({ code: 404, message: "Not found" })

    const schema = err.schema()
    const obj = err.toObject()

    expect(schema).toBe(CustomError.Schema)
    expect(obj).toEqual({
      name: "CustomError",
      data: { code: 404, message: "Not found" },
    })
  })

  test("isInstance detects matching error instances", () => {
    const err = new CustomError({ code: 1, message: "x" })
    const other = new Error("x")

    expect(CustomError.isInstance(err)).toBe(true)
    expect(CustomError.isInstance(other)).toBe(false)
    expect(CustomError.isInstance({ name: "CustomError" })).toBe(true)
    expect(CustomError.isInstance({ name: "OtherError" })).toBe(false)
  })
})

describe("util.error NamedError.Unknown", () => {
  test("Unknown error class is available and works with schema", () => {
    const Unknown = NamedError.Unknown
    const err = new Unknown({ message: "unexpected" })

    expect(err.name).toBe("UnknownError")
    expect(err.data).toEqual({ message: "unexpected" })

    const obj = err.toObject()
    expect(obj).toEqual({
      name: "UnknownError",
      data: { message: "unexpected" },
    })

    const parsed = Unknown.Schema.parse({
      name: "UnknownError",
      data: { message: "unexpected" },
    })
    expect(parsed.name).toBe("UnknownError")
  })
})

