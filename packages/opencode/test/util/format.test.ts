import { expect, test, describe } from "bun:test"
import { formatDuration } from "../../src/util/format"

describe("formatDuration", () => {
  describe("edge cases", () => {
    test("should handle zero and negative values", () => {
      expect(formatDuration(0)).toBe("")
      expect(formatDuration(-1)).toBe("")
      expect(formatDuration(-100)).toBe("")
      expect(formatDuration(-Infinity)).toBe("")
    })

    test("should handle very small positive values", () => {
      expect(formatDuration(0.1)).toBe("0s")
      expect(formatDuration(0.5)).toBe("0s")
      expect(formatDuration(0.9)).toBe("0s")
      expect(formatDuration(1)).toBe("1s")
      expect(formatDuration(1.5)).toBe("1s")
    })

    test("should handle boundary values", () => {
      expect(formatDuration(59)).toBe("59s")
      expect(formatDuration(59.9)).toBe("59s")
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(60.1)).toBe("1m")

      expect(formatDuration(3599)).toBe("59m 59s")
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(3600.1)).toBe("1h")

      expect(formatDuration(86399)).toBe("23h 59m")
      expect(formatDuration(86400)).toBe("~1 day")
      expect(formatDuration(86400.1)).toBe("~1 day")

      expect(formatDuration(604799)).toBe("~6 days")
      expect(formatDuration(604800)).toBe("~1 week")
      expect(formatDuration(604800.1)).toBe("~1 week")
    })
  })

  describe("seconds formatting", () => {
    test("should format seconds correctly", () => {
      expect(formatDuration(1)).toBe("1s")
      expect(formatDuration(5)).toBe("5s")
      expect(formatDuration(10)).toBe("10s")
      expect(formatDuration(30)).toBe("30s")
      expect(formatDuration(45)).toBe("45s")
      expect(formatDuration(59)).toBe("59s")
    })

    test("should handle decimal seconds", () => {
      expect(formatDuration(1.5)).toBe("1s")
      expect(formatDuration(10.7)).toBe("10s")
      expect(formatDuration(30.2)).toBe("30s")
      expect(formatDuration(59.9)).toBe("59s")
    })
  })

  describe("minutes formatting", () => {
    test("should format minutes without seconds", () => {
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(120)).toBe("2m")
      expect(formatDuration(180)).toBe("3m")
      expect(formatDuration(600)).toBe("10m")
      expect(formatDuration(1800)).toBe("30m")
      expect(formatDuration(3600)).toBe("1h") // Boundary case
    })

    test("should format minutes with seconds", () => {
      expect(formatDuration(61)).toBe("1m 1s")
      expect(formatDuration(65)).toBe("1m 5s")
      expect(formatDuration(90)).toBe("1m 30s")
      expect(formatDuration(125)).toBe("2m 5s")
      expect(formatDuration(3599)).toBe("59m 59s")
    })

    test("should handle exact minute boundaries", () => {
      expect(formatDuration(120)).toBe("2m")
      expect(formatDuration(180)).toBe("3m")
      expect(formatDuration(300)).toBe("5m")
      expect(formatDuration(600)).toBe("10m")
      expect(formatDuration(1200)).toBe("20m")
      expect(formatDuration(1800)).toBe("30m")
      expect(formatDuration(3600)).toBe("1h") // Next boundary
    })
  })

  describe("hours formatting", () => {
    test("should format hours without minutes", () => {
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(7200)).toBe("2h")
      expect(formatDuration(10800)).toBe("3h")
      expect(formatDuration(14400)).toBe("4h")
      expect(formatDuration(43200)).toBe("12h")
      expect(formatDuration(86400)).toBe("~1 day") // Boundary case
    })

    test("should format hours with minutes", () => {
      expect(formatDuration(3660)).toBe("1h 1m")
      expect(formatDuration(3900)).toBe("1h 5m")
      expect(formatDuration(5400)).toBe("1h 30m")
      expect(formatDuration(7200)).toBe("2h")
      expect(formatDuration(86399)).toBe("23h 59m")
    })

    test("should handle exact hour boundaries", () => {
      expect(formatDuration(7200)).toBe("2h")
      expect(formatDuration(10800)).toBe("3h")
      expect(formatDuration(14400)).toBe("4h")
      expect(formatDuration(28800)).toBe("8h")
      expect(formatDuration(43200)).toBe("12h")
      expect(formatDuration(86400)).toBe("~1 day") // Next boundary
    })
  })

  describe("days formatting", () => {
    test("should format single day", () => {
      expect(formatDuration(86400)).toBe("~1 day")
      expect(formatDuration(90000)).toBe("~1 day")
      expect(formatDuration(100000)).toBe("~1 day")
    })

    test("should format multiple days", () => {
      expect(formatDuration(86400 * 2)).toBe("~2 days")
      expect(formatDuration(86400 * 3)).toBe("~3 days")
      expect(formatDuration(86400 * 5)).toBe("~5 days")
      expect(formatDuration(86400 * 7)).toBe("~7 days")
    })

    test("should handle day boundaries", () => {
      expect(formatDuration(86400)).toBe("~1 day")
      expect(formatDuration(172800)).toBe("~2 days")
      expect(formatDuration(259200)).toBe("~3 days")
      expect(formatDuration(345600)).toBe("~4 days")
      expect(formatDuration(604800)).toBe("~1 week") // Next boundary
    })
  })

  describe("weeks formatting", () => {
    test("should format single week", () => {
      expect(formatDuration(604800)).toBe("~1 week")
      expect(formatDuration(650000)).toBe("~1 week")
      expect(formatDuration(700000)).toBe("~1 week")
    })

    test("should format multiple weeks", () => {
      expect(formatDuration(604800 * 2)).toBe("~2 weeks")
      expect(formatDuration(604800 * 3)).toBe("~3 weeks")
      expect(formatDuration(604800 * 4)).toBe("~4 weeks")
      expect(formatDuration(604800 * 10)).toBe("~10 weeks")
    })

    test("should handle large durations", () => {
      expect(formatDuration(604800 * 52)).toBe("~52 weeks") // About a year
      expect(formatDuration(604800 * 100)).toBe("~100 weeks") // Almost 2 years
      expect(formatDuration(604800 * 1000)).toBe("~1000 weeks")
    })
  })

  describe("precision and rounding", () => {
    test("should handle floating point precision", () => {
      expect(formatDuration(59.4)).toBe("59s")
      expect(formatDuration(59.5)).toBe("59s")
      expect(formatDuration(59.6)).toBe("59s")
      expect(formatDuration(59.9)).toBe("59s")

      expect(formatDuration(3599.4)).toBe("59m 59s")
      expect(formatDuration(3599.5)).toBe("59m 59s")
      expect(formatDuration(3599.6)).toBe("59m 59s")
      expect(formatDuration(3599.9)).toBe("59m 59s")
    })

    test("should handle large floating point values", () => {
      expect(formatDuration(86400.5)).toBe("~1 day")
      expect(formatDuration(86400.9)).toBe("~1 day")
      expect(formatDuration(604800.5)).toBe("~1 week")
      expect(formatDuration(604800.9)).toBe("~1 week")
    })
  })

  describe("special values", () => {
    test("should handle special numeric values", () => {
      expect(formatDuration(Infinity)).toBe("~Infinity weeks")
      expect(formatDuration(-Infinity)).toBe("")
      expect(formatDuration(NaN)).toBe("~NaN weeks")
    })

    test("should handle very large numbers", () => {
      const veryLarge = Number.MAX_SAFE_INTEGER
      const weeks = Math.floor(veryLarge / 604800)
      expect(formatDuration(veryLarge)).toBe(`~${weeks} weeks`)
    })
  })

  describe("format consistency", () => {
    test("should use consistent formatting", () => {
      // Check that all formats follow expected patterns
      const seconds = formatDuration(45)
      expect(seconds).toMatch(/^\d+s$/)

      const minutes = formatDuration(125)
      expect(minutes).toMatch(/^\d+m \d+s$/)

      const hours = formatDuration(3900)
      expect(hours).toMatch(/^\d+h \d+m$/)

      const days = formatDuration(100000)
      expect(days).toMatch(/^~\d+ days?$/)

      const weeks = formatDuration(604800 * 5)
      expect(weeks).toMatch(/^~\d+ weeks?$/)
    })

    test("should not include unnecessary units", () => {
      expect(formatDuration(60)).toBe("1m") // Not "1m 0s"
      expect(formatDuration(3600)).toBe("1h") // Not "1h 0m"
      expect(formatDuration(86400)).toBe("~1 day") // Not "~1 days"
      expect(formatDuration(604800)).toBe("~1 week") // Not "~1 weeks"
    })
  })

  describe("cross-platform consistency", () => {
    test("should work consistently across platforms", () => {
      // Test that the function behaves the same regardless of platform
      const testValues = [0, 1, 60, 3600, 86400, 604800]
      const expectedResults = ["", "1s", "1m", "1h", "~1 day", "~1 week"]

      testValues.forEach((value, index) => {
        const result = formatDuration(value)
        expect(result).toBe(expectedResults[index])
      })
    })
  })
})
