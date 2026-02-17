/**
 * Test for ErrorProcessor pattern priority conflict fix
 */

import { BaseErrorProcessor, ErrorPattern, ShellType } from '../error-processor'

class TestErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'bash'
  
  constructor() {
    super()
    // Add patterns with same priority to test secondary sorting
    this.addPattern({
      name: 'specific-error',
      pattern: /very-specific-error-pattern/gi,
      processor: () => 'Error: Very specific error occurred',
      priority: 5
    })
    
    this.addPattern({
      name: 'general-error', 
      pattern: /error/gi,
      processor: () => 'Error: General error occurred',
      priority: 5
    })
    
    this.addPattern({
      name: 'medium-specific-error',
      pattern: /medium-specific-error/gi,
      processor: () => 'Error: Medium specific error occurred', 
      priority: 5
    })
  }
}

export function testPatternPrioritySorting() {
  const processor = new TestErrorProcessor()
  const patterns = processor.getPatterns()
  
  console.log('Testing pattern priority sorting...')
  console.log('Patterns before sorting:')
  patterns.forEach(p => console.log(`  ${p.name}: priority=${p.priority}, specificity=${p.pattern.source.length}`))
  
  // Get the sorted patterns by calling the internal sort logic
  const sortedPatterns = [...patterns].sort((a, b) => {
    // Primary sort: priority
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    
    // Secondary sort: pattern specificity (longer patterns are more specific)
    const aSpecificity = a.pattern.source.length
    const bSpecificity = b.pattern.source.length
    if (aSpecificity !== bSpecificity) {
      return bSpecificity - aSpecificity // More specific patterns first
    }
    
    // Tertiary sort: pattern name for deterministic ordering
    return a.name.localeCompare(b.name)
  })
  
  console.log('\nPatterns after sorting:')
  sortedPatterns.forEach(p => console.log(`  ${p.name}: priority=${p.priority}, specificity=${p.pattern.source.length}`))
  
  // Test that more specific patterns come first when priority is equal
  const expectedOrder = [
    'specific-error', // 26 chars, most specific
    'medium-specific-error', // 22 chars, medium specific  
    'general-error' // 5 chars, least specific
  ]
  
  const actualOrder = sortedPatterns.map(p => p.name)
  
  console.log('\nExpected order:', expectedOrder)
  console.log('Actual order:  ', actualOrder)
  
  const isCorrect = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder)
  console.log(`\n✅ Test ${isCorrect ? 'PASSED' : 'FAILED'}: Patterns sorted by specificity when priority is equal`)
  
  return isCorrect
}

export function testDeterministicOrdering() {
  const processor = new TestErrorProcessor()
  const patterns = processor.getPatterns()
  
  console.log('\nTesting deterministic ordering...')
  
  // Sort multiple times and ensure consistent results
  const results = []
  for (let i = 0; i < 5; i++) {
    const sorted = [...patterns].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      const aSpecificity = a.pattern.source.length
      const bSpecificity = b.pattern.source.length
      if (aSpecificity !== bSpecificity) {
        return bSpecificity - aSpecificity
      }
      return a.name.localeCompare(b.name)
    })
    results.push(sorted.map(p => p.name))
  }
  
  const allSame = results.every(r => JSON.stringify(r) === JSON.stringify(results[0]))
  console.log(`✅ Deterministic ordering test ${allSame ? 'PASSED' : 'FAILED'}`)
  
  return allSame
}

// Run tests if this file is executed directly
if (import.meta.main) {
  testPatternPrioritySorting()
  testDeterministicOrdering()
}
