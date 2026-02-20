import { describe, it, expect } from 'bun:test'

// Import the functions we need to test
// Note: We need to extract these functions for testing or create a test module

// Mock the functions for testing since they're not exported
const DANGEROUS_PATTERNS = [
  '__proto__', 'constructor', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'toString', 'valueOf',
  // Additional dangerous patterns for nested pollution
  '__proto__', 'constructor.prototype', '__proto__.__proto__',
  'constructor.constructor', 'prototype.constructor'
]

function escapeRegexPattern(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectPrototypePollution(jsonString: string): boolean {
  // Check for direct dangerous patterns
  const dangerousPatterns = DANGEROUS_PATTERNS.map(escapeRegexPattern).join('|')
  const directPattern = new RegExp(`\\b(?:${dangerousPatterns})\\b`, 'i')

  // Check for nested object pollution patterns
  const nestedPatterns = [
    /"__proto__"\s*:/i,
    /"constructor"\s*:\s*\{/i,
    /"prototype"\s*:/i,
    /__proto__\s*:/i,
    /constructor\s*:/i,
    /prototype\s*:/i
  ]

  // Check for bracket notation pollution
  const bracketPatterns = [
    /\[\s*["']__proto__["']\s*\]/i,
    /\[\s*["']constructor["']\s*\]/i,
    /\[\s*["']prototype["']\s*\]/i
  ]

  // Check for eval-like patterns that could lead to pollution
  const evalPatterns = [
    /eval\s*\(/i,
    /Function\s*\(/i,
    /setTimeout\s*\(/i,
    /setInterval\s*\(/
  ]

  // Test all patterns
  if (directPattern.test(jsonString)) {
    console.warn('Direct prototype pollution pattern detected')
    return true
  }

  for (const pattern of nestedPatterns) {
    if (pattern.test(jsonString)) {
      console.warn('Nested prototype pollution pattern detected')
      return true
    }
  }

  for (const pattern of bracketPatterns) {
    if (pattern.test(jsonString)) {
      console.warn('Bracket notation pollution pattern detected')
      return true
    }
  }

  for (const pattern of evalPatterns) {
    if (pattern.test(jsonString)) {
      console.warn('Potentially dangerous eval pattern detected')
      return true
    }
  }

  return false
}

function sanitizeObject(obj: any, depth = 0, seen = new WeakSet()): any {
  // Prevent infinite recursion and circular references
  if (depth > 10 || seen.has(obj)) {
    return obj
  }

  // Add to seen set for circular reference detection
  if (typeof obj === 'object' && obj !== null) {
    seen.add(obj)
  }

  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, seen))
  }

  // Create a clean object without prototype chain
  const clean: Record<string, any> = Object.create(null)

  for (const key of Object.keys(obj)) {
    // Skip dangerous keys with comprehensive checking
    if (DANGEROUS_PATTERNS.includes(key) ||
      key.includes('__proto__') ||
      key.includes('constructor') ||
      key.includes('prototype')) {
      console.warn(`Skipping dangerous key during sanitization: ${key}`)
      continue
    }

    // Recursively sanitize nested objects
    try {
      clean[key] = sanitizeObject(obj[key], depth + 1, seen)
    } catch (error) {
      console.warn(`Failed to sanitize key '${key}', skipping: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
  }

  return clean
}

function safeJsonParse(jsonString: string, fallback: any): any {
  if (typeof jsonString !== 'string') return fallback

  // Multiple layers of protection against prototype pollution
  try {
    // First, comprehensive pattern detection
    if (detectPrototypePollution(jsonString)) {
      console.warn('Environment variable contains potentially dangerous prototype pollution pattern')
      return fallback
    }

    // Parse the JSON
    const parsed = JSON.parse(jsonString)

    // Deep sanitize the parsed object to remove any dangerous properties
    return sanitizeObject(parsed)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Failed to parse JSON from environment variable: ${error instanceof Error ? error.message : String(error)}`)
    }
    return fallback
  }
}

describe('Prototype Pollution Protection', () => {
  describe('Regex Escaping', () => {
    it('should properly escape all special regex characters', () => {
      const testPatterns = [
        '__proto__',
        'constructor.prototype',
        '__proto__.__proto__',
        'test+pattern',
        'test?pattern',
        'test*pattern',
        'test^pattern',
        'test$pattern',
        'test{pattern}',
        'test}pattern',
        'test[pattern]',
        'test\\pattern',
        'test|pattern',
        'test(pattern)',
        'test.pattern'
      ]

      for (const pattern of testPatterns) {
        const escaped = escapeRegexPattern(pattern)
        // Ensure escaped pattern has proper escaping
        if (pattern.includes('+')) expect(escaped).toContain('\\+')
        if (pattern.includes('?')) expect(escaped).toContain('\\?')
        if (pattern.includes('*')) expect(escaped).toContain('\\*')
        if (pattern.includes('^')) expect(escaped).toContain('\\^')
        if (pattern.includes('$')) expect(escaped).toContain('\\$')
        if (pattern.includes('{')) expect(escaped).toContain('\\{')
        if (pattern.includes('}')) expect(escaped).toContain('\\}')
        if (pattern.includes('[')) expect(escaped).toContain('\\[')
        if (pattern.includes(']')) expect(escaped).toContain('\\]')
        if (pattern.includes('|')) expect(escaped).toContain('\\|')
        if (pattern.includes('(')) expect(escaped).toContain('\\(')
        if (pattern.includes(')')) expect(escaped).toContain('\\)')
        // Backslashes should be escaped (doubled)
        if (pattern.includes('\\')) {
          expect(escaped).toMatch(/\\\\/)
        }
      }
    })
  })

  describe('Prototype Pollution Detection', () => {
    it('should detect direct __proto__ pollution attempts', () => {
      const maliciousInputs = [
        '{"__proto__": {"admin": true}}',
        '{"data": {"__proto__": {"isAdmin": true}}}',
        '{"__proto__": null}',
        '{"constructor": {"prototype": {"admin": true}}}'
      ]

      for (const input of maliciousInputs) {
        expect(detectPrototypePollution(input)).toBe(true)
      }
    })

    it('should detect nested object pollution patterns', () => {
      const nestedInputs = [
        '{"user": {"__proto__": {"role": "admin"}}}',
        '{"config": {"constructor": {"prototype": {"debug": true}}}}',
        '{"settings": {"prototype": {"version": "malicious"}}}'
      ]

      for (const input of nestedInputs) {
        expect(detectPrototypePollution(input)).toBe(true)
      }
    })

    it('should detect bracket notation pollution attempts', () => {
      const bracketInputs = [
        '{"data": ["__proto__"]}',
        'obj["__proto__"] = {"admin": true}',
        'user["constructor"]["prototype"] = {"role": "admin"}'
      ]

      for (const input of bracketInputs) {
        expect(detectPrototypePollution(input)).toBe(true)
      }
    })

    it('should detect eval-like patterns', () => {
      const evalInputs = [
        '{"code": "eval(\\"malicious code\\")"}',
        '{"func": "Function(\\"return process\\")"}',
        '{"timer": "setTimeout(\\"hack\\()", 1000)"}',
        '{"interval": "setInterval(\\"malicious\\()", 100)"}'
      ]

      for (const input of evalInputs) {
        expect(detectPrototypePollution(input)).toBe(true)
      }
    })

    it('should allow safe JSON inputs', () => {
      const safeInputs = [
        '{"name": "John", "age": 30}',
        '{"users": ["alice", "bob", "charlie"]}',
        '{"config": {"theme": "dark", "notifications": true}}',
        '{"data": {"id": 123, "value": "safe"}}'
      ]

      for (const input of safeInputs) {
        expect(detectPrototypePollution(input)).toBe(false)
      }
    })
  })

  describe('Object Sanitization', () => {
    it('should remove dangerous properties from objects', () => {
      const maliciousObj = {
        name: 'test',
        '__proto__': { admin: true },
        constructor: { prototype: { malicious: true } },
        prototype: { dangerous: true },
        safe: 'value'
      }

      const sanitized = sanitizeObject(maliciousObj)

      expect(sanitized.name).toBe('test')
      expect(sanitized.safe).toBe('value')
      expect(sanitized).not.toHaveProperty('__proto__')
      expect(sanitized).not.toHaveProperty('constructor')
      expect(sanitized).not.toHaveProperty('prototype')
      expect(Object.getPrototypeOf(sanitized)).toBeNull()
    })

    it('should handle nested objects with dangerous properties', () => {
      const nestedObj = {
        user: {
          name: 'alice',
          '__proto__': { role: 'admin' },
          profile: {
            constructor: { prototype: { hack: true } },
            bio: 'safe'
          }
        },
        safe: 'value'
      }

      const sanitized = sanitizeObject(nestedObj)

      expect(sanitized.user.name).toBe('alice')
      expect(sanitized.user.profile.bio).toBe('safe')
      expect(sanitized.user).not.toHaveProperty('__proto__')
      expect(sanitized.user.profile).not.toHaveProperty('constructor')
      expect(sanitized.safe).toBe('value')
    })

    it('should handle arrays with dangerous objects', () => {
      const arrayWithMalicious = [
        { name: 'item1', safe: true },
        { '__proto__': { admin: true }, dangerous: true } as any,
        { name: 'item3', constructor: { prototype: { hack: true } } } as any
      ]

      const sanitized = sanitizeObject(arrayWithMalicious)

      expect(sanitized[0].name).toBe('item1')
      expect(sanitized[0].safe).toBe(true)
      expect(sanitized[1]).not.toHaveProperty('__proto__')
      expect(sanitized[2].name).toBe('item3')
      expect(sanitized[2]).not.toHaveProperty('constructor')
    })

    it('should prevent circular reference infinite loops', () => {
      const circularObj: any = { name: 'test' }
      circularObj.self = circularObj

      const sanitized = sanitizeObject(circularObj)
      expect(sanitized.name).toBe('test')
      // Circular reference should be detected and handled
      expect(sanitized.self).toBeDefined()
    })

    it('should handle depth limits', () => {
      let deepObj: any = { level: 0 }
      for (let i = 1; i <= 15; i++) {
        deepObj = { nested: deepObj, level: i }
      }

      const sanitized = sanitizeObject(deepObj)
      expect(sanitized.level).toBe(15)
      // Should stop at depth limit and not crash
    })
  })

  describe('Safe JSON Parsing', () => {
    it('should reject malicious JSON and return fallback', () => {
      const fallback = { safe: 'default' }

      const maliciousInputs = [
        '{"__proto__": {"admin": true}}',
        '{"constructor": {"prototype": {"hack": true}}}',
        '{"data": {"__proto__": {"role": "admin"}}}',
        'obj["__proto__"] = {"admin": true}'
      ]

      for (const input of maliciousInputs) {
        const result = safeJsonParse(input, fallback)
        expect(result).toBe(fallback)
      }
    })

    it('should parse and sanitize safe JSON', () => {
      const safeJson = '{"name": "John", "age": 30, "active": true}'
      const fallback = { error: 'fallback' }

      const result = safeJsonParse(safeJson, fallback)

      expect(result).not.toBe(fallback)
      expect(result.name).toBe('John')
      expect(result.age).toBe(30)
      expect(result.active).toBe(true)
      expect(Object.getPrototypeOf(result)).toBeNull()
    })

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"name": "John", "age":}'
      const fallback = { error: 'fallback' }

      const result = safeJsonParse(malformedJson, fallback)
      expect(result).toBe(fallback)
    })

    it('should handle non-string inputs', () => {
      const fallback = { error: 'fallback' }

      expect(safeJsonParse(null as any, fallback)).toBe(fallback)
      expect(safeJsonParse(undefined as any, fallback)).toBe(fallback)
      expect(safeJsonParse(123 as any, fallback)).toBe(fallback)
      expect(safeJsonParse({} as any, fallback)).toBe(fallback)
    })
  })

  describe('Integration Tests', () => {
    it('should protect against complex prototype pollution attacks', () => {
      const complexAttack = JSON.stringify({
        user: {
          name: 'victim',
          preferences: {
            '__proto__': {
              isAdmin: true,
              role: 'administrator'
            }
          }
        },
        constructor: {
          prototype: {
            malicious: 'payload',
            backdoor: () => 'evil'
          }
        },
        data: [
          { safe: 'item1' },
          { '__proto__': { hacked: true } },
          { normal: 'item3' }
        ]
      })

      const fallback = { safe: 'default' }
      const result = safeJsonParse(complexAttack, fallback)

      // Should reject the entire malicious payload
      expect(result).toBe(fallback)
    })

    it('should allow legitimate complex JSON structures', () => {
      const legitimateJson = JSON.stringify({
        users: [
          { id: 1, name: 'alice', role: 'user' },
          { id: 2, name: 'bob', role: 'admin' }
        ],
        settings: {
          theme: 'dark',
          notifications: true,
          features: {
            beta: true,
            experimental: false
          }
        },
        metadata: {
          version: '1.0.0',
          created: '2023-01-01'
        }
      })

      const fallback = { error: 'fallback' }
      const result = safeJsonParse(legitimateJson, fallback)

      expect(result).not.toBe(fallback)
      expect(result.users).toHaveLength(2)
      expect(result.users[0].name).toBe('alice')
      expect(result.settings.theme).toBe('dark')
      expect(result.settings.features.beta).toBe(true)
      expect(result.metadata.version).toBe('1.0.0')
      expect(Object.getPrototypeOf(result)).toBeNull()
    })
  })
})
