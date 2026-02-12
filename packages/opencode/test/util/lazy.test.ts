import { expect, test, describe } from "bun:test"
import { lazy as localLazy } from "../../src/util/lazy"
import { lazy as sharedLazy } from "@opencode-ai/util/lazy"

describe("util.lazy", () => {
  ;[
    { name: "local", lazyImpl: localLazy },
    { name: "shared", lazyImpl: sharedLazy },
  ].forEach(({ name, lazyImpl }) => {
    describe(name, () => {
      test("lazy should initialize once", () => {
        let calls = 0
        const l = lazyImpl(() => {
          calls++
          return "foo"
        })
        
        expect(calls).toBe(0)
        expect(l()).toBe("foo")
        expect(calls).toBe(1)
        expect(l()).toBe("foo")
        expect(calls).toBe(1)
      })

      test("lazy should reset", () => {
        let calls = 0
        const l = lazyImpl(() => {
          calls++
          return "foo"
        })
        
        l()
        expect(calls).toBe(1)
        l.reset()
        expect(l()).toBe("foo")
        expect(calls).toBe(2)
      })
    })
  })
})
