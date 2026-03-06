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

import { beforeEach, afterEach } from "bun:test"

/**
 * Tests for Levenshtein cache memory management improvements
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  levenshtein,
  getLevenshteinStats,
  resetLevenshteinStats,
  configureLevenshteinCache,
  getLevenshteinCacheConfig
} from '../levenshtein'

describe('Levenshtein Cache Memory Management', () => {
  beforeEach(() => {
    resetLevenshteinStats()
    // Reset to small cache for testing
    configureLevenshteinCache(10, 1) // 10 entries, 1MB max
  })

  it('should respect configurable cache size', () => {
    // Fill cache beyond configured size
    for (let i = 0; i < 15; i++) {
      levenshtein(`test${i}`, `compare${i}`)
    }

    const stats = getLevenshteinStats()
    expect(stats.cache.size).toBeLessThanOrEqual(10)
  })

  it('should respect memory limits', () => {
    // Create strings that will use significant memory
    const longString = 'a'.repeat(1000)

    // Add many large entries to trigger memory-based eviction
    for (let i = 0; i < 20; i++) {
      levenshtein(`${longString}${i}`, `${longString}${i + 1}`)
    }

    const stats = getLevenshteinStats()
    expect(stats.cache.memoryUsageMB).toBeLessThanOrEqual(stats.cache.maxMemoryMB)
  })

  it('should track memory usage accurately', () => {
    const initialStats = getLevenshteinStats()
    expect(initialStats.cache.memoryUsageMB).toBe(0)

    // Add some entries with longer strings to ensure measurable memory usage
    levenshtein('short', 'test')
    levenshtein('a'.repeat(100), 'b'.repeat(100))
    levenshtein('a'.repeat(200), 'b'.repeat(200))

    const afterStats = getLevenshteinStats()
    expect(afterStats.cache.memoryUsageMB).toBeGreaterThan(0)
    expect(afterStats.cache.memoryUsageMB).toBeLessThan(1) // Should be small
  })

  it('should allow runtime configuration changes', () => {
    const initialConfig = getLevenshteinCacheConfig()
    expect(initialConfig.maxSize).toBe(10)
    expect(initialConfig.maxMemoryMB).toBe(1)

    // Update configuration
    configureLevenshteinCache(5, 0.5)

    const newConfig = getLevenshteinCacheConfig()
    expect(newConfig.maxSize).toBe(5)
    expect(newConfig.maxMemoryMB).toBe(0.5)
  })

  it('should evict entries when configuration is reduced', () => {
    // Fill cache with entries
    for (let i = 0; i < 8; i++) {
      levenshtein(`test${i}`, `compare${i}`)
    }

    const beforeStats = getLevenshteinStats()
    expect(beforeStats.cache.size).toBe(8)

    // Reduce cache size to 3
    configureLevenshteinCache(3, 1)

    const afterStats = getLevenshteinStats()
    expect(afterStats.cache.size).toBeLessThanOrEqual(3)
  })

  it('should handle environment variable configuration', () => {
    // Test that environment variables are read (if set)
    // This test verifies the code path works, actual values depend on test environment
    const config = getLevenshteinCacheConfig()
    expect(typeof config.maxSize).toBe('number')
    expect(typeof config.maxMemoryMB).toBe('number')
    expect(config.maxSize).toBeGreaterThan(0)
    expect(config.maxMemoryMB).toBeGreaterThan(0)
  })

  it('should maintain cache functionality with memory management', () => {
    // Test that caching still works correctly
    const result1 = levenshtein('hello', 'world')
    const result2 = levenshtein('hello', 'world') // Should hit cache

    expect(result1).toBe(result2)

    const stats = getLevenshteinStats()
    expect(stats.cacheHits).toBe(1)
    expect(stats.cacheMisses).toBe(1)
  })

  it('should handle memory pressure gracefully', () => {
    // Create memory pressure with moderately long strings (not too long to avoid timeout)
    const longString = 'a'.repeat(1000)

    // This should trigger memory-based eviction
    for (let i = 0; i < 20; i++) {
      levenshtein(`${longString}${i}`, `${longString}${i + 1}`)
    }

    const stats = getLevenshteinStats()
    // Cache should still be functional despite memory pressure
    expect(stats.cache.size).toBeGreaterThan(0)
    expect(stats.cache.memoryUsageMB).toBeLessThanOrEqual(stats.cache.maxMemoryMB)
  })

  it('should provide detailed memory statistics', () => {
    // Add some entries
    levenshtein('test1', 'test2')
    levenshtein('a'.repeat(500), 'b'.repeat(500))

    const stats = getLevenshteinStats()
    const cacheStats = stats.cache

    expect(cacheStats).toHaveProperty('memoryUsageMB')
    expect(cacheStats).toHaveProperty('maxMemoryMB')
    expect(cacheStats).toHaveProperty('maxSize')
    expect(typeof cacheStats.memoryUsageMB).toBe('number')
    expect(typeof cacheStats.maxMemoryMB).toBe('number')
    expect(typeof cacheStats.maxSize).toBe('number')
  })

  it('should clear memory tracking on reset', () => {
    // Add entries with longer strings to ensure measurable memory
    levenshtein('test1', 'test2')
    levenshtein('a'.repeat(100), 'b'.repeat(100))
    levenshtein('a'.repeat(200), 'b'.repeat(200))

    const beforeReset = getLevenshteinStats()
    expect(beforeReset.cache.memoryUsageMB).toBeGreaterThan(0)

    resetLevenshteinStats()

    const afterReset = getLevenshteinStats()
    expect(afterReset.cache.memoryUsageMB).toBe(0)
    expect(afterReset.cache.size).toBe(0)
  })
})
