import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createClient } from '../src/gen/client/client.gen.js'
import type { Client, Config, RequestOptions } from '../src/gen/client/types.gen.js'
import * as utils from '../src/gen/client/utils.gen.js'
import * as core from '../src/gen/core/serverSentEvents.gen.js'

// Mock all dependencies
const mockBuildUrl = mock(() => 'https://api.example.com/test')
const mockCreateConfig = mock(() => ({ baseUrl: 'https://api.example.com' }))
const mockCreateInterceptors = mock(() => ({
  request: { _fns: [] },
  response: { _fns: [] },
  error: { _fns: [] }
}))
const mockGetParseAs = mock(() => 'json')
const mockMergeConfigs = mock((defaultConfig, userConfig) => ({ ...defaultConfig, ...userConfig }))
const mockMergeHeaders = mock((headers1, headers2) => new Headers({ ...headers1, ...headers2 }))
const mockSetAuthParams = mock()
const mockCreateSseClient = mock()

// Mock the utils module
mock.module('../src/gen/client/utils.gen.js', () => ({
  buildUrl: mockBuildUrl,
  createConfig: mockCreateConfig,
  createInterceptors: mockCreateInterceptors,
  getParseAs: mockGetParseAs,
  mergeConfigs: mockMergeConfigs,
  mergeHeaders: mockMergeHeaders,
  setAuthParams: mockSetAuthParams
}))

// Mock the core module
mock.module('../src/gen/core/serverSentEvents.gen.js', () => ({
  createSseClient: mockCreateSseClient
}))

