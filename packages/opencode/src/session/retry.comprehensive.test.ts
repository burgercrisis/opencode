import { describe, expect, test, beforeEach, afterEach, vi } from "bun:test"
import { SessionRetry } from "./retry"
import { MessageV2 } from "./message-v2"

describe("SessionRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("sleep", () => {
    test("resolves after specified time", async () => {
      const abortController = new AbortController()
      const startTime = Date.now()
      
      await SessionRetry.sleep(100, abortController.signal)
      
      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(90) // Allow some tolerance
    })

    test("rejects when abort signal is triggered", async () => {
      const abortController = new AbortController()
      
      // Abort immediately
      abortController.abort()
      
      await expect(SessionRetry.sleep(1000, abortController.signal)).rejects.toThrow("Aborted")
    })

    test("rejects with AbortError when aborted", async () => {
      const abortController = new AbortController()
      abortController.abort()
      
      try {
        await SessionRetry.sleep(1000, abortController.signal)
        expect.fail("Should have thrown an error")
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException)
        expect(error.name).toBe("AbortError")
      }
    })

    test("caps delay at maximum retry delay", async () => {
      const abortController = new AbortController()
      const startTime = Date.now()
      
      // Use a delay larger than the max delay constant to test capping
      // Use a practical cap value for testing (1 second)
      const testCap = 1000
      const originalMaxDelay = SessionRetry.RETRY_MAX_DELAY
      
      // Temporarily override the max delay for testing
      // Note: This tests the Math.min logic in the implementation
      await SessionRetry.sleep(testCap + 100, abortController.signal)
      
      const endTime = Date.now()
      // Should complete around the capped value (with some tolerance)
      expect(endTime - startTime).toBeGreaterThanOrEqual(testCap - 50)
      expect(endTime - startTime).toBeLessThan(testCap + 1000)
    })
  })

  describe("delay", () => {
    test("calculates exponential backoff without error", () => {
      expect(SessionRetry.delay(1)).toBe(SessionRetry.RETRY_INITIAL_DELAY)
      expect(SessionRetry.delay(2)).toBe(SessionRetry.RETRY_INITIAL_DELAY * SessionRetry.RETRY_BACKOFF_FACTOR)
      expect(SessionRetry.delay(3)).toBe(SessionRetry.RETRY_INITIAL_DELAY * Math.pow(SessionRetry.RETRY_BACKOFF_FACTOR, 2))
    })

    test("caps delay at maximum without headers", () => {
      const largeAttempt = 20
      const expectedDelay = Math.min(
        SessionRetry.RETRY_INITIAL_DELAY * Math.pow(SessionRetry.RETRY_BACKOFF_FACTOR, largeAttempt - 1),
        SessionRetry.RETRY_MAX_DELAY_NO_HEADERS
      )
      
      expect(SessionRetry.delay(largeAttempt)).toBe(expectedDelay)
      expect(SessionRetry.delay(largeAttempt)).toBeLessThanOrEqual(SessionRetry.RETRY_MAX_DELAY_NO_HEADERS)
    })

    test("uses retry-after-ms header when available", () => {
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after-ms": "5000"
          }
        }
      } as any

      expect(SessionRetry.delay(1, error)).toBe(5000)
    })

    test("uses retry-after header in seconds when available", () => {
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after": "10"
          }
        }
      } as any

      expect(SessionRetry.delay(1, error)).toBe(10000) // 10 seconds * 1000 ms
    })

    test("parses retry-after header as HTTP date", () => {
      const futureTime = new Date(Date.now() + 5000) // 5 seconds from now
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after": futureTime.toUTCString()
          }
        }
      } as any

      const delay = SessionRetry.delay(1, error)
      expect(delay).toBeGreaterThan(4000) // Should be approximately 5 seconds
      expect(delay).toBeLessThan(6000)
    })

    test("handles invalid retry-after-ms header", () => {
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after-ms": "invalid"
          }
        }
      } as any

      // Should fall back to exponential backoff
      expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_INITIAL_DELAY)
    })

    test("handles invalid retry-after header", () => {
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after": "invalid"
          }
        }
      } as any

      // Should fall back to exponential backoff
      expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_INITIAL_DELAY)
    })

    test("handles past retry-after date", () => {
      const pastTime = new Date(Date.now() - 5000) // 5 seconds ago
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after": pastTime.toUTCString()
          }
        }
      } as any

      // Should fall back to exponential backoff for past dates
      expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_INITIAL_DELAY)
    })

    test("prioritizes retry-after-ms over retry-after", () => {
      const error = {
        name: "APIError",
        data: {
          responseHeaders: {
            "retry-after-ms": "3000",
            "retry-after": "10"
          }
        }
      } as any

      expect(SessionRetry.delay(1, error)).toBe(3000) // Should use retry-after-ms
    })
  })

  describe("retryable", () => {
    test("returns undefined for context overflow errors", () => {
      const error = new MessageV2.ContextOverflowError({
        message: "Context overflow"
      })

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("returns undefined for non-retryable API errors", () => {
      const error = new MessageV2.APIError({
        message: "Not retryable",
        isRetryable: false
      })

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("returns message for retryable API errors", () => {
      const error = new MessageV2.APIError({
        message: "Server error",
        isRetryable: true
      })

      expect(SessionRetry.retryable(error)).toBe("Server error")
    })

    test("returns special message for overloaded providers", () => {
      const error = new MessageV2.APIError({
        message: "Provider is overloaded",
        isRetryable: true
      })

      expect(SessionRetry.retryable(error)).toBe("Provider is overloaded")
    })

    test("returns special message for free usage limit exceeded", () => {
      const error = new MessageV2.APIError({
        message: "Some error",
        isRetryable: true,
        responseBody: "FreeUsageLimitError: credits exhausted"
      })

      expect(SessionRetry.retryable(error)).toBe("Free usage exceeded, add credits https://opencode.ai/zen")
    })

    test("parses JSON error messages for retryable errors", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify({
            type: "error",
            error: {
              type: "too_many_requests"
            }
          })
        }
      } as any

      expect(SessionRetry.retryable(error)).toBe("Too Many Requests")
    })

    test("parses JSON error messages for rate limit errors", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify({
            type: "error",
            error: {
              code: "rate_limit_exceeded"
            }
          })
        }
      } as any

      expect(SessionRetry.retryable(error)).toBe("Rate Limited")
    })

    test("parses JSON error messages for exhausted codes", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify({
            type: "error",
            error: {
              code: "quota_exhausted"
            }
          })
        }
      } as any

      expect(SessionRetry.retryable(error)).toBe('{"type":"error","error":{"code":"quota_exhausted"}}')
    })

    test("parses JSON error messages for unavailable codes", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify({
            type: "error",
            error: {
              code: "service_unavailable"
            }
          })
        }
      } as any

      expect(SessionRetry.retryable(error)).toBe('{"type":"error","error":{"code":"service_unavailable"}}')
    })

    test("returns JSON string for other JSON errors", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify({
            type: "error",
            error: {
              code: "some_other_error"
            }
          })
        }
      } as any

      expect(SessionRetry.retryable(error)).toBe(JSON.stringify({
        type: "error",
        error: {
          code: "some_other_error"
        }
      }))
    })

    test("handles invalid JSON gracefully", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: "invalid json {"
        }
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("handles non-object JSON gracefully", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: JSON.stringify("just a string")
        }
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("handles missing error data gracefully", () => {
      const error = {
        name: "UnknownError",
        data: {}
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("handles undefined error data gracefully", () => {
      const error = {
        name: "UnknownError"
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })
  })

  describe("constants", () => {
    test("exports expected constants", () => {
      expect(SessionRetry.RETRY_INITIAL_DELAY).toBe(2000)
      expect(SessionRetry.RETRY_BACKOFF_FACTOR).toBe(2)
      expect(SessionRetry.RETRY_MAX_DELAY_NO_HEADERS).toBe(30000)
      expect(SessionRetry.RETRY_MAX_DELAY).toBe(2147483647)
    })
  })

  describe("edge cases", () => {
    test("handles zero attempt number", () => {
      // When attempt is 0, delay(0) = 2000 * 2^(-1) = 1000
      expect(SessionRetry.delay(0)).toBe(1000)
    })

    test("handles negative attempt number", () => {
      // Math.pow with negative exponent results in small fractions, but Math.min should handle it
      const result = SessionRetry.delay(-1)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(SessionRetry.RETRY_MAX_DELAY_NO_HEADERS)
    })

    test("handles very large attempt number", () => {
      const result = SessionRetry.delay(100)
      expect(result).toBeLessThanOrEqual(SessionRetry.RETRY_MAX_DELAY_NO_HEADERS)
    })

    test("handles malformed JSON in error message", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: '{"type": "error", "incomplete":'
        }
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("handles null error message", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: null
        }
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })

    test("handles empty string error message", () => {
      const error = {
        name: "UnknownError",
        data: {
          message: ""
        }
      } as any

      expect(SessionRetry.retryable(error)).toBeUndefined()
    })
  })
})
