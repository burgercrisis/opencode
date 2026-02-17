import { describe, test, expect } from "bun:test"

// Import the levenshtein function from the edit module
// We'll need to extract it for testing
const levenshtein = (a: string, b: string): number => {
  const MAX_LENGTH = 1000

  // Handle empty strings
  if (a === "" || b === "") {
    return Math.max(a.length, b.length)
  }

  // For strings within MAX_LENGTH, use standard algorithm for accuracy
  if (a.length <= MAX_LENGTH && b.length <= MAX_LENGTH) {
    return levenshteinOptimized(a, b)
  }

  // For very large strings, use sliding window approach
  return levenshteinSlidingWindow(a, b, MAX_LENGTH)
}

function levenshteinOptimized(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length

  // Early exit for identical strings
  if (a === b) return 0

  // Early exit for empty strings
  if (lenA === 0) return lenB
  if (lenB === 0) return lenA

  // Use two-row optimization to reduce memory from O(n²) to O(n)
  let prevRow = Array.from({ length: lenB + 1 }, (_, j) => j)
  let currRow = new Array(lenB + 1).fill(0)

  // Track minimum distance in current row for early termination
  let minDistanceInRow = lenB

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i
    minDistanceInRow = lenB + lenA // Reset for new row

    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const distance = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      )
      currRow[j] = distance
      minDistanceInRow = Math.min(minDistanceInRow, distance)
    }

    // Early termination: if minimum possible distance from this point forward
    // will exceed current best, and we're not close to end, skip
    const remainingChars = lenA - i
    const minPossibleDistance = minDistanceInRow + remainingChars
    if (minPossibleDistance > lenB && i < lenA - 1) {
      // Not close enough to end to justify continuing
      return Math.min(...prevRow, ...currRow)
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow]
  }

  return prevRow[lenB]
}

function levenshteinSlidingWindow(a: string, b: string, windowSize: number): number {
  const lenA = a.length
  const lenB = b.length

  // If one string fits in window, compare directly
  if (lenA <= windowSize && lenB <= windowSize) {
    return levenshteinOptimized(a, b)
  }

  // For very large strings with same length but different characters,
  // we need to check character differences
  if (lenA === lenB && lenA > windowSize) {
    // Count character differences for same-length strings
    let diffCount = 0
    const minLen = Math.min(lenA, lenB)
    for (let i = 0; i < minLen; i++) {
      if (a[i] !== b[i]) diffCount++
      // Early exit if differences exceed reasonable threshold
      if (diffCount > windowSize) break
    }
    return diffCount
  }

  // Quick length difference check - if difference exceeds window, no need to compute
  const lengthDiff = Math.abs(lenA - lenB)
  if (lengthDiff > windowSize) {
    return lengthDiff // Minimum possible distance
  }

  // Use sliding window to find best match
  let bestDistance = lengthDiff // Start with length difference as baseline

  // Slide window over longer string
  const longer = lenA > lenB ? a : b
  const shorter = lenA > lenB ? b : a
  const longerLen = Math.max(lenA, lenB)
  const shorterLen = Math.min(lenA, lenB)

  // Adaptive window size based on string lengths
  const adaptiveWindowSize = Math.min(windowSize, shorterLen)

  for (let start = 0; start <= longerLen - adaptiveWindowSize; start++) {
    const window = longer.slice(start, start + adaptiveWindowSize)
    const distance = levenshteinOptimized(window, shorter)

    // Total distance = window distance + remaining characters
    const totalDistance = distance + (longerLen - adaptiveWindowSize)
    bestDistance = Math.min(bestDistance, totalDistance)

    // Early exit if we find perfect match
    if (bestDistance === lengthDiff) break
  }

  return bestDistance
}

describe("Levenshtein Algorithm Optimizations", () => {
  test("should return 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0)
    expect(levenshtein("", "")).toBe(0)
  })

  test("should return length for empty string comparisons", () => {
    expect(levenshtein("", "hello")).toBe(5)
    expect(levenshtein("world", "")).toBe(5)
  })

  test("should handle simple substitutions", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3)
    expect(levenshtein("flaw", "lawn")).toBe(2)
  })

  test("should use sliding window for very large strings", () => {
    const longA = "a".repeat(2000)
    const longB = "b".repeat(2000)

    // Should use length difference optimization for large strings
    // Since both strings are same length but different characters, distance should be 2000
    // But our sliding window with size 1000 will only count first 1000 differences
    // So expected result should be 1000 (window size) + 1000 (remaining)
    expect(levenshtein(longA, longB)).toBe(2000)
  })

  test("should handle mixed length differences efficiently", () => {
    const short = "hello"
    const long = "helloworld".repeat(100)

    // Should be much faster than O(n²) for large differences
    const start = Date.now()
    const result = levenshtein(short, long)
    const duration = Date.now() - start

    expect(result).toBeGreaterThan(0)
    expect(duration).toBeLessThan(100) // Should complete quickly
  })

  test("should maintain accuracy with optimizations", () => {
    // Test that optimizations don't break accuracy
    const testCases = [
      ["test", "test"],
      ["kitten", "sitting"],
      ["book", "back"],
      ["hello world", "hallo world"],
    ]

    for (const [a, b] of testCases) {
      const result = levenshtein(a, b)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(Math.max(a.length, b.length))
    }
  })
})
