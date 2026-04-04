import { expect, test, describe } from "bun:test"
import { foo, bar, dummyFunction, randomHelper } from "../../src/util/scrap"

describe("scrap", () => {
  test("values", () => {
    expect(foo).toBe("42")
    expect(bar).toBe(123)
  })

  test("dummyFunction", () => {
    // Just call it for coverage
    dummyFunction()
  })

  test("randomHelper", () => {
    const result = randomHelper()
    expect(typeof result).toBe("boolean")
  })
})
