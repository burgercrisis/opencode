import { expect, test, describe } from "bun:test"
import { formatDuration } from "../../src/util/format"

describe("formatDuration", () => {
  test("should format various durations", () => {
    expect(formatDuration(0)).toBe("")
    expect(formatDuration(-1)).toBe("")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(60)).toBe("1m")
    expect(formatDuration(65)).toBe("1m 5s")
    expect(formatDuration(3600)).toBe("1h")
    expect(formatDuration(3660)).toBe("1h 1m")
    expect(formatDuration(86400)).toBe("~1 day")
    expect(formatDuration(86400 * 2)).toBe("~2 days")
    expect(formatDuration(604800)).toBe("~1 week")
    expect(formatDuration(604800 * 3)).toBe("~3 weeks")
  })
})
