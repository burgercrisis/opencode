import { describe, it, expect, beforeEach } from 'bun:test'
import { base64Encode, base64Decode, hash, checksum, sampledChecksum } from './encode'

describe('encode', () => {
  describe('base64Encode', () => {
    it('should encode simple strings', () => {
      expect(base64Encode('hello')).toBe('aGVsbG8')
      expect(base64Encode('world')).toBe('d29ybGQ')
    })

    it('should encode empty string', () => {
      expect(base64Encode('')).toBe('')
    })

    it('should encode strings with special characters', () => {
      expect(base64Encode('hello')).toBe('aGVsbG8')
      expect(base64Encode('world')).toBe('d29ybGQ')
    })

    it('should encode unicode characters', () => {
      const encoded = base64Encode('🚀')
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/) // Should be valid base64 URL-safe
      expect(encoded.length).toBeGreaterThan(0)
    })

    it('should handle long strings', () => {
      const longString = 'a'.repeat(1000)
      const encoded = base64Encode(longString)
      expect(encoded).toMatch(/^YWFh/) // Should start with expected pattern
      expect(encoded.length).toBeGreaterThan(0)
    })

    it('should not use URL-safe characters in standard encoding', () => {
      const encoded = base64Encode('test')
      expect(encoded).not.toContain('+')
      expect(encoded).not.toContain('/')
      expect(encoded).not.toContain('=')
    })
  })

  describe('base64Decode', () => {
    it('should decode simple strings', () => {
      expect(base64Decode('aGVsbG8')).toBe('hello')
      expect(base64Decode('d29ybGQ')).toBe('world')
    })

    it('should decode empty string', () => {
      expect(base64Decode('')).toBe('')
    })

    it('should decode strings with special characters', () => {
      expect(base64Decode('aGVsbG8gd29ybGQh')).toBe('hello world!')
      expect(base64Decode('dGVzdEBleGFtcGxlLmNvbQ')).toBe('test@example.com')
    })

    it('should decode unicode characters', () => {
      const encoded = base64Encode('🚀')
      const decoded = base64Decode(encoded)
      expect(decoded).toBe('🚀')
      expect(base64Decode('Y2Fmw6k')).toBe('café')
    })

    it('should handle URL-safe encoding', () => {
      // Test with URL-safe characters that get converted
      const encoded = base64Encode('test+value')
      expect(base64Decode(encoded)).toBe('test+value')
    })

    it('should handle padding removal', () => {
      const standardEncoded = btoa('test')
      const urlSafeEncoded = base64Encode('test')
      expect(base64Decode(urlSafeEncoded)).toBe('test')
    })

    it('should decode long strings', () => {
      const original = 'a'.repeat(1000)
      const encoded = base64Encode(original)
      expect(base64Decode(encoded)).toBe(original)
    })
  })

  describe('hash', () => {
    it('should hash strings with SHA-256 by default', async () => {
      const hash1 = await hash('hello')
      const hash2 = await hash('hello')
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await hash('hello')
      const hash2 = await hash('world')
      expect(hash1).not.toBe(hash2)
    })

    it('should hash empty string', async () => {
      const emptyHash = await hash('')
      expect(emptyHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should support different algorithms', async () => {
      const sha256Hash = await hash('test', 'SHA-256')
      const sha1Hash = await hash('test', 'SHA-1')
      expect(sha256Hash).not.toBe(sha1Hash)
      expect(sha256Hash).toMatch(/^[a-f0-9]{64}$/)
      expect(sha1Hash).toMatch(/^[a-f0-9]{40}$/)
    })

    it('should hash unicode characters correctly', async () => {
      const hash1 = await hash('🚀')
      const hash2 = await hash('🚀')
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should hash long strings consistently', async () => {
      const longString = 'a'.repeat(10000)
      const hash1 = await hash(longString)
      const hash2 = await hash(longString)
      expect(hash1).toBe(hash2)
    })
  })

  describe('checksum', () => {
    it('should calculate checksum for simple strings', () => {
      const checksum1 = checksum('hello')
      const checksum2 = checksum('hello')
      expect(checksum1).toBe(checksum2)
      expect(typeof checksum1).toBe('string')
      expect(checksum1!.length).toBeGreaterThan(0)
    })

    it('should return undefined for empty string', () => {
      expect(checksum('')).toBeUndefined()
    })

    it('should return undefined for undefined input', () => {
      expect(checksum(undefined as any)).toBeUndefined()
    })

    it('should produce different checksums for different inputs', () => {
      const checksum1 = checksum('hello')
      const checksum2 = checksum('world')
      expect(checksum1).not.toBe(checksum2)
    })

    it('should handle strings with special characters', () => {
      const checksum1 = checksum('hello world!')
      const checksum2 = checksum('hello world!')
      expect(checksum1).toBe(checksum2)
    })

    it('should handle unicode characters', () => {
      const checksum1 = checksum('🚀')
      const checksum2 = checksum('🚀')
      expect(checksum1).toBe(checksum2)
    })

    it('should be deterministic for same input', () => {
      const input = 'test string'
      const results = Array.from({ length: 10 }, () => checksum(input))
      results.forEach(result => {
        expect(result).toBe(results[0])
      })
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(100000)
      const checksum1 = checksum(longString)
      const checksum2 = checksum(longString)
      expect(checksum1).toBe(checksum2)
    })
  })

  describe('sampledChecksum', () => {
    it('should return regular checksum for strings under limit', () => {
      const shortString = 'hello'
      const regularChecksum = checksum(shortString)
      const sampledChecksumResult = sampledChecksum(shortString)
      expect(sampledChecksumResult).toBe(regularChecksum)
    })

    it('should return undefined for empty string', () => {
      expect(sampledChecksum('')).toBeUndefined()
    })

    it('should return undefined for undefined input', () => {
      expect(sampledChecksum(undefined as any)).toBeUndefined()
    })

    it('should use default limit of 500_000', () => {
      const mediumString = 'a'.repeat(1000)
      const regularChecksum = checksum(mediumString)
      const sampledChecksumResult = sampledChecksum(mediumString)
      expect(sampledChecksumResult).toBe(regularChecksum)
    })

    it('should sample large strings', () => {
      const largeString = 'a'.repeat(600000)
      const result = sampledChecksum(largeString)
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result!.startsWith('600000:')).toBe(true)
    })

    it('should use custom limit', () => {
      const string = 'a'.repeat(1000)
      const result1 = sampledChecksum(string, 500)
      const result2 = sampledChecksum(string, 2000)
      expect(result1).not.toBe(result2)
      expect(result1!.startsWith('1000:')).toBe(true)
      expect(result2).toBe(checksum(string))
    })

    it('should be deterministic for same large input', () => {
      const largeString = 'a'.repeat(600000)
      const result1 = sampledChecksum(largeString)
      const result2 = sampledChecksum(largeString)
      expect(result1).toBe(result2)
    })

    it('should handle strings exactly at the limit', () => {
      const exactLimitString = 'a'.repeat(500000)
      const regularChecksum = checksum(exactLimitString)
      const sampledChecksumResult = sampledChecksum(exactLimitString)
      expect(sampledChecksumResult).toBe(regularChecksum)
    })

    it('should handle strings just over the limit', () => {
      const overLimitString = 'a'.repeat(500001)
      const result = sampledChecksum(overLimitString)
      expect(result).toBeDefined()
      expect(result!.startsWith('500001:')).toBe(true)
    })

    it('should sample from multiple positions', () => {
      // Create a string with different content at different positions
      const prefix = 'x'.repeat(1000)
      const middle = 'y'.repeat(1000)
      const suffix = 'z'.repeat(1000)
      const largeString = prefix + 'a'.repeat(600000) + middle + 'b'.repeat(600000) + suffix

      const result = sampledChecksum(largeString, 1000000) // Use high limit to ensure sampling
      expect(result).toBeDefined()
      expect(result!.includes(':')).toBe(true)
    })

    it('should handle very large strings efficiently', () => {
      const veryLargeString = 'a'.repeat(2000000)
      const start = Date.now()
      const result = sampledChecksum(veryLargeString)
      const duration = Date.now() - start

      expect(result).toBeDefined()
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })
  })

  describe('round-trip encoding', () => {
    it('should maintain data integrity through encode/decode cycle', () => {
      const testStrings = [
        '',
        'hello',
        'hello world!',
        'test@example.com',
        '🚀 rocket',
        'a'.repeat(1000),
        'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
        'Unicode: café naïve résumé'
      ]

      testStrings.forEach(str => {
        const encoded = base64Encode(str)
        const decoded = base64Decode(encoded)
        expect(decoded).toBe(str)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle null and undefined inputs gracefully', () => {
      expect(() => base64Encode(null as any)).not.toThrow()
      expect(() => base64Encode(undefined as any)).not.toThrow()
      expect(() => base64Decode(null as any)).toThrow()
      expect(() => base64Decode(undefined as any)).toThrow()
    })

    it('should handle invalid base64 input', () => {
      expect(() => base64Decode('invalid!')).toThrow()
      expect(() => base64Decode('not base64 @#$')).toThrow()
    })

    it('should handle hash algorithm errors gracefully', async () => {
      // Test with invalid algorithm - should throw
      await expect(hash('test', 'INVALID' as any)).rejects.toThrow()
    })
  })
})
