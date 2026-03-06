// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

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

import { describe, it, expect, beforeEach, afterEach, test } from 'bun:test'
import { levenshtein } from '@/util/levenshtein'

describe('Levenshtein Algorithm - Comprehensive Tests', () => {
  beforeEach(() => {
    // Clear cache before each test
    const levenshteinModule = require('@/util/levenshtein')
    if (levenshteinModule.cache) {
      levenshteinModule.cache.clear()
    }
  })

  describe("Basic Algorithm Functionality", () => {
    it('should handle empty strings correctly', () => {
      expect(levenshtein('', '')).toBe(0)
      expect(levenshtein('', 'abc')).toBe(3)
      expect(levenshtein('abc', '')).toBe(3)
    })

    it('should handle identical strings', () => {
      expect(levenshtein('hello', 'hello')).toBe(0)
      expect(levenshtein('test', 'test')).toBe(0)
    })

    it('should calculate correct distance for simple strings', () => {
      expect(levenshtein('kitten', 'sitting')).toBe(3)
      expect(levenshtein('flaw', 'lawn')).toBe(2)
      expect(levenshtein('intention', 'execution')).toBe(5)
    })

    it('should handle large strings without crashing', () => {
      const longString1 = 'a'.repeat(1000)
      const longString2 = 'b'.repeat(1000)
      
      // Should complete without throwing
      const distance = levenshtein(longString1, longString2)
      expect(distance).toBe(1000)
    })

    it('should handle Unicode characters correctly', () => {
      expect(levenshtein('café', 'cafe')).toBe(1)
      expect(levenshtein('naïve', 'naive')).toBe(1)
      expect(levenshtein('🙂', '😊')).toBe(1)
    })

    it('should be case sensitive by default', () => {
      expect(levenshtein('Hello', 'hello')).toBe(1)
      expect(levenshtein('TEST', 'test')).toBe(4)
    })
  })

  describe("Algorithm Fixes and Edge Cases", () => {
    it('should handle strings with special characters', () => {
      expect(levenshtein('test@example.com', 'test@domain.com')).toBe(7)
      expect(levenshtein('file.txt', 'file.doc')).toBe(3)
      expect(levenshtein('/path/to/file', '/path/to/dir')).toBe(4)
    })

    it('should handle very different strings efficiently', () => {
      const string1 = 'completely-different-string'
      const string2 = 'another-totally-different'
      
      const distance = levenshtein(string1, string2)
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(Math.max(string1.length, string2.length))
    })

    it('should handle repeated characters correctly', () => {
      expect(levenshtein('aaaa', 'bbbb')).toBe(4)
      expect(levenshtein('abcabc', 'abcabc')).toBe(0)
      expect(levenshtein('abcabc', 'abdabd')).toBe(2)
    })

    it('should handle strings with whitespace', () => {
      expect(levenshtein('hello world', 'helloworld')).toBe(1)
      expect(levenshtein('  test  ', 'test')).toBe(4)
      expect(levenshtein('\ttest\n', 'test')).toBe(2)
    })

    it('should handle numeric strings', () => {
      expect(levenshtein('123', '456')).toBe(3)
      expect(levenshtein('12345', '123')).toBe(2)
      expect(levenshtein('version 1.0', 'version 2.0')).toBe(1)
    })
  })

  describe("Cache Memory Management", () => {
    bulletproofTest("should properly limit cache size to prevent memory leaks", async () => {
      // Create many unique string pairs to exceed cache limit
      const uniquePairs = []
      for (let i = 0; i < 1500; i++) {
        uniquePairs.push([`string${i}`, `other${i}`])
      }

      // Process all unique pairs
      for (const [a, b] of uniquePairs) {
        levenshtein(a, b)
      }

      // Cache should not grow beyond maximum size
      // We can't directly access the cache, but we can test behavior
      // by checking that recently used items are still cached
      
      // Test that recently accessed items are cached (should be fast)
      const start = Date.now()
      levenshtein("string1499", "other1499") // Most recent
      const cachedTime = Date.now() - start
      
      // Should be very fast if cached (under 1ms)
      expect(cachedTime).toBeLessThan(5)
      
      // Test that old items are not cached (should be slower but still reasonable)
      const oldStart = Date.now()
      levenshtein("string0", "other0") // Oldest
      const oldTime = Date.now() - oldStart
      
      // Should take longer than cached items but still be reasonable
      expect(oldTime).toBeGreaterThan(cachedTime)
      expect(oldTime).toBeLessThan(100) // Should complete in under 100ms
    })

    bulletproofTest("should handle cache hit/miss patterns correctly", async () => {
      const testPairs = [
        ['hello', 'world'],
        ['test', 'best'],
        ['cache', 'cachet'],
        ['apple', 'apply'],
        ['banana', 'bandana']
      ]

      // First pass - should be cache misses (slower)
      const firstPassStart = Date.now()
      testPairs.forEach(([a, b]) => levenshtein(a, b))
      const firstPassTime = Date.now() - firstPassStart

      // Second pass - should be cache hits (faster)
      const secondPassStart = Date.now()
      testPairs.forEach(([a, b]) => levenshtein(a, b))
      const secondPassTime = Date.now() - secondPassStart

      // Second pass should be faster due to caching
      expect(secondPassTime).toBeLessThan(firstPassTime)
    })

    bulletproofTest("should handle cache memory pressure gracefully", async () => {
      // Create a large number of unique calculations to trigger memory pressure
      const calculations = []
      
      for (let i = 0; i < 2000; i++) {
        calculations.push(() => levenshtein(`item${i}`, `other${i}`))
      }

      // All calculations should complete without memory errors
      expect(() => {
        calculations.forEach(calc => calc())
      }).not.toThrow()
    })
  })

  describe("Performance and Optimization", () => {
    bulletproofTest("should handle large strings efficiently", async () => {
      const largeString1 = 'a'.repeat(5000)
      const largeString2 = 'b'.repeat(5000)

      const startTime = Date.now()
      const distance = levenshtein(largeString1, largeString2)
      const endTime = Date.now()

      expect(distance).toBe(5000)
      // Should complete in reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(1000) // 1 second
    })

    bulletproofTest("should use approximation for very large strings when needed", async () => {
      // Test with strings that might trigger approximation
      const veryLarge1 = 'a'.repeat(10000)
      const veryLarge2 = 'b'.repeat(10000)

      const distance = levenshtein(veryLarge1, veryLarge2)
      
      // Should still return a reasonable result
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(10000)
    })

    bulletproofTest("should maintain accuracy for typical use cases", async () => {
      const testCases = [
        ['', '', 0],
        ['a', '', 1],
        ['', 'a', 1],
        ['a', 'a', 0],
        ['ab', 'ba', 2],
        ['kitten', 'sitting', 3],
        ['flaw', 'lawn', 2],
        ['intention', 'execution', 5],
        ['algorithm', 'logarithm', 6]
      ]

      testCases.forEach(([a, b, expected]) => {
        expect(levenshtein(a as string, b as string)).toBe(expected)
      })
    })
  })

  describe("Error Handling and Validation", () => {
    it('should handle null and undefined inputs gracefully', () => {
      expect(() => levenshtein(null as any, 'test')).toThrow()
      expect(() => levenshtein('test', null as any)).toThrow()
      expect(() => levenshtein(undefined as any, 'test')).toThrow()
      expect(() => levenshtein('test', undefined as any)).toThrow()
    })

    it('should handle non-string inputs', () => {
      expect(() => levenshtein(123 as any, 'test')).toThrow()
      expect(() => levenshtein('test', 456 as any)).toThrow()
      expect(() => levenshtein({} as any, 'test')).toThrow()
      expect(() => levenshtein('test', [] as any)).toThrow()
    })

    it('should handle extremely long strings without stack overflow', () => {
      const extremelyLong = 'a'.repeat(50000)
      
      expect(() => {
        levenshtein(extremelyLong, extremelyLong)
      }).not.toThrow()
    })
  })

  describe("Cache Behavior", () => {
    bulletproofTest("should cache frequently used calculations", async () => {
      const pair = ['frequently', 'used']
      
      // First calculation
      const time1 = Date.now()
      const result1 = levenshtein(pair[0], pair[1])
      const duration1 = Date.now() - time1
      
      // Second calculation (should be cached)
      const time2 = Date.now()
      const result2 = levenshtein(pair[0], pair[1])
      const duration2 = Date.now() - time2
      
      // Results should be identical
      expect(result1).toBe(result2)
      
      // Second calculation should be faster
      expect(duration2).toBeLessThanOrEqual(duration1)
    })

    bulletproofTest("should handle cache eviction correctly", async () => {
      // Fill cache with many unique entries
      const entries = []
      for (let i = 0; i < 1200; i++) {
        entries.push([`key${i}`, `value${i}`])
      }

      // Process all entries
      entries.forEach(([a, b]) => levenshtein(a, b))

      // Access some early entries (may have been evicted)
      const earlyResult = levenshtein('key0', 'value0')
      const lateResult = levenshtein('key1199', 'value1199')

      expect(typeof earlyResult).toBe('number')
      expect(typeof lateResult).toBe('number')
    })
  })

  describe("Integration with Other Systems", () => {
    bulletproofTest("should work correctly in concurrent scenarios", async () => {
      const calculations = [
        ['test1', 'test2'],
        ['hello', 'world'],
        ['foo', 'bar'],
        ['alpha', 'beta'],
        ['gamma', 'delta']
      ]

      // Run calculations concurrently
      const promises = calculations.map(([a, b]) => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve(levenshtein(a, b))
          }, Math.random() * 10)
        })
      )

      const results = await Promise.all(promises)
      
      // All should be valid numbers
      results.forEach(result => {
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
      })

      // Should match expected values
      expect(results[0]).toBe(levenshtein('test1', 'test2'))
      expect(results[1]).toBe(levenshtein('hello', 'world'))
    })

    bulletproofTest("should maintain consistency across multiple calls", async () => {
      const testPairs = [
        ['consistency', 'inconsistency'],
        ['performance', 'performance'],
        ['accuracy', 'precise']
      ]

      // Multiple calls should return same results
      testPairs.forEach(([a, b]) => {
        const result1 = levenshtein(a, b)
        const result2 = levenshtein(a, b)
        const result3 = levenshtein(a, b)

        expect(result1).toBe(result2)
        expect(result2).toBe(result3)
      })
    })
  })
})
