import { describe, it, expect, beforeEach } from "bun:test"
import { levenshtein, getLevenshteinStats, resetLevenshteinStats } from "../levenshtein"

describe("Levenshtein Performance Benchmarks", () => {
  beforeEach(() => {
    resetLevenshteinStats()
  })

  describe("Memory Usage Benchmarks", () => {
    it("should handle large strings without memory issues", () => {
      const sizes = [100, 500, 1000, 2000, 5000]
      
      for (const size of sizes) {
        const a = "a".repeat(size)
        const b = "a".repeat(size - 1) + "b"
        
        const startTime = performance.now()
        const distance = levenshtein(a, b)
        const endTime = performance.now()
        
        const duration = endTime - startTime
        const stats = getLevenshteinStats()
        
        console.log(`Size ${size}: distance=${distance}, time=${duration.toFixed(2)}ms, algorithm=${size <= 1000 ? 'exact' : 'approximate'}`)
        
        // Performance should be reasonable
        expect(duration).toBeLessThan(1000) // Less than 1 second
        expect(distance).toBeGreaterThan(0)
        
        // Memory usage should be controlled (no crashes)
        expect(distance).toBeLessThan(size * 2) // Reasonable distance bounds
      }
    })
  })

  describe("Cache Performance Benchmarks", () => {
    it("should demonstrate cache efficiency", () => {
      const testCases = [
        ["hello", "world"],
        ["kitten", "sitting"],
        ["a".repeat(100), "b".repeat(100)],
        ["a".repeat(500), "a".repeat(499) + "b"]
      ]
      
      // First pass - populate cache
      const firstPassStart = performance.now()
      for (const [a, b] of testCases) {
        levenshtein(a, b)
      }
      const firstPassEnd = performance.now()
      
      // Second pass - should hit cache
      const secondPassStart = performance.now()
      for (const [a, b] of testCases) {
        levenshtein(a, b)
      }
      const secondPassEnd = performance.now()
      
      const stats = getLevenshteinStats()
      
      console.log(`Cache performance:`)
      console.log(`First pass: ${(firstPassEnd - firstPassStart).toFixed(2)}ms`)
      console.log(`Second pass: ${(secondPassEnd - secondPassStart).toFixed(2)}ms`)
      console.log(`Cache hit rate: ${(stats.cache.hitRate * 100).toFixed(1)}%`)
      
      // Second pass should be faster due to caching
      expect(secondPassEnd - secondPassStart).toBeLessThan(firstPassEnd - firstPassStart)
      expect(stats.cache.hitRate).toBeGreaterThan(0.4) // At least 40% hit rate
    })
  })

  describe("Algorithm Selection Benchmarks", () => {
    it("should show performance difference between exact and approximate", () => {
      const exactSize = 800 // Within MAX_LENGTH
      const approxSize = 1200 // Exceeds MAX_LENGTH
      
      // Exact algorithm test
      const exactStart = performance.now()
      const exactDistance = levenshtein("a".repeat(exactSize), "a".repeat(exactSize - 1) + "b")
      const exactEnd = performance.now()
      
      // Approximate algorithm test  
      const approxStart = performance.now()
      const approxDistance = levenshtein("a".repeat(approxSize), "a".repeat(approxSize - 1) + "b")
      const approxEnd = performance.now()
      
      const stats = getLevenshteinStats()
      
      console.log(`Algorithm comparison:`)
      console.log(`Exact (${exactSize} chars): ${(exactEnd - exactStart).toFixed(2)}ms, distance=${exactDistance}`)
      console.log(`Approximate (${approxSize} chars): ${(approxEnd - approxStart).toFixed(2)}ms, distance=${approxDistance}`)
      console.log(`Exact calculations: ${stats.exactCalculations}`)
      console.log(`Approximate calculations: ${stats.approximateCalculations}`)
      
      // Both should complete in reasonable time
      expect(exactEnd - exactStart).toBeLessThan(500)
      expect(approxEnd - approxStart).toBeLessThan(500)
      
      // Should have used correct algorithms
      expect(stats.exactCalculations).toBeGreaterThan(0)
      expect(stats.approximateCalculations).toBeGreaterThan(0)
      
      // Distances should be reasonable
      expect(exactDistance).toBe(1)
      expect(approxDistance).toBeLessThan(50) // Allow approximation tolerance
    })
  })

  describe("ReDoS Protection Benchmarks", () => {
    it("should handle complex patterns efficiently", () => {
      const complexPatterns = [
        "a" + "*".repeat(5),
        "test" + "|".repeat(15) + "pattern",
        "(a{1,10}){1,10}",
        ".*.*.*.*.*.*.*.*.*.*"
      ]
      
      for (const pattern of complexPatterns) {
        const startTime = performance.now()
        
        try {
          levenshtein(pattern, "simple")
        } catch (error) {
          // Expected for some complex patterns
        }
        
        const endTime = performance.now()
        const duration = endTime - startTime
        
        console.log(`Complex pattern "${pattern.substring(0, 20)}...": ${duration.toFixed(2)}ms`)
        
        // Should complete quickly even with complex patterns
        expect(duration).toBeLessThan(100) // Less than 100ms
      }
    })
  })

  describe("Stress Tests", () => {
    it("should handle extreme input sizes", () => {
      const extremeCases = [
        { a: "a".repeat(10000), b: "b".repeat(10000) },
        { a: "a".repeat(5000) + "x".repeat(5000), b: "a".repeat(4999) + "y".repeat(5000) + "z" },
        { a: "mixed".repeat(1000), b: "mixed".repeat(999) + "different" }
      ]
      
      for (const { a, b } of extremeCases) {
        const startTime = performance.now()
        const distance = levenshtein(a, b)
        const endTime = performance.now()
        
        const duration = endTime - startTime
        
        console.log(`Stress test (${a.length} chars): ${duration.toFixed(2)}ms, distance=${distance}`)
        
        // Should complete without crashing
        expect(duration).toBeLessThan(2000) // Less than 2 seconds
        expect(distance).toBeGreaterThanOrEqual(0)
        expect(distance).toBeLessThanOrEqual(a.length + b.length)
      }
    })
  })

  describe("Memory Leak Detection", () => {
    it("should not accumulate memory over many operations", () => {
      const initialStats = getLevenshteinStats()
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const a = `test${i % 100}` // Reuse some strings to test cache
        const b = `different${i % 100}`
        levenshtein(a, b)
      }
      
      const finalStats = getLevenshteinStats()
      
      console.log(`Memory leak test:`)
      console.log(`Cache size: ${finalStats.cache.size}`)
      console.log(`Cache hit rate: ${(finalStats.cache.hitRate * 100).toFixed(1)}%`)
      console.log(`Total calculations: ${finalStats.exactCalculations + finalStats.approximateCalculations}`)
      
      // Cache should not grow beyond limits
      expect(finalStats.cache.size).toBeLessThanOrEqual(1000)
      
      // Should have reasonable hit rate due to reused strings
      expect(finalStats.cache.hitRate).toBeGreaterThan(0.1)
    })
  })
})
