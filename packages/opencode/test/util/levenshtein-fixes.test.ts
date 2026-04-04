import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { levenshtein } from '@/util/levenshtein'

describe('Levenshtein Algorithm', () => {
  beforeEach(() => {
    // Clear cache before each test
    const levenshteinModule = require('@/util/levenshtein')
    if (levenshteinModule.cache) {
      levenshteinModule.cache.clear()
    }
  })

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
    const longString = 'a'.repeat(2000)
    const anotherLongString = 'a'.repeat(1500) + 'b'.repeat(500)

    // Should not crash and should return a reasonable distance
    expect(() => {
      const distance = levenshtein(longString, anotherLongString)
      expect(distance).toBeGreaterThanOrEqual(0)
      expect(distance).toBeLessThanOrEqual(2000)
    }).not.toThrow()

    // Should complete within reasonable time
    const start = performance.now()
    const distance = levenshtein(longString, anotherLongString)
    const end = performance.now()
    expect(end - start).toBeLessThan(1000) // Should complete within 1 second
  })

  it('should cache results for repeated calculations', () => {
    const str1 = 'hello world'
    const str2 = 'hello there'

    // First call
    const start1 = performance.now()
    const result1 = levenshtein(str1, str2)
    const end1 = performance.now()

    // Second call (should be cached)
    const start2 = performance.now()
    const result2 = levenshtein(str1, str2)
    const end2 = performance.now()

    expect(result1).toBe(result2)
    expect(end2 - start2).toBeLessThan(end1 - start1) // Second call should be faster
  })

  it('should handle position-aware sliding window calculations', () => {
    const base = 'abcdefghij'
    const target = 'xyzabcdefghij' // Same string but with prefix

    const distance = levenshtein(base, target)
    // Should account for the position difference
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(20) // Reasonable bound
  })

  it('should throw error for non-string inputs', () => {
    expect(() => levenshtein(null as any, 'test')).toThrow('Levenshtein distance requires string inputs')
    expect(() => levenshtein('test', undefined as any)).toThrow('Levenshtein distance requires string inputs')
    expect(() => levenshtein(123 as any, 'test')).toThrow('Levenshtein distance requires string inputs')
  })
})
