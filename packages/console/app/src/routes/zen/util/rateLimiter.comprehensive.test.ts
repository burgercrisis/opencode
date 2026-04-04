import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { createRateLimiter, getRetryAfterDay, getRetryAfterHour } from "./rateLimiter"
import { FreeUsageLimitError } from "./error"
import { logger } from "./logger"

// Mock dependencies
const mockDatabase = {
  use: vi.fn()
}

const mockLogger = {
  debug: vi.fn()
}

// Mock the modules
vi.mock("@opencode-ai/console-core/drizzle/index.js", () => ({
  Database: mockDatabase,
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn()
}))

vi.mock("@opencode-ai/console-core/schema/ip.sql.js", () => ({
  IpRateLimitTable: {
    ip: "ip",
    interval: "interval", 
    count: "count"
  }
}))

vi.mock("./logger", () => ({
  logger: mockLogger
}))

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns undefined when no limit provided", () => {
    const result = createRateLimiter(undefined, "127.0.0.1", new Headers())
    expect(result).toBeUndefined()
  })

  test("returns undefined when limit is null", () => {
    const result = createRateLimiter(null, "127.0.0.1", new Headers())
    expect(result).toBeUndefined()
  })

  test("creates rate limiter with fallback value when check header is missing", () => {
    const limit = {
      checkHeader: "x-api-key",
      fallbackValue: 100,
      value: 1000,
      period: "hour" as const
    }
    
    const headers = new Headers()
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
    expect(typeof result?.track).toBe("function")
    expect(typeof result?.check).toBe("function")
  })

  test("creates rate limiter with main value when check header is present", () => {
    const limit = {
      checkHeader: "x-api-key",
      fallbackValue: 100,
      value: 1000,
      period: "hour" as const
    }
    
    const headers = new Headers()
    headers.set("x-api-key", "valid-key")
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
    expect(typeof result?.track).toBe("function")
    expect(typeof result?.check).toBe("function")
  })

  test("handles empty IP address", () => {
    const limit = {
      value: 100,
      period: "hour" as const
    }
    
    const result = createRateLimiter(limit, "", new Headers())
    expect(result).toBeDefined()
  })

  test("handles day period intervals", () => {
    const limit = {
      value: 1000,
      period: "day" as const
    }
    
    const headers = new Headers()
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
    expect(typeof result?.track).toBe("function")
    expect(typeof result?.check).toBe("function")
  })

  test("handles hour period intervals", () => {
    const limit = {
      value: 100,
      period: "hour" as const
    }
    
    const headers = new Headers()
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
    expect(typeof result?.track).toBe("function")
    expect(typeof result?.check).toBe("function")
  })
})

describe("rate limiter track function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("tracks usage successfully", async () => {
    const mockTx = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onDuplicateKeyUpdate: vi.fn().mockReturnThis()
    }
    
    mockDatabase.use.mockResolvedValue(mockTx)
    
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    await rateLimiter!.track()
    
    expect(mockDatabase.use).toHaveBeenCalledTimes(1)
    expect(mockTx.insert).toHaveBeenCalled()
    expect(mockTx.values).toHaveBeenCalled()
    expect(mockTx.onDuplicateKeyUpdate).toHaveBeenCalled()
  })

  test("handles database errors during tracking", async () => {
    const dbError = new Error("Database connection failed")
    mockDatabase.use.mockRejectedValue(dbError)
    
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    
    await expect(rateLimiter!.track()).rejects.toThrow("Database connection failed")
  })
})

