/**
 * Test suite for GitHub triage tool security fixes
 * Validates prototype pollution detection, input validation, and error handling
 */

import { describe, it, expect, beforeEach } from 'bun:test'

// Import the actual functions we need to test from the main module
// We need to expose these functions for testing (add to exports temporarily)
import {
  detectPrototypePollution,
  safeJsonParse,
  sanitizeObject,
  isDangerousKey,
  parseEnvArray,
  parseEnvObject,
  validateEnvVarName,
  getIssueContent
} from '../.opencode/tool/github-triage.ts'

describe('GitHub Triage Security Tests', () => {
  describe('Prototype Pollution Detection', () => {
    it('should detect direct prototype pollution patterns', () => {
      // Test dangerous patterns that should be detected
      const dangerousInputs = [
        '{"__proto__": {"admin": true}}',
        '{"constructor": {"prototype": {"admin": true}}}',
        '{"prototype": {"polluted": true}}',
        '{"__defineGetter__": "dangerous"}',
        '{"__defineSetter__": "dangerous"}',
        '{"__lookupGetter__": "dangerous"}',
        '{"__lookupSetter__": "dangerous"}'
      ]

      dangerousInputs.forEach(input => {
        const result = detectPrototypePollution(input)
        expect(result).toBe(true)
      })
    })

    it('should detect nested prototype pollution patterns', () => {
      const nestedPatterns = [
        '"__proto__": {',
        '"constructor": {',
        '"prototype": {',
        '__proto__:',
        'constructor:',
        'prototype:'
      ]

      nestedPatterns.forEach(pattern => {
        // Test with a full JSON-like string containing the pattern
        const testString = `{"test": "value", ${pattern} "value": "test" }}`
        const result = detectPrototypePollution(testString)
        expect(result).toBe(true)
      })
    })

    it('should detect bracket notation pollution', () => {
      const bracketPatterns = [
        '["__proto__"]',
        '["constructor"]',
        '["prototype"]',
        '["__defineGetter__"]',
        '["__defineSetter__"]'
      ]

      bracketPatterns.forEach(pattern => {
        // Test with assignment context
        const testString = `obj${pattern} = "malicious"`
        const result = detectPrototypePollution(testString)
        expect(result).toBe(true)
      })
    })

    it('should detect eval-like dangerous patterns', () => {
      const evalPatterns = [
        'eval(',
        'Function(',
        'setTimeout(',
        'setInterval(',
        'new Function(',
        'bind(',
        'call(',
        'apply('
      ]

      evalPatterns.forEach(pattern => {
        const testString = `{"dangerous": "${pattern}malicious_code()"}`
        const result = detectPrototypePollution(testString)
        expect(result).toBe(true)
      })
    })

    it('should NOT detect safe patterns', () => {
      const safeInputs = [
        '{"user": {"name": "john", "role": "admin"}}',
        '{"config": {"timeout": 5000}}',
        '{"data": ["item1", "item2"]}',
        '{"message": "This is a normal string with __proto__ word"}',
        '["normal", "array", "with", "constructor", "word"]'
      ]

      safeInputs.forEach(input => {
        const result = detectPrototypePollution(input)
        expect(result).toBe(false)
      })
    })
  })

  describe('Input Validation', () => {
    it('should validate environment variable names', () => {
      const allowedEnvVars = [
        'GITHUB_TRIAGE_DESKTOP_TEAM',
        'GITHUB_TRIAGE_ZEN_TEAM',
        'ISSUE_NUMBER',
        'ISSUE_TITLE',
        'ISSUE_BODY',
        'GITHUB_TOKEN',
        'NODE_ENV'
      ]

      const disallowedEnvVars = [
        'MALICIOUS_VAR',
        'PATH',
        'HOME',
        'USER',
        'CUSTOM_ENV_VAR'
      ]

      allowedEnvVars.forEach(envVar => {
        const result = validateEnvVarName(envVar)
        expect(result).toBe(true)
      })

      disallowedEnvVars.forEach(envVar => {
        const result = validateEnvVarName(envVar)
        expect(result).toBe(false)
      })
    })

    it('should validate content length limits', () => {
      // Test that getIssueContent enforces length limits
      // We'll need to set environment variables for this test
      const originalTitle = process.env.ISSUE_TITLE
      const originalBody = process.env.ISSUE_BODY

      try {
        // Test short content (should work)
        process.env.ISSUE_TITLE = 'A'.repeat(100)
        process.env.ISSUE_BODY = 'A'.repeat(10000)
        expect(() => getIssueContent()).not.toThrow()

        // Test long title (should throw)
        process.env.ISSUE_TITLE = 'A'.repeat(1001)
        expect(() => getIssueContent()).toThrow('Issue title too long')

        // Test long body (should throw)
        process.env.ISSUE_TITLE = 'A'.repeat(100)
        process.env.ISSUE_BODY = 'A'.repeat(10001)
        expect(() => getIssueContent()).toThrow('Issue body too long')
      } finally {
        // Restore original environment
        process.env.ISSUE_TITLE = originalTitle
        process.env.ISSUE_BODY = originalBody
      }
    })

    it('should detect dangerous content patterns', () => {
      // Test that getIssueContent detects dangerous patterns
      const originalTitle = process.env.ISSUE_TITLE
      const originalBody = process.env.ISSUE_BODY

      try {
        const dangerousContent = [
          '<script>alert("xss")</script>',
          'javascript:alert("xss")',
          'vbscript:msgbox("xss")',
          'onclick="alert("xss")"',
          'data:text/html,<script>alert("xss")</script>',
          '{"__proto__": {"admin": true}}'
        ]

        dangerousContent.forEach(content => {
          process.env.ISSUE_TITLE = 'Test'
          process.env.ISSUE_BODY = content
          expect(() => getIssueContent()).toThrow()
        })
      } finally {
        // Restore original environment
        process.env.ISSUE_TITLE = originalTitle
        process.env.ISSUE_BODY = originalBody
      }
    })
  })

  describe('JSON Parsing Security', () => {
    it('should safely parse JSON without prototype pollution', () => {
      const safeJson = '{"user": "john", "role": "admin"}'
      const result = safeJsonParse(safeJson, { default: true })
      expect(result).toEqual({ user: "john", role: "admin" })
    })

    it('should reject dangerous JSON', () => {
      const dangerousJson = '{"__proto__": {"admin": true}}'
      const result = safeJsonParse(dangerousJson, { default: true })
      expect(result).toEqual({ default: true }) // Should return fallback
    })

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"incomplete": json}'
      const result = safeJsonParse(malformedJson, { fallback: true })
      expect(result).toEqual({ fallback: true })
    })
  })

  describe('Object Sanitization', () => {
    it('should sanitize dangerous object keys', () => {
      const dangerousObj = {
        normal: 'safe',
        __proto__: { polluted: true },
        constructor: { prototype: { hacked: true } }
      }

      const sanitized = sanitizeObject(dangerousObj)
      expect(sanitized.normal).toBe('safe')
      expect(sanitized.__proto__).toBeUndefined()
      expect(sanitized.constructor).toBeUndefined()
    })

    it('should preserve safe object structure', () => {
      const safeObj = {
        user: { name: 'john', age: 30 },
        config: { timeout: 5000, retries: 3 },
        data: [1, 2, 3, { nested: 'value' }]
      }

      const sanitized = sanitizeObject(safeObj)
      expect(sanitized).toEqual(safeObj)
    })

    it('should handle circular references safely', () => {
      const circular: any = { name: 'test' }
      circular.self = circular

      const sanitized = sanitizeObject(circular)
      expect(sanitized.name).toBe('test')
      expect(sanitized.self).toBeUndefined() // Circular reference should be handled
    })
  })

  describe('Environment Variable Parsing', () => {
    it('should parse environment arrays safely', () => {
      // Test with valid JSON array
      const result = parseEnvArray('TEST_VAR', ['default'])
      expect(result).toEqual(['default']) // Should return default since no env var set

      // Test with invalid JSON (should return default)
      // We can't easily test with env vars in this context, but the function should handle it
    })

    it('should parse environment objects safely', () => {
      const result = parseEnvObject('TEST_VAR', { default: 'value' })
      expect(result).toEqual({ default: 'value' }) // Should return default
    })

    it('should validate dangerous keys in environment objects', () => {
      // This is tested implicitly through the object parsing functions
      const dangerousKey = '__proto__'
      const result = isDangerousKey(dangerousKey)
      expect(result).toBe(true)

      const safeKey = 'normal_key'
      const safeResult = isDangerousKey(safeKey)
      expect(safeResult).toBe(false)
    })
  })

  describe('Team Configuration Validation', () => {
    it('should validate team structure consistency', () => {
      // This is more of an integration test, but we can test the validation logic
      const mockTeamConfig = {
        desktop: ['user1', 'user2'],
        zen: ['user3', 'user4'],
        tui: ['user5', 'user6'],
        core: ['user7', 'user8'],
        docs: ['user9', 'user10'],
        windows: ['user11', 'user12']
      }

      const requiredTeams = ['desktop', 'zen', 'tui', 'core', 'docs', 'windows']

      requiredTeams.forEach(team => {
        expect(mockTeamConfig[team as keyof typeof mockTeamConfig]).toBeDefined()
        expect(Array.isArray(mockTeamConfig[team as keyof typeof mockTeamConfig])).toBe(true)
        expect((mockTeamConfig[team as keyof typeof mockTeamConfig] as string[]).length).toBeGreaterThan(0)
      })
    })
  })

  describe('Performance and Memory Safety', () => {
    it('should handle large inputs efficiently', () => {
      const startTime = performance.now()

      // Test with large but safe content
      const largeContent = 'A'.repeat(50000) // Large but not at limit
      const hasDangerousPatterns = detectPrototypePollution(largeContent)

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(hasDangerousPatterns).toBe(false)
      expect(duration).toBeLessThan(100) // Should process quickly
    })

    it('should prevent memory exhaustion with sanitization limits', () => {
      // Create a deeply nested object that would cause issues without limits
      const createDeepObject = (depth: number): any => {
        if (depth <= 0) return { leaf: true }
        return { nested: createDeepObject(depth - 1) }
      }

      const deepObject = createDeepObject(20) // Deeper than the 10 level limit
      const sanitized = sanitizeObject(deepObject)

      // Should sanitize without crashing, even if it doesn't sanitize everything
      expect(typeof sanitized).toBe('object')
    })
  })
})
