import { describe, it, expect, beforeEach, mock } from 'bun:test'
import {
  createQuerySerializer,
  getParseAs,
  setAuthParams,
  buildUrl,
  mergeConfigs,
  mergeHeaders,
  createInterceptors,
  createConfig
} from '../src/gen/client/utils.gen.js'
import * as core from '../src/gen/core/auth.gen.js'
import * as pathSerializer from '../src/gen/core/pathSerializer.gen.js'
import * as utils from '../src/gen/core/utils.gen.js'

// Mock the core dependencies
const mockGetAuthToken = mock()
const mockSerializeArrayParam = mock()
const mockSerializeObjectParam = mock()
const mockSerializePrimitiveParam = mock()
const mockGetUrl = mock()

mock.module('../src/gen/core/auth.gen.js', () => ({
  getAuthToken: mockGetAuthToken
}))

mock.module('../src/gen/core/pathSerializer.gen.js', () => ({
  serializeArrayParam: mockSerializeArrayParam,
  serializeObjectParam: mockSerializeObjectParam,
  serializePrimitiveParam: mockSerializePrimitiveParam
}))

mock.module('../src/gen/core/utils.gen.js', () => ({
  getUrl: mockGetUrl
}))

describe('utils.gen', () => {
  beforeEach(() => {
    mockGetAuthToken.mockClear()
    mockSerializeArrayParam.mockClear()
    mockSerializeObjectParam.mockClear()
    mockSerializePrimitiveParam.mockClear()
    mockGetUrl.mockClear()
  })

  describe('createQuerySerializer', () => {
    it('should create a query serializer function', () => {
      const serializer = createQuerySerializer()
      expect(typeof serializer).toBe('function')
    })

    it('should handle empty query params', () => {
      const serializer = createQuerySerializer()
      const result = serializer({})
      expect(result).toBe('')
    })

    it('should handle null query params', () => {
      const serializer = createQuerySerializer()
      const result = serializer(null)
      expect(result).toBe('')
    })

    it('should handle undefined query params', () => {
      const serializer = createQuerySerializer()
      const result = serializer(undefined)
      expect(result).toBe('')
    })

    it('should skip null and undefined values', () => {
      mockSerializePrimitiveParam.mockImplementation((params) => {
        if (params.name === 'name') return 'name=test'
        if (params.name === 'active') return 'active=true'
        return ''
      })
      const serializer = createQuerySerializer()
      const result = serializer({
        name: 'test',
        nullValue: null,
        undefinedValue: undefined,
        active: true
      })
      expect(result).toContain('name=test')
      expect(result).toContain('active=true')
      expect(result).not.toContain('nullValue')
      expect(result).not.toContain('undefinedValue')
    })

    it('should handle array values with explode option', () => {
      mockSerializeArrayParam.mockReturnValue('tags=value1&tags=value2')
      const serializer = createQuerySerializer({
        array: { explode: true, style: 'form' }
      })
      const result = serializer({ tags: ['value1', 'value2'] })
      expect(result).toContain('tags=value1&tags=value2')
      expect(mockSerializeArrayParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        explode: true,
        name: 'tags',
        style: 'form',
        value: ['value1', 'value2'],
        explode: true,
        style: 'form'
      })
    })

    it('should handle object values with explode option', () => {
      mockSerializeObjectParam.mockReturnValue('filter[key]=value')
      const serializer = createQuerySerializer({
        object: { explode: true, style: 'deepObject' }
      })
      const result = serializer({ filter: { key: 'value' } })
      expect(result).toContain('filter[key]=value')
      expect(mockSerializeObjectParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        explode: true,
        name: 'filter',
        style: 'deepObject',
        value: { key: 'value' },
        explode: true,
        style: 'deepObject'
      })
    })

    it('should handle primitive values', () => {
      mockSerializePrimitiveParam.mockReturnValue('name=test')
      const serializer = createQuerySerializer()
      const result = serializer({ name: 'test' })
      expect(result).toContain('name=test')
      expect(mockSerializePrimitiveParam).toHaveBeenCalledWith({
        allowReserved: undefined,
        name: 'name',
        value: 'test'
      })
    })

    it('should respect allowReserved option', () => {
      const serializer = createQuerySerializer({ allowReserved: true })
      const result = serializer({ name: 'test value' })
      expect(mockSerializePrimitiveParam).toHaveBeenCalledWith({
        allowReserved: true,
        name: 'name',
        value: 'test value'
      })
    })

    it('should join multiple parameters with &', () => {
      mockSerializePrimitiveParam.mockReturnValueOnce('name=test').mockReturnValueOnce('active=true')
      const serializer = createQuerySerializer()
      const result = serializer({ name: 'test', active: true })
      expect(result).toBe('name=test&active=true')
    })
  })

  describe('getParseAs', () => {
    it('should return stream for null content type', () => {
      const result = getParseAs(null)
      expect(result).toBe('stream')
    })

    it('should return stream for undefined content type', () => {
      const result = getParseAs(undefined)
      expect(result).toBe('stream')
    })

    it('should return stream for empty content type', () => {
      const result = getParseAs('')
      expect(result).toBe('stream')
    })

    it('should return undefined for content type without clean part', () => {
      const result = getParseAs(' ; charset=utf-8')
      expect(result).toBeUndefined()
    })

    it('should return json for application/json', () => {
      const result = getParseAs('application/json')
      expect(result).toBe('json')
    })

    it('should return json for application/vnd.api+json', () => {
      const result = getParseAs('application/vnd.api+json')
      expect(result).toBe('json')
    })

    it('should return json for content type ending with +json', () => {
      const result = getParseAs('application/hal+json')
      expect(result).toBe('json')
    })

    it('should return formData for multipart/form-data', () => {
      const result = getParseAs('multipart/form-data')
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
      const result = getParseAs('image/png')
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

    it('should return undefined for unknown content type', () => {
      const result = getParseAs('unknown/type')
      expect(result).toBeUndefined()
    })

    it('should handle content type with charset', () => {
      const result = getParseAs('application/json; charset=utf-8')
      expect(result).toBe('json')
    })

    it('should trim whitespace from content type', () => {
      const result = getParseAs('  application/json  ')
      expect(result).toBe('json')
    })
  })

  describe('setAuthParams', () => {
    it('should skip auth if already exists in headers', async () => {
      const headers = new Headers({ Authorization: 'Bearer existing' })
      const options = {
        headers,
        security: [{ name: 'Authorization', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Authorization')).toBe('Bearer existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should skip auth if already exists in query', async () => {
      const headers = new Headers()
      const options = {
        headers,
        query: { api_key: 'existing' },
        security: [{ name: 'api_key', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(options.query?.api_key).toBe('existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should skip auth if already exists in cookie', async () => {
      const headers = new Headers({ Cookie: 'session=existing' })
      const options = {
        headers,
        security: [{ name: 'session', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Cookie')).toContain('session=existing')
      expect(mockGetAuthToken).not.toHaveBeenCalled()
    })

    it('should set auth token in query', async () => {
      mockGetAuthToken.mockResolvedValue('token123')
      const headers = new Headers()
      const options = {
        headers,
        query: {},
        security: [{ name: 'api_key', in: 'query', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(options.query?.api_key).toBe('token123')
      expect(mockGetAuthToken).toHaveBeenCalledWith({ name: 'api_key', in: 'query', scheme: 'bearer' }, undefined)
    })

    it('should set auth token in cookie', async () => {
      mockGetAuthToken.mockResolvedValue('token123')
      const headers = new Headers()
      const options = {
        headers,
        security: [{ name: 'session', in: 'cookie', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Cookie')).toBe('session=token123')
    })

    it('should set auth token in header', async () => {
      mockGetAuthToken.mockResolvedValue('token123')
      const headers = new Headers()
      const options = {
        headers,
        security: [{ name: 'Authorization', in: 'header', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Authorization')).toBe('token123')
    })

    it('should use default Authorization name when not specified', async () => {
      mockGetAuthToken.mockResolvedValue('token123')
      const headers = new Headers()
      const options = {
        headers,
        security: [{ scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Authorization')).toBe('token123')
    })

    it('should skip auth when token is null', async () => {
      mockGetAuthToken.mockResolvedValue(null)
      const headers = new Headers()
      const options = {
        headers,
        security: [{ name: 'Authorization', scheme: 'bearer' }]
      }
      
      await setAuthParams(options as any)
      
      expect(headers.get('Authorization')).toBeNull()
    })

    it('should handle multiple auth methods', async () => {
      mockGetAuthToken.mockResolvedValueOnce('token1').mockResolvedValueOnce('token2')
      const headers = new Headers()
      const options = {
        headers,
        query: {},
        security: [
          { name: 'api_key', in: 'query', scheme: 'bearer' },
          { name: 'Authorization', in: 'header', scheme: 'bearer' }
        ]
      }
      
      await setAuthParams(options as any)
      
      expect(options.query?.api_key).toBe('token1')
      expect(headers.get('Authorization')).toBe('token2')
    })
  })

  describe('buildUrl', () => {
    it('should build URL using getUrl with query serializer', () => {
      const customSerializer = mock().mockReturnValue('param=value')
      const options = {
        baseUrl: 'https://api.example.com',
        path: '/test',
        query: { param: 'value' },
        querySerializer: customSerializer
      }
      
      buildUrl(options as any)
      
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com',
        path: '/test',
        query: { param: 'value' },
        querySerializer: customSerializer,
        url: undefined
      })
    })

    it('should use default query serializer when function not provided', () => {
      const options = {
        baseUrl: 'https://api.example.com',
        path: '/test',
        query: { param: 'value' }
      }
      
      buildUrl(options as any)
      
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com',
        path: '/test',
        query: { param: 'value' },
        querySerializer: expect.any(Function),
        url: undefined
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

    it('should merge headers using mergeHeaders', () => {
      const configA = { headers: { 'A': '1' } }
      const configB = { headers: { 'B': '2' } }
      
      const result = mergeConfigs(configA as any, configB as any)
      
      expect(result.headers).toBeInstanceOf(Headers)
    })
  })

  describe('mergeHeaders', () => {
    it('should merge multiple Headers objects', () => {
      const headers1 = new Headers({ 'A': '1' })
      const headers2 = new Headers({ 'B': '2' })
      const headers3 = new Headers({ 'C': '3' })
      
      const result = mergeHeaders(headers1, headers2, headers3)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('2')
      expect(result.get('C')).toBe('3')
    })

    it('should merge plain objects', () => {
      const headers1 = { 'A': '1' }
      const headers2 = { 'B': '2' }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('2')
    })

    it('should skip undefined headers', () => {
      const result = mergeHeaders(undefined, { 'A': '1' }, null)
      expect(result.get('A')).toBe('1')
    })

    it('should delete header when value is null', () => {
      const headers1 = new Headers({ 'A': '1', 'B': '2' })
      const headers2 = { 'A': null }
      
      const result = mergeHeaders(headers1, headers2)
      
      expect(result.get('A')).toBeNull()
      expect(result.get('B')).toBe('2')
    })

    it('should append array values', () => {
      const headers1 = { 'Multi': ['value1', 'value2'] }
      
      const result = mergeHeaders(headers1)
      
      expect(result.get('Multi')).toBe('value1, value2')
    })

    it('should stringify object values', () => {
      const headers1 = { 'Data': { key: 'value' } }
      
      const result = mergeHeaders(headers1)
      
      expect(result.get('Data')).toBe('{"key":"value"}')
    })

    it('should handle mixed header types', () => {
      const headers1 = new Headers({ 'A': '1' })
      const headers2 = { 'B': '2' }
      const headers3 = null
      const headers4 = { 'C': null }
      
      const result = mergeHeaders(headers1, headers2, headers3, headers4)
      
      expect(result.get('A')).toBe('1')
      expect(result.get('B')).toBe('2')
      expect(result.get('C')).toBeNull()
    })
  })

  describe('createInterceptors', () => {
    it('should create interceptors with error, request, and response handlers', () => {
      const interceptors = createInterceptors()
      
      expect(interceptors).toHaveProperty('error')
      expect(interceptors).toHaveProperty('request')
      expect(interceptors).toHaveProperty('response')
      expect(typeof interceptors.error.use).toBe('function')
      expect(typeof interceptors.request.use).toBe('function')
      expect(typeof interceptors.response.use).toBe('function')
    })
  })

  describe('Interceptor class', () => {
    let interceptors: any

    beforeEach(() => {
      interceptors = createInterceptors()
    })

    it('should use interceptor and return index', () => {
      const fn = mock()
      const index = interceptors.request.use(fn)
      
      expect(index).toBe(0)
      expect(interceptors.request._fns[0]).toBe(fn)
    })

    it('should clear all interceptors', () => {
      interceptors.request.use(mock())
      interceptors.request.use(mock())
      
      interceptors.request.clear()
      
      expect(interceptors.request._fns).toEqual([])
    })

    it('should check if interceptor exists', () => {
      const fn = mock()
      const index = interceptors.request.use(fn)
      
      expect(interceptors.request.exists(index)).toBe(true)
      expect(interceptors.request.exists(fn)).toBe(true)
      expect(interceptors.request.exists(999)).toBe(false)
    })

    it('should eject interceptor by index', () => {
      const fn = mock()
      const index = interceptors.request.use(fn)
      
      interceptors.request.eject(index)
      
      expect(interceptors.request._fns[index]).toBeNull()
    })

    it('should eject interceptor by function', () => {
      const fn = mock()
      interceptors.request.use(fn)
      
      interceptors.request.eject(fn)
      
      expect(interceptors.request._fns[0]).toBeNull()
    })

    it('should update interceptor by index', () => {
      const fn1 = mock()
      const fn2 = mock()
      const index = interceptors.request.use(fn1)
      
      const result = interceptors.request.update(index, fn2)
      
      expect(result).toBe(index)
      expect(interceptors.request._fns[index]).toBe(fn2)
    })

    it('should update interceptor by function', () => {
      const fn1 = mock()
      const fn2 = mock()
      interceptors.request.use(fn1)
      
      const result = interceptors.request.update(fn1, fn2)
      
      expect(result.toString()).toBe(fn2.toString()) // Compare string representations
      expect(interceptors.request._fns[0]).toBe(fn2)
    })

    it('should return false when updating non-existent interceptor', () => {
      const fn = mock()
      
      const result = interceptors.request.update(0, fn)
      
      expect(result).toBe(false)
    })

    it('should return -1 for non-existent interceptor index', () => {
      const result = interceptors.request.getInterceptorIndex(999)
      expect(result).toBe(-1)
    })
  })

  describe('createConfig', () => {
    it('should create default config', () => {
      const config = createConfig()
      
      expect(config).toHaveProperty('parseAs', 'auto')
      expect(config).toHaveProperty('querySerializer')
      expect(config).toHaveProperty('headers')
      expect(typeof config.headers).toBe('object')
    })

    it('should merge override config', () => {
      const override = {
        baseUrl: 'https://custom.api.com',
        parseAs: 'text' as const
      }
      
      const config = createConfig(override as any)
      
      expect(config.baseUrl).toBe('https://custom.api.com')
      expect(config.parseAs).toBe('text')
      expect(typeof config.headers).toBe('object')
    })

    it('should override headers when provided', () => {
      const override = {
        headers: { 'Custom-Header': 'value' }
      }
      
      const config = createConfig(override as any)
      
      expect(config.headers['Custom-Header']).toBe('value')
      // Note: default headers are not merged when override is provided
    })
  })
})
