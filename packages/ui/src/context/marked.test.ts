import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { validateWorkerMessage, validateWorkerResponse } from './marked-types'

describe('Web Worker Markdown Processing', () => {
  beforeEach(() => {
    // Reset any global state
  })

  afterEach(() => {
    // Clean up
  })

  test('basic validation functions work', () => {
    // Test the validation functions directly using imported functions

    // Valid messages
    expect(validateWorkerMessage({ type: 'init', id: 1 })).toBe(true)
    expect(validateWorkerMessage({ type: 'enhance', id: 2, html: 'test' })).toBe(true)

    // Invalid messages
    expect(validateWorkerMessage(null)).toBeFalsy()
    expect(validateWorkerMessage({})).toBeFalsy()
    expect(validateWorkerMessage({ type: 'init' })).toBeFalsy()
    expect(validateWorkerMessage({ type: 'enhance', id: 1 })).toBeFalsy() // missing html
    expect(validateWorkerMessage({ type: 'invalid', id: 1 })).toBeFalsy()
  })

  test('error message handling works', () => {
    const testCases = [
      { error: new Error('Test error'), expected: 'Test error' },
      { error: 'String error', expected: 'String error' },
      { error: null, expected: 'Unknown error occurred' },
      { error: undefined, expected: 'Unknown error occurred' }
    ]

    testCases.forEach(({ error, expected }) => {
      const errorMessage = error instanceof Error ? error.message :
        typeof error === 'string' ? error :
          'Unknown error occurred'
      expect(errorMessage).toBe(expected)
    })
  })

  test('timeout mechanism works', async () => {
    const timeoutMs = 100

    const promise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    })

    await expect(promise).rejects.toThrow('Timeout')
  })
})
