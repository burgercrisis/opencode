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

import { describe, it, expect, beforeEach } from "bun:test"
import * as Identifier from "../id"
import { z } from "zod"

describe("Identifier", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  describe("ascending function", () => {
    it("should generate ascending IDs with prefix", () => {
      const id1 = Identifier.ascending("test")
      const id2 = Identifier.ascending("test")
      
      expect(id1).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(id2).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it("should generate different IDs for different prefixes", () => {
      const testId = Identifier.ascending("test")
      const sessionId = Identifier.ascending("session")
      
      expect(testId).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(sessionId).toMatch(/^session_[a-f0-9]+_[a-z0-9]+$/)
      expect(testId).not.toBe(sessionId)
    })

    it("should include timestamp in ID", () => {
      const before = Date.now()
      const id = Identifier.ascending("test")
      const after = Date.now()
      
      const timestamp = Identifier.timestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it("should generate monotonic increasing IDs", () => {
      const ids = Array(10).fill(null).map(() => Identifier.ascending("test"))
      const timestamps = ids.map(id => Identifier.timestamp(id))
      
      // Timestamps should be non-decreasing
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1])
      }
    })

    it("should handle empty prefix", () => {
      const id = Identifier.ascending("")
      expect(id).toMatch(/^_[a-f0-9]+_[a-z0-9]+$/)
    })

    it("should handle special characters in prefix", () => {
      const id = Identifier.ascending("test-prefix_123")
      expect(id).toMatch(/^test-prefix_123_[a-f0-9]+_[a-z0-9]+$/)
    })
  })

  describe("descending function", () => {
    it("should generate descending IDs with prefix", () => {
      const id1 = Identifier.descending("test")
      const id2 = Identifier.descending("test")
      
      expect(id1).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(id2).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it("should generate different IDs for different prefixes", () => {
      const testId = Identifier.descending("test")
      const sessionId = Identifier.descending("session")
      
      expect(testId).toMatch(/^test_[a-f0-9]+_[a-z0-9]+$/)
      expect(sessionId).toMatch(/^session_[a-f0-9]+_[a-z0-9]+$/)
      expect(testId).not.toBe(sessionId)
    })

    it("should include timestamp in ID", () => {
      const before = Date.now()
      const id = Identifier.descending("test")
      const after = Date.now()
      
      const timestamp = Identifier.timestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it("should generate monotonic decreasing IDs", () => {
      const ids = Array(10).fill(null).map(() => Identifier.descending("test"))
      const timestamps = ids.map(id => Identifier.timestamp(id))
      
      // Timestamps should be non-increasing
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1])
      }
    })

    it("should handle empty prefix", () => {
      const id = Identifier.descending("")
      expect(id).toMatch(/^_[a-f0-9]+_[a-z0-9]+$/)
    })

    it("should handle special characters in prefix", () => {
      const id = Identifier.descending("test-prefix_123")
      expect(id).toMatch(/^test-prefix_123_[a-f0-9]+_[a-z0-9]+$/)
    })
  })

  describe("timestamp function", () => {
    it("should extract timestamp from ascending ID", () => {
      const before = Date.now()
      const id = Identifier.ascending("test")
      const after = Date.now()
      
      const timestamp = Identifier.timestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it("should extract timestamp from descending ID", () => {
      const before = Date.now()
      const id = Identifier.descending("test")
      const after = Date.now()
      
      const timestamp = Identifier.timestamp(id)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it("should handle different prefixes", () => {
      const sessionId = Identifier.ascending("session")
      const messageId = Identifier.ascending("message")
      
      const sessionTimestamp = Identifier.timestamp(sessionId)
      const messageTimestamp = Identifier.timestamp(messageId)
      
      expect(typeof sessionTimestamp).toBe("number")
      expect(typeof messageTimestamp).toBe("number")
    })

    it("should throw error for invalid ID format", () => {
      expect(() => Identifier.timestamp("invalid")).toThrow()
      expect(() => Identifier.timestamp("test_invalid")).toThrow()
      expect(() => Identifier.timestamp("test_")).toThrow()
      expect(() => Identifier.timestamp("_123456")).toThrow()
    })

    it("should throw error for malformed timestamp", () => {
      expect(() => Identifier.timestamp("test_invalid_random")).toThrow()
      expect(() => Identifier.timestamp("test_xyz_random")).toThrow()
      expect(() => Identifier.timestamp("test_123xyz_random")).toThrow()
    })

    it("should handle valid hex timestamps", () => {
      const id = Identifier.ascending("test")
      const parts = id.split("_")
      expect(parts).toHaveLength(3)
      
      const timestampHex = parts[1]
      expect(timestampHex).toMatch(/^[a-f0-9]+$/)
      
      const extractedTimestamp = Identifier.timestamp(id)
      expect(typeof extractedTimestamp).toBe("number")
      expect(extractedTimestamp).toBeGreaterThan(0)
    })
  })

  describe("schema validation", () => {
    it("should validate correct ID format", () => {
      const id = Identifier.ascending("test")
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })

    it("should validate different prefixes", () => {
      const prefixes = ["session", "message", "permission", "user", "project"]
      
      prefixes.forEach(prefix => {
        const id = Identifier.ascending(prefix)
        expect(() => Identifier.schema.parse(id)).not.toThrow()
      })
    })

    it("should reject invalid ID formats", () => {
      const invalidIds = [
        "",
        "test",
        "test_",
        "_random",
        "test_invalid_random",
        "test_123_random_extra",
        "test_xyz_random",
        "test_123456",
        "test_random"
      ]
      
      invalidIds.forEach(id => {
        expect(() => Identifier.schema.parse(id)).toThrow()
      })
    })

    it("should reject IDs with invalid characters", () => {
      const invalidIds = [
        "test_123_ABC!",
        "test_123_abc@",
        "test_123_abc#",
        "test_123_abc$",
        "test_123_abc%"
      ]
      
      invalidIds.forEach(id => {
        expect(() => Identifier.schema.parse(id)).toThrow()
      })
    })

    it("should accept valid base62 characters", () => {
      const id = Identifier.ascending("test")
      const parts = id.split("_")
      const randomPart = parts[2]
      
      // Base62 characters: 0-9, a-z, A-Z
      expect(randomPart).toMatch(/^[a-zA-Z0-9]+$/)
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })
  })

  describe("ID structure", () => {
    it("should have three parts separated by underscores", () => {
      const id = Identifier.ascending("test")
      const parts = id.split("_")
      expect(parts).toHaveLength(3)
    })

    it("should have prefix as first part", () => {
      const prefix = "test-prefix"
      const id = Identifier.ascending(prefix)
      const parts = id.split("_")
      expect(parts[0]).toBe(prefix)
    })

    it("should have hex timestamp as second part", () => {
      const id = Identifier.ascending("test")
      const parts = id.split("_")
      expect(parts[1]).toMatch(/^[a-f0-9]+$/)
    })

    it("should have base62 random as third part", () => {
      const id = Identifier.ascending("test")
      const parts = id.split("_")
      expect(parts[2]).toMatch(/^[a-zA-Z0-9]+$/)
    })

    it("should have reasonable length", () => {
      const id = Identifier.ascending("test")
      expect(id.length).toBeGreaterThan(10)
      expect(id.length).toBeLessThan(100)
    })
  })

  describe("uniqueness", () => {
    it("should generate unique IDs", () => {
      const ids = new Set()
      const count = 1000
      
      for (let i = 0; i < count; i++) {
        const id = Identifier.ascending("test")
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
      
      expect(ids.size).toBe(count)
    })

    it("should generate unique descending IDs", () => {
      const ids = new Set()
      const count = 1000
      
      for (let i = 0; i < count; i++) {
        const id = Identifier.descending("test")
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
      
      expect(ids.size).toBe(count)
    })

    it("should generate unique IDs across different prefixes", () => {
      const ids = new Set()
      
      for (let i = 0; i < 100; i++) {
        const sessionId = Identifier.ascending("session")
        const messageId = Identifier.ascending("message")
        
        expect(ids.has(sessionId)).toBe(false)
        expect(ids.has(messageId)).toBe(false)
        
        ids.add(sessionId)
        ids.add(messageId)
      }
      
      expect(ids.size).toBe(200)
    })
  })

  describe("timestamp accuracy", () => {
    it("should have millisecond precision", () => {
      const id1 = Identifier.ascending("test")
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1))
      const id2 = Identifier.ascending("test")
      
      const timestamp1 = Identifier.timestamp(id1)
      const timestamp2 = Identifier.timestamp(id2)
      
      expect(timestamp2).toBeGreaterThan(timestamp1)
    })

    it("should handle rapid generation", () => {
      const ids = Array(100).fill(null).map(() => Identifier.ascending("test"))
      const timestamps = ids.map(id => Identifier.timestamp(id))
      
      // Should handle rapid generation without issues
      expect(timestamps).toHaveLength(100)
      timestamps.forEach(timestamp => {
        expect(typeof timestamp).toBe("number")
        expect(timestamp).toBeGreaterThan(0)
      })
    })
  })

  describe("edge cases", () => {
    it("should handle very long prefixes", () => {
      const longPrefix = "a".repeat(100)
      const id = Identifier.ascending(longPrefix)
      expect(id.startsWith(longPrefix)).toBe(true)
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })

    it("should handle unicode prefixes", () => {
      const unicodePrefix = "测试"
      const id = Identifier.ascending(unicodePrefix)
      expect(id.startsWith(unicodePrefix)).toBe(true)
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })

    it("should handle numeric prefixes", () => {
      const numericPrefix = "123"
      const id = Identifier.ascending(numericPrefix)
      expect(id.startsWith(numericPrefix)).toBe(true)
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })

    it("should handle mixed character prefixes", () => {
      const mixedPrefix = "test-123_abc"
      const id = Identifier.ascending(mixedPrefix)
      expect(id.startsWith(mixedPrefix)).toBe(true)
      expect(() => Identifier.schema.parse(id)).not.toThrow()
    })
  })

  describe("performance", () => {
    it("should generate IDs quickly", () => {
      const start = performance.now()
      
      for (let i = 0; i < 10000; i++) {
        Identifier.ascending("test")
      }
      
      const end = performance.now()
      const duration = end - start
      
      // Should generate 10k IDs in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000)
    })

    it("should extract timestamps quickly", () => {
      const ids = Array(1000).fill(null).map(() => Identifier.ascending("test"))
      
      const start = performance.now()
      
      ids.forEach(id => {
        Identifier.timestamp(id)
      })
      
      const end = performance.now()
      const duration = end - start
      
      // Should extract 1000 timestamps quickly (< 100ms)
      expect(duration).toBeLessThan(100)
    })
  })

  describe("integration with zod", () => {
    it("should work with zod validation", () => {
      const id = Identifier.ascending("test")
      const result = Identifier.schema.safeParse(id)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(id)
      }
    })

    it("should provide detailed error messages", () => {
      const result = Identifier.schema.safeParse("invalid")
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeDefined()
        expect(result.error.issues).toBeDefined()
      }
    })

    it("should work with zod transformations", () => {
      const id = Identifier.ascending("test")
      const transformed = Identifier.schema.transform((id) => id.toUpperCase()).safeParse(id)
      
      expect(transformed.success).toBe(true)
      if (transformed.success) {
        expect(transformed.data).toBe(id.toUpperCase())
      }
    })
  })
})
