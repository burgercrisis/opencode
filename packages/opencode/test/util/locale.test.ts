import { expect, test, describe } from "bun:test"
import { Locale } from "../../src/util/locale"

describe("Locale", () => {
  test("titlecase", () => {
    expect(Locale.titlecase("hello world")).toBe("Hello World")
    expect(Locale.titlecase("foo")).toBe("Foo")
  })

  test("time and datetime", () => {
    const now = Date.now()
    expect(Locale.time(now)).toBeDefined()
    expect(Locale.datetime(now)).toContain("·")
  })

  test("todayTimeOrDateTime", () => {
    const now = Date.now()
    const yesterday = now - 24 * 60 * 60 * 1000
    
    expect(Locale.todayTimeOrDateTime(now)).toBe(Locale.time(now))
    expect(Locale.todayTimeOrDateTime(yesterday)).toBe(Locale.datetime(yesterday))
  })

  test("number formatting", () => {
    expect(Locale.number(500)).toBe("500")
    expect(Locale.number(1500)).toBe("1.5K")
    expect(Locale.number(2500000)).toBe("2.5M")
  })

  test("duration formatting", () => {
    expect(Locale.duration(500)).toBe("500ms")
    expect(Locale.duration(1500)).toBe("1.5s")
    expect(Locale.duration(65000)).toBe("1m 5s")
    expect(Locale.duration(3700000)).toBe("1h 1m")
    expect(Locale.duration(100000000)).toBe("1d 3h")
  })

  test("truncate", () => {
    expect(Locale.truncate("hello", 10)).toBe("hello")
    expect(Locale.truncate("hello world", 5)).toBe("hell…")
  })

  test("truncateMiddle", () => {
    expect(Locale.truncateMiddle("hello", 10)).toBe("hello")
    expect(Locale.truncateMiddle("1234567890", 5)).toBe("12…90")
  })

  test("pluralize", () => {
    expect(Locale.pluralize(1, "{} apple", "{} apples")).toBe("1 apple")
    expect(Locale.pluralize(2, "{} apple", "{} apples")).toBe("2 apples")
    expect(Locale.pluralize(0, "{} apple", "{} apples")).toBe("0 apples")
  })
})