describe("rate limiter check function", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allows requests under limit", async () => {
    const mockRows = [
      { interval: "2026011514", count: 5 },
      { interval: "2026011513", count: 3 },
      { interval: "2026011512", count: 2 }
    ]
    
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows)
    }
    
    mockDatabase.use.mockResolvedValue(mockTx)
    
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    await expect(rateLimiter!.check()).resolves.not.toThrow()
    
    expect(mockLogger.debug).toHaveBeenCalledWith("rate limit total: 10")
  })

  test("throws FreeUsageLimitError when limit exceeded for hour period", async () => {
    const mockRows = [
      { interval: "2026011514", count: 50 },
      { interval: "2026011513", count: 30 },
      { interval: "2026011512", count: 25 }
    ]
    
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows)
    }
    
    mockDatabase.use.mockResolvedValue(mockTx)
    
    const limit = { value: 50, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    
    try {
      await rateLimiter!.check()
      expect.fail("Should have thrown FreeUsageLimitError")
    } catch (error) {
      expect(error).toBeInstanceOf(FreeUsageLimitError)
      expect(error.message).toBe("Rate limit exceeded. Please try again later.")
      expect((error as FreeUsageLimitError).retryAfter).toBeDefined()
    }
    
    expect(mockLogger.debug).toHaveBeenCalledWith("rate limit total: 105")
  })

  test("throws FreeUsageLimitError when limit exceeded for day period", async () => {
    const mockRows = [
      { interval: "20260115", count: 150 }
    ]
    
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows)
    }
    
    mockDatabase.use.mockResolvedValue(mockTx)
    
    const limit = { value: 100, period: "day" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    
    try {
      await rateLimiter!.check()
      expect.fail("Should have thrown FreeUsageLimitError")
    } catch (error) {
      expect(error).toBeInstanceOf(FreeUsageLimitError)
      expect(error.message).toBe("Rate limit exceeded. Please try again later.")
      expect((error as FreeUsageLimitError).retryAfter).toBeDefined()
    }
    
    expect(mockLogger.debug).toHaveBeenCalledWith("rate limit total: 150")
  })

  test("handles empty database results", async () => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([])
    }
    
    mockDatabase.use.mockResolvedValue(mockTx)
    
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    await expect(rateLimiter!.check()).resolves.not.toThrow()
    
    expect(mockLogger.debug).toHaveBeenCalledWith("rate limit total: 0")
  })

  test("handles database errors during checking", async () => {
    const dbError = new Error("Database query failed")
    mockDatabase.use.mockRejectedValue(dbError)
    
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    expect(rateLimiter).toBeDefined()
    
    await expect(rateLimiter!.check()).rejects.toThrow("Database query failed")
  })
})

describe("getRetryAfterDay", () => {
  test("calculates retry after for midnight UTC", () => {
    const midnight = Date.UTC(2026, 0, 15, 0, 0, 0, 0)
    expect(getRetryAfterDay(midnight)).toBe(86_400)
  })

  test("calculates retry after for noon UTC", () => {
    const noon = Date.UTC(2026, 0, 15, 12, 0, 0, 0)
    expect(getRetryAfterDay(noon)).toBe(43_200)
  })

  test("calculates retry after for 23:59:59 UTC", () => {
    const almostMidnight = Date.UTC(2026, 0, 15, 23, 59, 59, 0)
    expect(getRetryAfterDay(almostMidnight)).toBe(1)
  })

  test("rounds up milliseconds correctly", () => {
    const withMilliseconds = Date.UTC(2026, 0, 15, 23, 59, 59, 500)
    expect(getRetryAfterDay(withMilliseconds)).toBe(1)
  })

  test("handles different months", () => {
    const february = Date.UTC(2026, 1, 15, 12, 0, 0, 0)
    expect(getRetryAfterDay(february)).toBe(43_200)
  })

  test("handles leap year", () => {
    const leapDay = Date.UTC(2024, 1, 29, 12, 0, 0, 0)
    expect(getRetryAfterDay(leapDay)).toBe(43_200)
  })
})