describe('createClient', () => {
  let client: Client
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    mockFetch = mock()
    global.fetch = mockFetch

    // Reset all mocks
    mockBuildUrl.mockClear()
    mockCreateConfig.mockClear()
    mockCreateInterceptors.mockClear()
    mockGetParseAs.mockClear()
    mockMergeConfigs.mockClear()
    mockMergeHeaders.mockClear()
    mockSetAuthParams.mockClear()
    mockCreateSseClient.mockClear()

    // Setup default mock behavior
    mockCreateConfig.mockReturnValue({ baseUrl: 'https://api.example.com' })
    mockMergeHeaders.mockReturnValue(new Headers())
    mockBuildUrl.mockReturnValue('https://api.example.com/test')
    mockGetParseAs.mockReturnValue('json')

    client = createClient({
      baseUrl: 'https://api.example.com',
      fetch: mockFetch
    })
  })

  afterEach(() => {
    // @ts-ignore
    global.fetch = undefined
  })

  it('should create client with default config', () => {
    expect(client).toBeDefined()
    expect(typeof client.request).toBe('function')
    expect(typeof client.get).toBe('function')
    expect(typeof client.post).toBe('function')
    expect(typeof client.getConfig).toBe('function')
    expect(typeof client.setConfig).toBe('function')
  })

  it('should merge default config with user config', () => {
    const userConfig = { baseUrl: 'https://custom.api.com', timeout: 5000 }
    createClient(userConfig)

    expect(mockCreateConfig).toHaveBeenCalled()
    expect(mockMergeConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      userConfig
    )
  })

  it('should provide getConfig method', () => {
    const config = client.getConfig()
    expect(config).toBeDefined()
    expect(typeof config).toBe('object')
  })

  it('should provide setConfig method', () => {
    const newConfig = { timeout: 10000 }
    const updatedConfig = client.setConfig(newConfig)

    expect(updatedConfig).toBeDefined()
    expect(mockMergeConfigs).toHaveBeenCalled()
  })

  describe('request method', () => {
    it('should handle successful JSON response', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: { data: 'test' },
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle successful text response', async () => {
      mockGetParseAs.mockReturnValue('text')
      const mockResponse = new Response('plain text', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        parseAs: 'text'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: 'plain text',
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle 204 response', async () => {
      const mockResponse = new Response(null, {
        status: 204,
        headers: { 'Content-Length': '0' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'DELETE'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: {},
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle response with data style', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        responseStyle: 'data'
      }

      const result = await client.request(options)

      expect(result).toEqual({ data: 'test' })
    })

    it('should handle stream response', async () => {
      mockGetParseAs.mockReturnValue('stream')
      const mockStream = new ReadableStream()
      const mockResponse = new Response(mockStream, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        parseAs: 'stream'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: mockStream,
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle arrayBuffer response', async () => {
      mockGetParseAs.mockReturnValue('arrayBuffer')
      const mockArrayBuffer = new ArrayBuffer(8)
      const mockResponse = new Response(mockArrayBuffer, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        parseAs: 'arrayBuffer'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: mockArrayBuffer,
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle blob response', async () => {
      mockGetParseAs.mockReturnValue('blob')
      const mockBlob = new Blob(['test'], { type: 'text/plain' })
      const mockResponse = new Response(mockBlob, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        parseAs: 'blob'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        data: mockBlob,
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle error response', async () => {
      const mockResponse = new Response('{"error": "Not found"}', {
        status: 404,
        statusText: 'Not Found'
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET'
      }

      const result = await client.request(options)

      expect(result).toEqual({
        error: { error: 'Not found' },
        request: expect.any(Request),
        response: mockResponse
      })
    })

    it('should handle error response with data style', async () => {
      const mockResponse = new Response('Error message', {
        status: 400
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        responseStyle: 'data'
      }

      const result = await client.request(options)

      expect(result).toBeUndefined()
    })

    it('should throw error when throwOnError is true', async () => {
      const mockResponse = new Response('Error message', {
        status: 400
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        throwOnError: true
      }

      await expect(client.request(options)).rejects.toEqual('Error message')
    })

    it('should handle request interceptors', async () => {
      const mockRequest = new Request('https://api.example.com/test')
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const interceptor = mock().mockResolvedValue(mockRequest)
      mockCreateInterceptors.mockReturnValue({
        request: { _fns: [interceptor] },
        response: { _fns: [] },
        error: { _fns: [] }
      })

      const client = createClient()
      await client.request({ url: '/test', method: 'GET' })

      expect(interceptor).toHaveBeenCalledWith(mockRequest, expect.any(Object))
    })

    it('should handle response interceptors', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      const mockModifiedResponse = new Response('{"modified": true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const interceptor = mock().mockResolvedValue(mockModifiedResponse)
      mockCreateInterceptors.mockReturnValue({
        request: { _fns: [] },
        response: { _fns: [interceptor] },
        error: { _fns: [] }
      })

      const client = createClient()
      await client.request({ url: '/test', method: 'GET' })

      expect(interceptor).toHaveBeenCalledWith(mockResponse, expect.any(Request), expect.any(Object))
    })

    it('should handle error interceptors', async () => {
      const mockResponse = new Response('Error', { status: 400 })
      mockFetch.mockResolvedValue(mockResponse)

      const interceptor = mock().mockResolvedValue('Modified error')
      mockCreateInterceptors.mockReturnValue({
        request: { _fns: [] },
        response: { _fns: [] },
        error: { _fns: [interceptor] }
      })

      const client = createClient()
      const result = await client.request({ url: '/test', method: 'GET' })

      expect(interceptor).toHaveBeenCalledWith('Error', mockResponse, expect.any(Request), expect.any(Object))
      expect(result.error).toBe('Modified error')
    })

    it('should handle security parameters', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        security: { bearer: ['token'] }
      }

      await client.request(options)

      expect(mockSetAuthParams).toHaveBeenCalled()
    })

    it('should handle request validator', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const validator = mock()
      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        requestValidator: validator
      }

      await client.request(options)

      expect(validator).toHaveBeenCalled()
    })

    it('should handle body serializer', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const serializer = mock().mockReturnValue('serialized body')
      const options: RequestOptions = {
        url: '/test',
        method: 'POST',
        body: { data: 'test' },
        bodySerializer: serializer
      }

      await client.request(options)

      expect(serializer).toHaveBeenCalledWith({ data: 'test' })
    })

    it('should handle response validator', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const validator = mock()
      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        responseValidator: validator
      }

      await client.request(options)

      expect(validator).toHaveBeenCalledWith({ data: 'test' })
    })

    it('should handle response transformer', async () => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const transformer = mock().mockResolvedValue({ transformed: true })
      const options: RequestOptions = {
        url: '/test',
        method: 'GET',
        responseTransformer: transformer
      }

      const result = await client.request(options)

      expect(transformer).toHaveBeenCalledWith({ data: 'test' })
      expect(result.data).toEqual({ transformed: true })
    })

    it('should remove Content-Type header for empty body', async () => {
      const mockResponse = new Response('', {
        status: 200,
        headers: { 'Content-Length': '0' }
      })
      mockFetch.mockResolvedValue(mockResponse)

      const headers = new Headers({ 'Content-Type': 'application/json' })
      const deleteSpy = mock(headers.delete.bind(headers))
      headers.delete = deleteSpy

      mockMergeHeaders.mockReturnValue(headers)
      mockBuildUrl.mockReturnValue('https://api.example.com/test')
      mockGetParseAs.mockReturnValue('json')

      const options: RequestOptions = {
        url: '/test',
        method: 'POST',
        body: undefined,
        parseAs: 'auto'
      }

      await client.request(options)

      expect(deleteSpy).toHaveBeenCalledWith('Content-Type')
    })
  })

  describe('HTTP methods', () => {
    beforeEach(() => {
      const mockResponse = new Response('{"data": "test"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      mockFetch.mockResolvedValue(mockResponse)
    })

    it('should provide GET method', async () => {
      await client.get({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide POST method', async () => {
      await client.post({ url: '/test', body: { data: 'test' } })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide PUT method', async () => {
      await client.put({ url: '/test', body: { data: 'test' } })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide PATCH method', async () => {
      await client.patch({ url: '/test', body: { data: 'test' } })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide DELETE method', async () => {
      await client.delete({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide HEAD method', async () => {
      await client.head({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide OPTIONS method', async () => {
      await client.options({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide CONNECT method', async () => {
      await client.connect({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should provide TRACE method', async () => {
      await client.trace({ url: '/test' })
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('SSE functionality', () => {
    it('should provide SSE functionality for GET', async () => {
      const mockSseClient = { connect: mock() }
      mockCreateSseClient.mockReturnValue(mockSseClient)

      const result = await client.get.sse({ url: '/events' })

      expect(mockCreateSseClient).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.any(String)
        })
      )
      expect(result).toBe(mockSseClient)
    })

    it('should provide SSE functionality for POST', async () => {
      const mockSseClient = { connect: mock() }
      mockCreateSseClient.mockReturnValue(mockSseClient)

      const result = await client.post.sse({ url: '/events', body: { data: 'test' } })

      expect(mockCreateSseClient).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: expect.any(String)
        })
      )
      expect(result).toBe(mockSseClient)
    })
  })

  describe('buildUrl functionality', () => {
    it('should provide buildUrl method', () => {
      expect(typeof client.buildUrl).toBe('function')
      expect(client.buildUrl).toBe(mockBuildUrl)
    })
  })
})
