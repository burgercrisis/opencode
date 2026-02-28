import { describe, it, expect, beforeEach } from 'bun:test'
import { 
  createQuerySerializer, 
  getParseAs, 
  setAuthParams, 
  buildUrl, 
  mergeConfigs, 
  mergeHeaders 
} from './utils.gen'

// Mock dependencies
const mockGetAuthToken = jest.fn()
const mockSerializeArrayParam = jest.fn()
const mockSerializeObjectParam = jest.fn()
const mockSerializePrimitiveParam = jest.fn()
const mockGetUrl = jest.fn()

jest.mock('../core/auth.gen.js', () => ({
  getAuthToken: mockGetAuthToken
}))

jest.mock('../core/pathSerializer.gen.js', () => ({
  serializeArrayParam: mockSerializeArrayParam,
  serializeObjectParam: mockSerializeObjectParam,
  serializePrimitiveParam: mockSerializePrimitiveParam
}))

jest.mock('../core/utils.gen.js', () => ({
  getUrl: mockGetUrl
}))

describe('utils.gen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mock behavior
    mockSerializeArrayParam.mockReturnValue('array=serialized')
    mockSerializeObjectParam.mockReturnValue('object=serialized')
    mockSerializePrimitiveParam.mockReturnValue('primitive=serialized')
    mockGetUrl.mockReturnValue('https://api.example.com/path?query=value')
    mockGetAuthToken.mockResolvedValue('test-token')
  })

  describe('createQuerySerializer', () => {
    it('should create query serializer function', () => {
      const serializer = createQuerySerializer()
      expect(typeof serializer).toBe('function')
    })

    it('should handle empty query params', () => {
      const serializer = createQuerySerializer()
      const result = serializer({})
      expect(result).toBe('')
    })

    it('should handle null and undefined values', () => {
      const serializer = createQuerySerializer()
      const result = serializer({
        key1: null,
        key2: undefined,
        key3: 'value'
      })
      expect(result).toBe('primitive=serialized')
    })

    it('should handle array values', () => {
      const serializer = createQuerySerializer()
      const queryParams = {
        tags: ['tag1', 'tag2'],
        name: 'test'
      }
      
      const result = serializer(queryParams)
      
      expect(mockSerializeArrayParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        explode: true,
        name: 'tags',
        style: 'form',
        value: ['tag1', 'tag2'],
        array: undefined
      })
      expect(result).toContain('array=serialized')
    })

    it('should handle object values', () => {
      const serializer = createQuerySerializer()
      const queryParams = {
        filter: { category: 'books', price: { gt: 10 } },
        name: 'test'
      }
      
      const result = serializer(queryParams)
      
      expect(mockSerializeObjectParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        explode: true,
        name: 'filter',
        style: 'deepObject',
        value: { category: 'books', price: { gt: 10 } },
        object: undefined
      })
      expect(result).toContain('object=serialized')
    })

    it('should handle primitive values', () => {
      const serializer = createQuerySerializer()
      const queryParams = {
        name: 'test',
        count: 5
      }
      
      const result = serializer(queryParams)
      
      expect(mockSerializePrimitiveParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        name: 'name',
        value: 'test'
      })
      expect(mockSerializePrimitiveParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        name: 'count',
        value: 5
      })
    })

    it('should use custom options', () => {
      const options = {
        allowReserved: true,
        array: { style: 'simple' as const },
        object: { style: 'form' as const }
      }
      const serializer = createQuerySerializer(options)
      const queryParams = {
        tags: ['tag1'],
        filter: { key: 'value' }
      }
      
      serializer(queryParams)
      
      expect(mockSerializeArrayParam).toHaveBeenCalledWith(
        expect.objectContaining({
          allowReserved: true,
          array: { style: 'simple' }
        })
      )
      expect(mockSerializeObjectParam).toHaveBeenCalledWith(
        expect.objectContaining({
          allowReserved: true,
          object: { style: 'form' }
        })
      )
    })

    it('should skip falsy serialized values', () => {
      mockSerializeArrayParam.mockReturnValue(null)
      mockSerializeObjectParam.mockReturnValue('')
      mockSerializePrimitiveParam.mockReturnValue(null)
      
      const serializer = createQuerySerializer()
      const result = serializer({
        tags: ['tag1'],
        filter: { key: 'value' },
        name: 'test'
      })
      
      expect(result).toBe('')
    })

    it('should handle non-object query params', () => {
      const serializer = createQuerySerializer()
      const result = serializer(null as any)
      expect(result).toBe('')
      
      const result2 = serializer('string' as any)
      expect(result2).toBe('')
      
      const result3 = serializer(123 as any)
      expect(result3).toBe('')
    })
  })

  describe('getParseAs', () => {
    it('should return stream for null content type', () => {
      const result = getParseAs(null)
      expect(result).toBe('stream')
    })

    it('should return stream for empty content type', () => {
      const result = getParseAs('')
      expect(result).toBe('stream')
    })

    it('should return stream for whitespace-only content type', () => {
      const result = getParseAs('   ; charset=utf-8  ')
      expect(result).toBe('stream')
    })

    it('should return json for application/json', () => {
      const result = getParseAs('application/json')
      expect(result).toBe('json')
    })

    it('should return json for application/json with charset', () => {
      const result = getParseAs('application/json; charset=utf-8')
      expect(result).toBe('json')
    })

    it('should return json for +json suffix types', () => {
      const result = getParseAs('application/vnd.api+json')
      expect(result).toBe('json')
    })

    it('should return formData for multipart/form-data', () => {
      const result = getParseAs('multipart/form-data; boundary=----WebKitFormBoundary')
      expect(result).toBe('formData')
    })

    it('should return blob for application/* types', () => {
      const result = getParseAs('application/pdf')
      expect(result).toBe('blob')
    })

    it('should return blob for audio/* types', () => {
      const result = getParseAs('audio/mpeg')
      expect(result).toBe('blob')
    })

    it('should return blob for image/* types', () => {
      const result = getParseAs('image/jpeg')
      expect(result).toBe('blob')
    })

    it('should return blob for video/* types', () => {
      const result = getParseAs('video/mp4')
      expect(result).toBe('blob')
    })

    it('should return text for text/* types', () => {
      const result = getParseAs('text/plain')
      expect(result).toBe('text')
    })

    it('should return text for text/html with charset', () => {
      const result = getParseAs('text/html; charset=utf-8')
      expect(result).toBe('text')
    })

    it('should return undefined for unknown content types', () => {
      const result = getParseAs('unknown/type')
      expect(result).toBeUndefined()
    })

    it('should handle edge case content types', () => {
      expect(getParseAs('application/jsonp')).toBe('json')
      expect(getParseAs('application/vnd.custom+json')).toBe('json')
      expect(getParseAs('application/octet-stream')).toBe('blob')
      expect(getParseAs('text/css')).toBe('text')
      expect(getParseAs('text/javascript')).toBe('text')
    })
  })

  describe('setAuthParams', () => {
    it('should skip auth when already exists in headers', async () => {
      const headers = new Headers({ Authorization: 'Bearer existing' })
      const security = [{ name: 'Authorization', in: 'header' as const }]
      
      await setAuthParams({ headers, security })
      
      expect(headers.get('Authorization')).toBe('Bearer existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should skip auth when already exists in query', async () => {
      const headers = new Headers()
      const query = { api_key: 'existing' }
      const security = [{ name: 'api_key', in: 'query' as const }]
      
      await setAuthParams({ headers, query, security })
      
      expect(query.api_key).toBe('existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should skip auth when already exists in cookies', async () => {
      const headers = new Headers({ Cookie: 'session_id=existing; auth_token=existing' })
      const security = [{ name: 'auth_token', in: 'cookie' as const }]
      
      await setAuthParams({ headers, security })
      
      expect(headers.get('Cookie')).toContain('auth_token=existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should set header auth when token is obtained', async () => {
      const headers = new Headers()
      const security = [{ name: 'Authorization', in: 'header' as const }]
      mockGetAuthToken.mockResolvedValue('Bearer new-token')
      
      await setAuthParams({ headers, security })
      
      expect(headers.get('Authorization')).toBe('Bearer new-token')
      expect(mockGetAuthToken).toHaveBeenCalledWith(security[0], undefined)
    })

    it('should set query auth when token is obtained', async () => {
      const headers = new Headers()
      const query = {}
      const security = [{ name: 'api_key', in: 'query' as const }]
      mockGetAuthToken.mockResolvedValue('new-api-key')
      
      await setAuthParams({ headers, query, security })
      
      expect(query.api_key).toBe('new-api-key')
    })

    it('should set cookie auth when token is obtained', async () => {
      const headers = new Headers()
      const security = [{ name: 'session_id', in: 'cookie' as const }]
      mockGetAuthToken.mockResolvedValue('new-session-id')
      
      await setAuthParams({ headers, security })
      
      expect(headers.get('Cookie')).toBe('session_id=new-session-id')
    })

    it('should use default Authorization name when name is undefined', async () => {
      const headers = new Headers()
      const security = [{ in: 'header' as const }]
      mockGetAuthToken.mockResolvedValue('Bearer token')
      
      await setAuthParams({ headers, security })
      
      expect(headers.get('Authorization')).toBe('Bearer token')
    })

    it('should skip when token is null', async () => {
      const headers = new Headers()
      const security = [{ name: 'Authorization', in: 'header' as const }]
      mockGetAuthToken.mockResolvedValue(null)
      
      await setAuthParams({ headers, security })
      
      expect(headers.has('Authorization')).toBe(false)
    })

    it('should skip when token is undefined', async () => {
      const headers = new Headers()
      const security = [{ name: 'Authorization', in: 'header' as const }]
      mockGetAuthToken.mockResolvedValue(undefined)
      
      await setAuthParams({ headers, security })
      
      expect(headers.has('Authorization')).toBe(false)
    })

    it('should handle multiple security schemes', async () => {
      const headers = new Headers()
      const query = {}
      const security = [
        { name: 'Authorization', in: 'header' as const },
        { name: 'api_key', in: 'query' as const }
      ]
      mockGetAuthToken
        .mockResolvedValueOnce('Bearer token')
        .mockResolvedValueOnce('api-key-value')
      
      await setAuthParams({ headers, query, security })
      
      expect(headers.get('Authorization')).toBe('Bearer token')
      expect(query.api_key).toBe('api-key-value')
    })

    it('should handle auth object being passed', async () => {
      const headers = new Headers()
      const auth = { username: 'user', password: 'pass' }
      const security = [{ name: 'Authorization', in: 'header' as const }]
      mockGetAuthToken.mockResolvedValue('Basic credentials')
      
      await setAuthParams({ headers, auth, security })
      
      expect(mockGetAuthToken).toHaveBeenCalledWith(security[0], auth)
      expect(headers.get('Authorization')).toBe('Basic credentials')
    })
  })

  describe('buildUrl', () => {
    it('should build URL with function query serializer', () => {
      const options = {
        baseUrl: 'https://api.example.com',
        path: '/users',
        query: { page: 1 },
        querySerializer: (q: any) => `page=${q.page}`
      }
      
      const result = buildUrl(options as any)
      
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com',
        path: '/users',
        query: { page: 1 },
        querySerializer: expect.any(Function),
        url: undefined
      })
      expect(result).toBe('https://api.example.com/path?query=value')
    })

    it('should build URL with object query serializer', () => {
      const options = {
        baseUrl: 'https://api.example.com',
        path: '/users',
        query: { page: 1 },
        querySerializer: { allowReserved: true }
      }
      
      const result = buildUrl(options as any)
      
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com',
        path: '/users',
        query: { page: 1 },
        querySerializer: expect.any(Function),
        url: undefined
      })
      expect(result).toBe('https://api.example.com/path?query=value')
    })

    it('should build URL with full URL', () => {
      const options = {
        url: 'https://custom.example.com/api',
        path: '/users'
      }
      
      buildUrl(options as any)
      
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: undefined,
        path: '/users',
        query: undefined,
        querySerializer: expect.any(Function),
        url: 'https://custom.example.com/api'
      })
    })
  })

  describe('mergeConfigs', () => {
    it('should merge two configs', () => {
      const configA = { baseUrl: 'https://api.a.com', timeout: 5000 }
      const configB = { timeout: 10000, headers: { 'Auth': 'token' } }
      
      const result = mergeConfigs(configA as any, configB as any)
      
      expect(result).toEqual({
        baseUrl: 'https://api.a.com',
        timeout: 10000,
        headers: expect.any(Headers)
      })
    })

    it('should remove trailing slash from baseUrl', () => {
      const configA = { baseUrl: 'https://api.example.com/' }
      const configB = {}
      
      const result = mergeConfigs(configA as any, configB as any)
      
      expect(result.baseUrl).toBe('https://api.example.com')
    })

    it('should not remove trailing slash from baseUrl when no slash', () => {
      const configA = { baseUrl: 'https://api.example.com' }
      const configB = {}
      
      const result = mergeConfigs(configA as any, configB as any)
      
      expect(result.baseUrl).toBe('https://api.example.com')
    })

    it('should merge headers using mergeHeaders', () => {
      const configA = { headers: { 'A': '1' } }
      const configB = { headers: { 'B': '2' } }
      
      const result = mergeConfigs(configA as any, configB as any)
      
      expect(result.headers).toBeInstanceOf(Headers)
    })
  })

  describe('mergeHeaders', () => {
    it('should merge multiple header objects', () => {
      const headers1 = { 'A': '1', 'B': '2' }
      const headers2 = { 'B': '3', 'C': '4' }
      const headers3 = { 'D': '5' }
      
      const result = mergeHeaders(headers1, headers2, headers3)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('3') // overridden
      expect(result.get('C')).toBe('4')
      expect(result.get('D')).toBe('5')
    })

    it('should merge Headers instances', () => {
      const headers1 = new Headers({ 'A': '1', 'B': '2' })
      const headers2 = new Headers({ 'B': '3', 'C': '4' })
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('3')
      expect(result.get('C')).toBe('4')
    })

    it('should handle mixed header types', () => {
      const headers1 = { 'A': '1' }
      const headers2 = new Headers({ 'B': '2' })
      const headers3 = { 'C': '3' }
      
      const result = mergeHeaders(headers1, headers2, headers3)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('2')
      expect(result.get('C')).toBe('3')
    })

    it('should skip null values', () => {
      const headers1 = { 'A': '1', 'B': null as any }
      const headers2 = { 'C': '3' }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('1')
      expect(result.has('B')).toBe(false)
      expect(result.get('C')).toBe('3')
    })

    it('should handle array values', () => {
      const headers1 = { 'A': ['1', '2'] }
      const headers2 = { 'B': '3' }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('A')).toBe('1') // first value
      // Headers API doesn't easily show multiple values, but they should be appended
    })

    it('should stringify object values', () => {
      const headers1 = { 'A': { key: 'value' } }
      const headers2 = { 'B': 'string' }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('{"key":"value"}')
      expect(result.get('B')).toBe('string')
    })

    it('should skip undefined values', () => {
      const headers1 = { 'A': '1', 'B': undefined as any }
      const headers2 = { 'C': '3' }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('1')
      expect(result.has('B')).toBe(false)
      expect(result.get('C')).toBe('3')
    })

    it('should skip non-object headers', () => {
      const headers1 = { 'A': '1' }
      const headers2 = null as any
      const headers3 = undefined as any
      const headers4 = 'string' as any
      const headers5 = 123 as any
      
      const result = mergeHeaders(headers1, headers2, headers3, headers4, headers5)
      
      expect(result.get('A')).toBe('1')
    })

    it('should handle empty headers', () => {
      const result = mergeHeaders()
      
      expect(result).toBeInstanceOf(Headers)
      expect(result.entries().next().done).toBe(true)
    })
  })
})
