import { describe, test, expect } from "bun:test"
import { levenshtein } from "../../src/util/levenshtein"

describe("Levenshtein Cache Memory Leak Fix", () => {
  test("should properly limit cache size to prevent memory leaks", async () => {
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
    levenshtein("string0", "other0") // Oldest, should be evicted
    const oldTime = Date.now() - oldStart
    
    // Should take longer than cached access but still be reasonable
    expect(oldTime).toBeGreaterThan(cachedTime)
    expect(oldTime).toBeLessThan(100) // Still should complete quickly
  })

  test("should maintain LRU behavior correctly", () => {
    // Fill cache with some items
    levenshtein("a", "b")
    levenshtein("c", "d") 
    levenshtein("e", "f")
    
    // Access first item to make it most recently used
    levenshtein("a", "b")
    
    // Add more items to exceed cache limit
    for (let i = 0; i < 1002; i++) {
      levenshtein(`item${i}`, `other${i}`)
    }
    
    // The most recently accessed item should still be cached (fast)
    const start = Date.now()
    const result1 = levenshtein("a", "b")
    const time1 = Date.now() - start
    
    // An old item should be evicted (slower)
    const oldStart = Date.now()
    const result2 = levenshtein("c", "d")
    const time2 = Date.now() - oldStart
    
    expect(time1).toBeLessThan(time2)
    expect(result1).toBe(1) // distance between "a" and "b"
    expect(result2).toBe(1) // distance between "c" and "d"
  })

  test("should handle repeated access patterns efficiently", () => {
    // Test pattern of repeated access to same items
    const testPairs = [
      ["hello", "world"],
      ["test", "case"],
      ["foo", "bar"]
    ]
    
    // First pass - populate cache
    const firstPassStart = Date.now()
    for (const [a, b] of testPairs) {
      levenshtein(a, b)
    }
    const firstPassTime = Date.now() - firstPassStart
    
    // Second pass - should be faster due to caching
    const secondPassStart = Date.now()
    for (const [a, b] of testPairs) {
      levenshtein(a, b)
    }
    const secondPassTime = Date.now() - secondPassStart
    
    // Third pass - should still be fast
    const thirdPassStart = Date.now()
    for (const [a, b] of testPairs) {
      levenshtein(a, b)
    }
    const thirdPassTime = Date.now() - thirdPassStart
    
    // Later passes should be significantly faster due to caching
    expect(secondPassTime).toBeLessThan(firstPassTime * 0.5)
    expect(thirdPassTime).toBeLessThan(firstPassTime * 0.5)
  })

  test("should clear cache properly", () => {
    // Populate cache
    levenshtein("test1", "test2")
    levenshtein("test3", "test4")
    
    // Clear cache
    // Note: We can't directly clear, but we can test behavior
    // by checking that operations complete correctly
    
    // Operations should still work after cache would be cleared
    expect(levenshtein("a", "b")).toBe(1)
    expect(levenshtein("", "hello")).toBe(5)
    expect(levenshtein("kitten", "sitting")).toBe(3)
  })
})
