/**
 * Test suite to ensure logo consistency across all usages
 * Validates that shared logo matches expected patterns and imports work correctly
 */

import { describe, it, expect, beforeEach } from 'bun:test'

// Test the shared logo export
import { burgercodeLogo, marks, type BurgercodeLogo } from '@opencode-ai/shared/logo'

// Test constants for better maintainability
const MAX_LINE_LENGTH = 200
const MAX_MARKS_LENGTH = 10
const PERFORMANCE_TEST_ITERATIONS = 100
const PERFORMANCE_MAX_DURATION_MS = 100
const MEMORY_LEAK_TEST_ITERATIONS = 1000
const MEMORY_LEAK_MAX_INCREASE_BYTES = 1024 * 1024 // 1MB

describe('Logo Consistency Tests', () => {
  let sharedLogo: BurgercodeLogo

  beforeEach(() => {
    sharedLogo = burgercodeLogo
  })

  describe('Shared Logo Structure', () => {
    it('should have correct structure with left and right arrays', () => {
      expect(sharedLogo).toBeDefined()
      expect(sharedLogo.left).toBeInstanceOf(Array)
      expect(sharedLogo.right).toBeInstanceOf(Array)
    })

    it('should have non-empty left and right arrays', () => {
      expect(sharedLogo.left.length).toBeGreaterThan(0)
      expect(sharedLogo.right.length).toBeGreaterThan(0)
    })

    it('should export marks constant', () => {
      expect(marks).toBeDefined()
      expect(typeof marks).toBe('string')
    })
  })

  describe('Logo Content Validation', () => {
    it('should have expected left logo content', () => {
      // Check for key patterns in left logo
      const leftContent = sharedLogo.left.join('\n')
      expect(leftContent).toContain('___')
      expect(leftContent).toContain('/__\\')
      expect(leftContent).toContain('/  /::\\')
    })

    it('should have expected right logo content', () => {
      // Check for key patterns in right logo
      const rightContent = sharedLogo.right.join('\n')
      expect(rightContent).toContain('▄')
      expect(rightContent).toContain('/  /:/~/::\\')
      expect(rightContent).toContain('/__/:/ \\__\\:|')
    })

    it('should have equal line counts for proper display alignment', () => {
      expect(sharedLogo.left.length).toBe(sharedLogo.right.length)
    })
  })

  describe('Import Validation', () => {
    it('should be able to import logo from shared package', async () => {
      expect(async () => {
        await import('@opencode-ai/shared/logo')
      }).not.toThrow()
    })

    it('should have correct TypeScript types', () => {
      // Test that the type is properly exported
      const testLogo: BurgercodeLogo = {
        left: ['test'],
        right: ['test']
      }
      expect(testLogo.left).toBeInstanceOf(Array)
      expect(testLogo.right).toBeInstanceOf(Array)
    })
  })

  describe('Content Safety', () => {
    it('should not contain dangerous patterns', () => {
      const allContent = [...sharedLogo.left, ...sharedLogo.right].join('\n')

      // Check for potentially dangerous content
      expect(allContent).not.toContain('<script')
      expect(allContent).not.toContain('javascript:')
      expect(allContent).not.toContain('vbscript:')
    })

    it('should not have excessively long lines', () => {
      // Check for reasonable line lengths to prevent UI issues
      sharedLogo.left.forEach(line => {
        expect(line.length).toBeLessThan(MAX_LINE_LENGTH)
      })
      sharedLogo.right.forEach(line => {
        expect(line.length).toBeLessThan(MAX_LINE_LENGTH)
      })
    })
  })

  describe('Marks Constant', () => {
    it('should have expected marks value', () => {
      expect(marks).toBe('_^~')
    })

    it('should be a string of reasonable length', () => {
      expect(typeof marks).toBe('string')
      expect(marks.length).toBeGreaterThan(0)
      expect(marks.length).toBeLessThan(MAX_MARKS_LENGTH)
    })
  })
})

describe('Logo Integration Tests', () => {
  it('should work with desktop loading component import', async () => {
    try {
      // Test that the import path works as expected in desktop context
      const desktopModule = await import('../../shared/logo')
      expect(desktopModule.burgercodeLogo).toBeDefined()
      expect(desktopModule.marks).toBeDefined()
    } catch (error) {
      throw new Error(`Desktop logo import failed: ${error}`)
    }
  })

  it('should work with CLI component import', async () => {
    try {
      // Test that the import path works as expected in CLI context
      const cliModule = await import('@opencode-ai/shared/logo')
      expect(cliModule.burgercodeLogo).toBeDefined()
      expect(cliModule.marks).toBeDefined()
    } catch (error) {
      throw new Error(`CLI logo import failed: ${error}`)
    }
  })
})

describe('Logo Performance Tests', () => {
  it('should load quickly without performance issues', async () => {
    const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

    // Multiple imports to test caching
    for (let i = 0; i < PERFORMANCE_TEST_ITERATIONS; i++) {
      const logo = await import('@opencode-ai/shared/logo')
      expect(logo.burgercodeLogo).toBeDefined()
    }

    const endTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    const duration = endTime - startTime

    // Should complete 100 imports in less than 100ms
    expect(duration).toBeLessThan(PERFORMANCE_MAX_DURATION_MS)
  })

  it('should not cause memory leaks with repeated imports', async () => {
    // Skip this test if memory monitoring is not available
    if (typeof process === 'undefined' || !process.memoryUsage) {
      console.warn('Memory leak test skipped: process.memoryUsage not available')
      return
    }

    const initialMemory = process.memoryUsage().heapUsed

    // Import logo multiple times to test for memory leaks
    for (let i = 0; i < MEMORY_LEAK_TEST_ITERATIONS; i++) {
      await import('@opencode-ai/shared/logo')
      // Small delay to allow garbage collection if available
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    // Attempt to trigger garbage collection if available (development only)
    if (typeof globalThis !== 'undefined' && 'gc' in globalThis && typeof (globalThis as any).gc === 'function') {
      try {
        ; (globalThis as any).gc()
        // Wait a bit after GC
        await new Promise(resolve => setTimeout(resolve, 10))
      } catch (error) {
        // GC failed, continue with test
        console.warn('Garbage collection not available or failed')
      }
    }

    const finalMemory = process.memoryUsage().heapUsed
    const memoryIncrease = finalMemory - initialMemory

    // Memory increase should be minimal (< 1MB)
    // Allow for some variance in memory usage
    expect(memoryIncrease).toBeLessThan(MEMORY_LEAK_MAX_INCREASE_BYTES)
  })
})
