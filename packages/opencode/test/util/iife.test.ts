import { describe, expect, test } from "bun:test"
import { iife as localIife } from "../../src/util/iife"
import { iife as sharedIife } from "@opencode-ai/util/iife"

describe("util.iife", () => {
  ;[
    { name: "local", iifeImpl: localIife },
    { name: "shared", iifeImpl: sharedIife },
  ].forEach(({ name, iifeImpl }) => {
    describe(name, () => {
      test("should execute function immediately and return result", () => {
        let called = false
        const result = iifeImpl(() => {
          called = true
          return 42
        })

        expect(called).toBe(true)
        expect(result).toBe(42)
      })

      test("should work with async functions", async () => {
        let called = false
        const result = await iifeImpl(async () => {
          called = true
          return "async result"
        })

        expect(called).toBe(true)
        expect(result).toBe("async result")
      })

      test("should handle functions with no return value", () => {
        let called = false
        const result = iifeImpl(() => {
          called = true
        })

        expect(called).toBe(true)
        expect(result).toBeUndefined()
      })
    })
  })
})
