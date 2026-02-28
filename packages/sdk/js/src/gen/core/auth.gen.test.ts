import { describe, it, expect, beforeEach } from 'bun:test'
import { getAuthToken, type Auth } from './auth.gen'

describe('auth.gen', () => {
  describe('getAuthToken', () => {
    it('should return undefined when callback returns undefined', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockResolvedValue(undefined)
      
      const result = await getAuthToken(auth, callback)
      
      expect(result).toBeUndefined()
    })

    it('should return undefined when callback returns null', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockResolvedValue(null)
      
      const result = await getAuthToken(auth, callback)
      
      expect(result).toBeUndefined()
    })

    it('should return undefined when callback returns empty string', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockResolvedValue('')
      
      const result = await getAuthToken(auth, callback)
      
      expect(result).toBeUndefined()
    })

    it('should return token directly when callback is not a function', async () => {
      const auth: Auth = { type: 'apiKey' }
      const token = 'direct-token'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe(token)
    })

    it('should return token from callback function', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockResolvedValue('callback-token')
      
      const result = await getAuthToken(auth, callback)
      
      expect(result).toBe('callback-token')
      expect(callback).toHaveBeenCalledWith(auth)
    })

    it('should handle synchronous callback functions', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockReturnValue('sync-token')
      
      const result = await getAuthToken(auth, callback)
      
      expect(result).toBe('sync-token')
      expect(callback).toHaveBeenCalledWith(auth)
    })

    it('should add Bearer prefix for bearer scheme', async () => {
      const auth: Auth = { type: 'http', scheme: 'bearer' }
      const token = 'my-token'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Bearer my-token')
    })

    it('should add Basic prefix and encode for basic scheme', async () => {
      const auth: Auth = { type: 'http', scheme: 'basic' }
      const token = 'username:password'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Basic ' + btoa(token))
    })

    it('should handle basic auth with special characters', async () => {
      const auth: Auth = { type: 'http', scheme: 'basic' }
      const token = 'user@domain.com:p@ssw0rd!'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Basic ' + btoa(token))
    })

    it('should return token as-is for apiKey type', async () => {
      const auth: Auth = { type: 'apiKey' }
      const token = 'api-key-value'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('api-key-value')
    })

    it('should return token as-is for http type without scheme', async () => {
      const auth: Auth = { type: 'http' }
      const token = 'custom-token'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('custom-token')
    })

    it('should handle callback that throws error', async () => {
      const auth: Auth = { type: 'apiKey' }
      const callback = jest.fn().mockRejectedValue(new Error('Auth failed'))
      
      await expect(getAuthToken(auth, callback)).rejects.toThrow('Auth failed')
    })

    it('should handle callback that returns non-string values', async () => {
      const auth: Auth = { type: 'apiKey' }
      
      // Test number
      const callback1 = jest.fn().mockResolvedValue(123)
      const result1 = await getAuthToken(auth, callback1)
      expect(result1).toBe(123)
      
      // Test object
      const callback2 = jest.fn().mockResolvedValue({ token: 'value' })
      const result2 = await getAuthToken(auth, callback2)
      expect(result2).toEqual({ token: 'value' })
      
      // Test boolean
      const callback3 = jest.fn().mockResolvedValue(true)
      const result3 = await getAuthToken(auth, callback3)
      expect(result3).toBe(true)
    })

    it('should handle bearer scheme with empty token', async () => {
      const auth: Auth = { type: 'http', scheme: 'bearer' }
      const token = ''
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBeUndefined()
    })

    it('should handle basic scheme with empty token', async () => {
      const auth: Auth = { type: 'http', scheme: 'basic' }
      const token = ''
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBeUndefined()
    })

    it('should handle bearer scheme with existing Bearer prefix', async () => {
      const auth: Auth = { type: 'http', scheme: 'bearer' }
      const token = 'Bearer my-token'
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Bearer Bearer my-token')
    })

    it('should handle basic scheme with existing Basic prefix', async () => {
      const auth: Auth = { type: 'http', scheme: 'basic' }
      const token = 'Basic dXNlcjpwYXNz' // already encoded
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Basic ' + btoa(token))
    })

    it('should handle complex callback scenarios', async () => {
      const auth: Auth = { type: 'apiKey', name: 'X-API-Key' }
      let callCount = 0
      
      const callback = jest.fn().mockImplementation(async (authConfig) => {
        callCount++
        if (callCount === 1) {
          return undefined
        }
        return `token-${callCount}`
      })
      
      const result1 = await getAuthToken(auth, callback)
      expect(result1).toBeUndefined()
      
      const result2 = await getAuthToken(auth, callback)
      expect(result2).toBe('token-2')
    })

    it('should preserve auth object structure in callback', async () => {
      const auth: Auth = {
        type: 'http',
        scheme: 'bearer',
        in: 'header',
        name: 'Authorization'
      }
      
      const callback = jest.fn().mockResolvedValue('test-token')
      
      await getAuthToken(auth, callback)
      
      expect(callback).toHaveBeenCalledWith(auth)
    })

    it('should handle Unicode tokens in basic auth', async () => {
      const auth: Auth = { type: 'http', scheme: 'basic' }
      const token = '用户:密码' // Chinese characters
      
      const result = await getAuthToken(auth, token)
      
      expect(result).toBe('Basic ' + btoa(token))
    })

    it('should handle very long tokens', async () => {
      const auth: Auth = { type: 'apiKey' }
      const longToken = 'a'.repeat(10000)
      
      const result = await getAuthToken(auth, longToken)
      
      expect(result).toBe(longToken)
      expect(result.length).toBe(10000)
    })

    it('should handle tokens with special characters for apiKey', async () => {
      const auth: Auth = { type: 'apiKey' }
      const specialToken = 'token-with-special-chars!@#$%^&*()_+-=[]{}|;:,.<>?'
      
      const result = await getAuthToken(auth, specialToken)
      
      expect(result).toBe(specialToken)
    })
  })

  describe('Auth interface', () => {
    it('should accept valid auth configurations', () => {
      const auth1: Auth = { type: 'apiKey' }
      const auth2: Auth = { type: 'http', scheme: 'bearer' }
      const auth3: Auth = { type: 'http', scheme: 'basic' }
      const auth4: Auth = { type: 'apiKey', in: 'query', name: 'api_key' }
      const auth5: Auth = { type: 'http', in: 'header', name: 'Authorization', scheme: 'bearer' }
      
      expect(auth1.type).toBe('apiKey')
      expect(auth2.type).toBe('http')
      expect(auth3.type).toBe('http')
      expect(auth4.in).toBe('query')
      expect(auth5.name).toBe('Authorization')
    })

    it('should handle optional properties', () => {
      const auth: Auth = { type: 'apiKey' }
      
      expect(auth.in).toBeUndefined()
      expect(auth.name).toBeUndefined()
      expect(auth.scheme).toBeUndefined()
    })

    it('should accept all valid values for "in" property', () => {
      const auth1: Auth = { type: 'apiKey', in: 'header' }
      const auth2: Auth = { type: 'apiKey', in: 'query' }
      const auth3: Auth = { type: 'apiKey', in: 'cookie' }
      
      expect(auth1.in).toBe('header')
      expect(auth2.in).toBe('query')
      expect(auth3.in).toBe('cookie')
    })

    it('should accept all valid values for "scheme" property', () => {
      const auth1: Auth = { type: 'http', scheme: 'basic' }
      const auth2: Auth = { type: 'http', scheme: 'bearer' }
      
      expect(auth1.scheme).toBe('basic')
      expect(auth2.scheme).toBe('bearer')
    })

    it('should accept all valid values for "type" property', () => {
      const auth1: Auth = { type: 'apiKey' }
      const auth2: Auth = { type: 'http' }
      
      expect(auth1.type).toBe('apiKey')
      expect(auth2.type).toBe('http')
    })
  })

  describe('AuthToken type', () => {
    it('should accept string values', () => {
      const token: import('./auth.gen').AuthToken = 'valid-token'
      expect(token).toBe('valid-token')
    })

    it('should accept undefined values', () => {
      const token: import('./auth.gen').AuthToken = undefined
      expect(token).toBeUndefined()
    })
  })
})
