// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Locale } from "../locale"

describe("Locale", () => {
  describe("titlecase", () => {
    it("should capitalize first letter of each word", () => {
      expect(Locale.titlecase("hello world")).toBe("Hello World")
      expect(Locale.titlecase("the quick brown fox")).toBe("The Quick Brown Fox")
    })
    
    it("should handle single word", () => {
      expect(Locale.titlecase("hello")).toBe("Hello")
    })
    
    it("should handle empty string", () => {
      expect(Locale.titlecase("")).toBe("")
    })
    
    it("should handle already capitalized text", () => {
      expect(Locale.titlecase("Hello World")).toBe("Hello World")
    })
  })
  
  describe("time", () => {
    it("should format timestamp as time", () => {
      const timestamp = new Date(2024, 0, 1, 14, 30, 0).getTime()
      const result = Locale.time(timestamp)
      // Result depends on locale, but should contain time-related characters
      expect(result).toMatch(/\d/)
    })
  })
  
  describe("datetime", () => {
    it("should format timestamp as datetime", () => {
      const timestamp = new Date(2024, 0, 1, 14, 30, 0).getTime()
      const result = Locale.datetime(timestamp)
      // Should contain both time and date parts separated by ·
      expect(result).toContain("·")
    })
  })
  
  describe("todayTimeOrDateTime", () => {
    it("should return time for today's date", () => {
      const now = Date.now()
      const result = Locale.todayTimeOrDateTime(now)
      // Should not contain the separator for today's date
      expect(result).not.toContain("·")
    })
    
    it("should return datetime for past dates", () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000
      const result = Locale.todayTimeOrDateTime(yesterday)
      // Should contain the separator for non-today dates
      expect(result).toContain("·")
    })
  })
  
  describe("number", () => {
    it("should format small numbers as-is", () => {
      expect(Locale.number(0)).toBe("0")
      expect(Locale.number(100)).toBe("100")
      expect(Locale.number(999)).toBe("999")
    })
    
    it("should format thousands with K suffix", () => {
      expect(Locale.number(1000)).toBe("1.0K")
      expect(Locale.number(1500)).toBe("1.5K")
      expect(Locale.number(999999)).toBe("1000.0K")
    })
    
    it("should format millions with M suffix", () => {
      expect(Locale.number(1000000)).toBe("1.0M")
      expect(Locale.number(2500000)).toBe("2.5M")
    })
  })
  
  describe("duration", () => {
    it("should format milliseconds", () => {
      expect(Locale.duration(0)).toBe("0ms")
      expect(Locale.duration(100)).toBe("100ms")
      expect(Locale.duration(999)).toBe("999ms")
    })
    
    it("should format seconds", () => {
      expect(Locale.duration(1000)).toBe("1.0s")
      expect(Locale.duration(5000)).toBe("5.0s")
      expect(Locale.duration(59999)).toBe("60.0s")
    })
    
    it("should format minutes", () => {
      expect(Locale.duration(60000)).toBe("1m 0s")
      expect(Locale.duration(90000)).toBe("1m 30s")
      expect(Locale.duration(3599999)).toBe("59m 59s")
    })
    
    it("should format hours", () => {
      expect(Locale.duration(3600000)).toBe("1h 0m")
      expect(Locale.duration(3660000)).toBe("1h 1m")
      expect(Locale.duration(86399999)).toBe("23h 59m")
    })
    
    it("should format days", () => {
      expect(Locale.duration(86400000)).toBe("1d 0h")
      expect(Locale.duration(90000000)).toBe("1d 1h")
    })
  })
  
  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(Locale.truncate("hello", 10)).toBe("hello")
    })
    
    it("should truncate long strings with ellipsis", () => {
      expect(Locale.truncate("hello world", 5)).toBe("hell…")
    })
    
    it("should handle exact length", () => {
      expect(Locale.truncate("hello", 5)).toBe("hello")
    })
    
    it("should handle empty string", () => {
      expect(Locale.truncate("", 5)).toBe("")
    })
  })
  
  describe("truncateMiddle", () => {
    it("should not truncate short strings", () => {
      expect(Locale.truncateMiddle("hello", 10)).toBe("hello")
    })
    
    it("should truncate middle of long strings", () => {
      const result = Locale.truncateMiddle("hello world this is a long string", 15)
      expect(result).toContain("…")
      expect(result.length).toBe(15)
    })
    
    it("should use default max length of 35", () => {
      const longString = "a".repeat(50)
      const result = Locale.truncateMiddle(longString)
      expect(result.length).toBe(35)
    })
    
    it("should handle empty string", () => {
      expect(Locale.truncateMiddle("", 10)).toBe("")
    })
  })
  
  describe("pluralize", () => {
    it("should use singular for count of 1", () => {
      expect(Locale.pluralize(1, "{} item", "{} items")).toBe("1 item")
    })
    
    it("should use plural for count other than 1", () => {
      expect(Locale.pluralize(0, "{} item", "{} items")).toBe("0 items")
      expect(Locale.pluralize(2, "{} item", "{} items")).toBe("2 items")
      expect(Locale.pluralize(100, "{} item", "{} items")).toBe("100 items")
    })
    
    it("should replace {} with count", () => {
      expect(Locale.pluralize(5, "found {} result", "found {} results")).toBe("found 5 results")
    })
  })
})