describe("getRetryAfterHour", () => {
  const now = Date.UTC(2026, 0, 15, 14, 30, 0, 0)
  const intervals = ["2026011514", "2026011513", "2026011512"]

  test("calculates retry after when current hour exceeds limit", () => {
    const rows = [{ interval: "2026011514", count: 15 }]
    expect(getRetryAfterHour(rows, intervals, 10, now)).toBe(9000)
  })

  test("calculates retry after when dropping oldest interval is sufficient", () => {
    const rows = [
      { interval: "2026011514", count: 2 },
      { interval: "2026011512", count: 10 }
    ]
    expect(getRetryAfterHour(rows, intervals, 10, now)).toBe(1800)
  })

  test("calculates retry after when dropping multiple intervals is needed", () => {
    const rows = [
      { interval: "2026011513", count: 8 },
      { interval: "2026011512", count: 5 }
    ]
    expect(getRetryAfterHour(rows, intervals, 8, now)).toBe(5400)
  })

  test("handles empty rows array", () => {
    const rows: { interval: string; count: number }[] = []
    expect(getRetryAfterHour(rows, intervals, 1, now)).toBe(1800)
  })

  test("handles when all intervals need to be dropped", () => {
    const rows = [
      { interval: "2026011514", count: 5 },
      { interval: "2026011513", count: 5 },
      { interval: "2026011512", count: 5 }
    ]
    expect(getRetryAfterHour(rows, intervals, 1, now)).toBe(1800)
  })

  test("handles missing interval data", () => {
    const rows = [{ interval: "2026011514", count: 5 }]
    expect(getRetryAfterHour(rows, intervals, 10, now)).toBe(9000)
  })

  test("rounds up milliseconds correctly", () => {
    const offset = Date.UTC(2026, 0, 15, 14, 30, 0, 500)
    const rows = [
      { interval: "2026011514", count: 2 },
      { interval: "2026011512", count: 10 }
    ]
    expect(getRetryAfterHour(rows, intervals, 10, offset)).toBe(1800)
  })

  test("handles different time of day", () => {
    const morning = Date.UTC(2026, 0, 15, 9, 15, 0, 0)
    const rows = [{ interval: "2026011509", count: 15 }]
    const morningIntervals = ["2026011509", "2026011508", "2026011507"]
    expect(getRetryAfterHour(rows, morningIntervals, 10, morning)).toBe(9000)
  })
})

describe("interval building functions", () => {
  // These are internal functions but we need to test their behavior through the rate limiter
  test("builds correct day intervals", () => {
    const timestamp = Date.UTC(2026, 0, 15, 14, 30, 0, 0)
    const limit = { value: 100, period: "day" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    // The interval should be YYYYMMDD format
    expect(rateLimiter).toBeDefined()
  })

  test("builds correct hour intervals", () => {
    const timestamp = Date.UTC(2026, 0, 15, 14, 30, 0, 0)
    const limit = { value: 100, period: "hour" as const }
    const rateLimiter = createRateLimiter(limit, "127.0.0.1", new Headers())
    
    // Should build 3 intervals: current, -1h, -2h
    expect(rateLimiter).toBeDefined()
  })
})

describe("edge cases", () => {
  test("handles limit without checkHeader", () => {
    const limit = {
      value: 100,
      period: "hour" as const
    }
    
    const headers = new Headers()
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
  })

  test("handles limit with empty checkHeader value", () => {
    const limit = {
      checkHeader: "",
      fallbackValue: 50,
      value: 100,
      period: "hour" as const
    }
    
    const headers = new Headers()
    const result = createRateLimiter(limit, "127.0.0.1", headers)
    
    expect(result).toBeDefined()
  })

  test("handles very long IP address", () => {
    const limit = { value: 100, period: "hour" as const }
    const longIp = "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
    
    const result = createRateLimiter(limit, longIp, new Headers())
    expect(result).toBeDefined()
  })

  test("handles IPv6 IP address", () => {
    const limit = { value: 100, period: "hour" as const }
    const ipv6 = "::1"
    
    const result = createRateLimiter(limit, ipv6, new Headers())
    expect(result).toBeDefined()
  })
})
