import { describe, it, expect, beforeEach } from "bun:test"
import { levenshtein, getLevenshteinStats, resetLevenshteinStats } from "../levenshtein"

describe("Levenshtein Algorithm", () => {
  beforeEach(() => {
    resetLevenshteinStats()
  })

  describe("Basic Functionality", () => {
    it("should handle empty strings", () => {
      expect(levenshtein("", "")).toBe(0)
      expect(levenshtein("", "abc")).toBe(3)
      expect(levenshtein("abc", "")).toBe(3)
    })

    it("should handle identical strings", () => {
      expect(levenshtein("hello", "hello")).toBe(0)
      expect(levenshtein("", "")).toBe(0)
    })

    it("should calculate basic distances correctly", () => {
      expect(levenshtein("a", "b")).toBe(1)
      expect(levenshtein("ab", "ac")).toBe(1)
      expect(levenshtein("ab", "abc")).toBe(1)
      expect(levenshtein("abc", "ab")).toBe(1)
    })

    it("should handle more complex distances", () => {
      expect(levenshtein("kitten", "sitting")).toBe(3)
      expect(levenshtein("flaw", "lawn")).toBe(2)
      expect(levenshtein("intention", "execution")).toBe(5)
    })
  })

  describe("Memory Optimization", () => {
    it("should use optimized algorithm for strings within MAX_LENGTH", () => {
      const a = "a".repeat(500)
      const b = "a".repeat(499) + "b"
      
      const stats = getLevenshteinStats()
      const initialExact = stats.exactCalculations
      
      levenshtein(a, b)
      
      const finalStats = getLevenshteinStats()
      expect(finalStats.exactCalculations).toBe(initialExact + 1)
      expect(finalStats.approximateCalculations).toBe(0)
    })

    it("should use sliding window for strings exceeding MAX_LENGTH", () => {
      const a = "a".repeat(1500)
      const b = "a".repeat(1499) + "b"
      
      const stats = getLevenshteinStats()
      const initialApprox = stats.approximateCalculations
      
      levenshtein(a, b)
      
      const finalStats = getLevenshteinStats()
      expect(finalStats.approximateCalculations).toBe(initialApprox + 1)
      expect(finalStats.exactCalculations).toBe(0)
    })
  })

  describe("Sliding Window Algorithm Fixes", () => {
    it("should correctly handle optimal alignment in middle", () => {
      // Test case where optimal match is in middle, not at start
      const a = "prefix" + "target" + "suffix"
      const b = "target"
      
      const distance = levenshtein(a, b)
      // Should be 12 (6 for prefix + 6 for suffix), not 0
      expect(distance).toBe(12)
    })

    it("should handle large string approximation correctly", () => {
      const a = "a".repeat(2000)
      const b = "a".repeat(1999) + "b"
      
      const distance = levenshtein(a, b)
      // Should be approximately 1 (one character difference)
      expect(distance).toBeLessThan(10)
      expect(distance).toBeGreaterThan(0)
    })

    it("should handle both strings larger than window", () => {
      const a = "a".repeat(1500) + "x".repeat(500)
      const b = "a".repeat(1499) + "y".repeat(500) + "z"
      
      const distance = levenshtein(a, b)
      // Should be reasonable approximation
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(100)
    })
  })

  describe("Cache Performance", () => {
    it("should cache repeated calculations", () => {
      const a = "test string"
      const b = "another string"
      
      // First calculation
      levenshtein(a, b)
      let stats = getLevenshteinStats()
      const firstMisses = stats.cacheMisses
      const firstHits = stats.cacheHits
      
      // Second calculation (should hit cache)
      levenshtein(a, b)
      stats = getLevenshteinStats()
      
      expect(stats.cacheMisses).toBe(firstMisses)
      expect(stats.cacheHits).toBe(firstHits + 1)
    })

    it("should track cache hit rate correctly", () => {
      const a = "test"
      const b = "test2"
      
      // Multiple calculations to build cache
      levenshtein(a, b)
      levenshtein(a, b)
      levenshtein(a, b)
      
      const stats = getLevenshteinStats()
      expect(stats.cache.hitRate).toBeGreaterThan(0)
      expect(stats.cache.size).toBeGreaterThan(0)
    })

    it("should limit cache size to prevent memory issues", () => {
      // Create many unique entries to test cache size limit
      for (let i = 0; i < 1100; i++) {
        levenshtein(`string${i}`, `other${i}`)
      }
      
      const stats = getLevenshteinStats()
      expect(stats.cache.size).toBeLessThanOrEqual(1000)
    })
  })

  describe("Performance Monitoring", () => {
    it("should track exact vs approximate calculations", () => {
      resetLevenshteinStats()
      
      // Exact calculation
      levenshtein("short", "string")
      
      // Approximate calculation
      levenshtein("a".repeat(1500), "b".repeat(1500))
      
      const stats = getLevenshteinStats()
      expect(stats.exactCalculations).toBe(1)
      expect(stats.approximateCalculations).toBe(1)
      expect(stats.cacheHits).toBeGreaterThanOrEqual(0)
      expect(stats.cacheMisses).toBe(2)
    })
  })

  describe("Edge Cases", () => {
    it("should handle Unicode characters", () => {
      expect(levenshtein("café", "cafe")).toBe(1)
      expect(levenshtein("naïve", "naive")).toBe(1)
    })

    it("should handle special characters", () => {
      expect(levenshtein("hello\nworld", "hello world")).toBe(1)
      expect(levenshtein("test\ttab", "test tab")).toBe(1)
    })

    it("should validate input types", () => {
      expect(() => levenshtein(null as any, "test")).toThrow("Levenshtein distance requires string inputs")
      expect(() => levenshtein("test", 123 as any)).toThrow("Levenshtein distance requires string inputs")
    })
  })

  describe("Algorithm Accuracy", () => {
    it("should maintain accuracy for edge cases around MAX_LENGTH", () => {
      const exactLength = 1000
      const a = "a".repeat(exactLength)
      const b = "a".repeat(exactLength - 1) + "b"
      
      const exactDistance = levenshtein(a, b)
      
      // Slightly over MAX_LENGTH
      const a2 = "a".repeat(exactLength + 100)
      const b2 = "a".repeat(exactLength + 99) + "b"
      
      const approxDistance = levenshtein(a2, b2)
      
      // Both should be close to 1 (one character difference)
      expect(exactDistance).toBe(1)
      expect(approxDistance).toBeLessThan(50) // Allow some approximation error
    })
  })
})
