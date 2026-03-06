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
import { formatDuration } from "../format"

describe("formatDuration", () => {
  it("should return empty string for zero or negative values", () => {
    expect(formatDuration(0)).toBe("")
    expect(formatDuration(-1)).toBe("")
    expect(formatDuration(-100)).toBe("")
  })
  
  it("should format seconds correctly", () => {
    expect(formatDuration(1)).toBe("1s")
    expect(formatDuration(30)).toBe("30s")
    expect(formatDuration(59)).toBe("59s")
  })
  
  it("should format minutes correctly", () => {
    expect(formatDuration(60)).toBe("1m")
    expect(formatDuration(120)).toBe("2m")
    expect(formatDuration(90)).toBe("1m 30s")
    expect(formatDuration(3599)).toBe("59m 59s")
  })
  
  it("should format hours correctly", () => {
    expect(formatDuration(3600)).toBe("1h")
    expect(formatDuration(7200)).toBe("2h")
    expect(formatDuration(3660)).toBe("1h 1m")
    expect(formatDuration(86399)).toBe("23h 59m")
  })
  
  it("should format days correctly", () => {
    expect(formatDuration(86400)).toBe("~1 day")
    expect(formatDuration(172800)).toBe("~2 days")
    expect(formatDuration(604799)).toBe("~6 days")
  })
  
  it("should format weeks correctly", () => {
    expect(formatDuration(604800)).toBe("~1 week")
    expect(formatDuration(1209600)).toBe("~2 weeks")
    expect(formatDuration(2419200)).toBe("~4 weeks")
  })
  
  it("should handle edge cases around boundaries", () => {
    // Just under 60 seconds
    expect(formatDuration(59)).toBe("59s")
    // Exactly 60 seconds
    expect(formatDuration(60)).toBe("1m")
    // Just under 1 hour
    expect(formatDuration(3599)).toBe("59m 59s")
    // Exactly 1 hour
    expect(formatDuration(3600)).toBe("1h")
    // Just under 1 day
    expect(formatDuration(86399)).toBe("23h 59m")
    // Exactly 1 day
    expect(formatDuration(86400)).toBe("~1 day")
    // Just under 1 week
    expect(formatDuration(604799)).toBe("~6 days")
    // Exactly 1 week
    expect(formatDuration(604800)).toBe("~1 week")
  })
  
  it("should handle large values", () => {
    expect(formatDuration(2592000)).toBe("~4 weeks")  // 30 days
    expect(formatDuration(31536000)).toBe("~52 weeks")  // 365 days
  })
})