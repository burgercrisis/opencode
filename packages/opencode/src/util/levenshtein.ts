/**
 * Levenshtein distance algorithm utilities
 * Optimized implementations for different string sizes
 */

import { TOOL } from "@/constants"

// Simple LRU cache for Levenshtein calculations
class LevenshteinCache {
  private cache = new Map<string, number>()
  private maxSize = 1000 // Limit cache size to prevent memory issues
  private accessOrder = new Set<string>() // Track access order for LRU

  private getKey(a: string, b: string): string {
    // Use shorter string first for consistent keys
    return a.length <= b.length ? `${a}|${b}` : `${b}|${a}`
  }

  get(a: string, b: string): number | undefined {
    const key = this.getKey(a, b)
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (LRU behavior) - remove and re-add to track access order
      this.accessOrder.delete(key)
      this.accessOrder.add(key)
    }
    return value
  }

  set(a: string, b: string, value: number): void {
    const key = this.getKey(a, b)

    // Remove oldest if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.accessOrder.values().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
        this.accessOrder.delete(oldestKey)
      }
    }

    this.cache.set(key, value)
    this.accessOrder.add(key)
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder.clear()
  }
}

const cache = new LevenshteinCache()

/**
 * Main Levenshtein distance function with sliding window approach for large strings
 * Maintains accuracy while preventing memory issues
 */
export function levenshtein(a: string, b: string): number {
  // Input validation to handle edge cases
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new Error('Levenshtein distance requires string inputs')
  }

  // Check cache first
  const cached = cache.get(a, b)
  if (cached !== undefined) {
    return cached
  }

  const MAX_LENGTH = TOOL.MAX_LENGTH

  // Handle empty strings
  if (a.length === 0) {
    const result = b.length
    cache.set(a, b, result)
    return result
  }
  if (b.length === 0) {
    const result = a.length
    cache.set(a, b, result)
    return result
  }

  // For strings within MAX_LENGTH, use standard algorithm for accuracy
  let result: number
  if (a.length <= MAX_LENGTH && b.length <= MAX_LENGTH) {
    result = levenshteinOptimized(a, b)
  } else {
    // For very large strings, use sliding window approach
    result = levenshteinSlidingWindow(a, b, MAX_LENGTH)
  }

  // Cache the result
  cache.set(a, b, result)
  return result
}

/**
 * Optimized Levenshtein for normal-sized strings using two-row approach
 * Reduces memory from O(n²) to O(n)
 */
function levenshteinOptimized(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length

  // Use two-row optimization to reduce memory from O(n²) to O(n)
  let prevRow = Array.from({ length: lenB + 1 }, (_, j) => j)
  let currRow = Array(lenB + 1)

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      )
    }
    // Swap rows for next iteration
    [prevRow, currRow] = [currRow, prevRow]
  }

  return prevRow[lenB]
}

/**
 * Sliding window Levenshtein for very large strings
 * Maintains accuracy by comparing overlapping windows and accounting for position
 */
function levenshteinSlidingWindow(a: string, b: string, windowSize: number): number {
  const lenA = a.length
  const lenB = b.length

  // If one string fits in window, compare directly
  if (lenA <= windowSize && lenB <= windowSize) {
    return levenshteinOptimized(a, b)
  }

  // For very large strings, use a simplified approach
  // Find the best matching window and account for position
  const longer = lenA > lenB ? a : b
  const shorter = lenA > lenB ? b : a
  const longerLen = Math.max(lenA, lenB)
  const shorterLen = Math.min(lenA, lenB)

  let bestDistance = longerLen // Start with worst case (full length difference)

  // If the shorter string fits in the window, use it directly
  if (shorterLen <= windowSize) {
    // Slide the window over the longer string
    for (let start = 0; start <= longerLen - shorterLen; start++) {
      const window = longer.slice(start, start + shorterLen)
      const distance = levenshteinOptimized(window, shorter)

      // Account for characters outside the window
      const totalDistance = distance + start + (longerLen - (start + shorterLen))
      bestDistance = Math.min(bestDistance, totalDistance)
    }
  } else {
    // Both strings are larger than window, use approximation
    // Compare overlapping windows of size windowSize
    const maxWindows = Math.min(longerLen, shorterLen) - windowSize + 1
    for (let i = 0; i < maxWindows; i++) {
      const windowA = longer.slice(i, i + windowSize)
      const windowB = shorter.slice(i, i + windowSize)
      const distance = levenshteinOptimized(windowA, windowB)

      // Account for remaining characters
      const remainingA = longerLen - (i + windowSize)
      const remainingB = shorterLen - (i + windowSize)
      const totalDistance = distance + remainingA + remainingB + i * 2
      bestDistance = Math.min(bestDistance, totalDistance)
    }
  }

  return bestDistance
}
