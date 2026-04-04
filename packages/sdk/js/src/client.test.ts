import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createOpencodeClient } from './client'

// Mock the generated modules for testing
const mockCreateClient = mock(() => ({
  request: mock(),
  get: mock(),
  post: mock()
}))

const mockOpencodeClient = mock(({ client }: any) => ({
  client,
  methods: ['method1', 'method2']
}))

// Mock the generated modules
mock.module('./gen/client/client.gen.js', () => ({
  createClient: mockCreateClient
}))

mock.module('./gen/sdk.gen.js', () => ({
  OpencodeClient: mockOpencodeClient
}))

describe('createOpencodeClient', () => {
  beforeEach(() => {
    mockCreateClient.mockClear()
    mockOpencodeClient.mockClear()

    // Setup default mock behavior
    mockCreateClient.mockReturnValue({
      request: mock(),
      get: mock(),
      post: mock()
    })

    mockOpencodeClient.mockImplementation(({ client }) => ({
      client,
      methods: ['method1', 'method2']
    }))
  })

  it('should create client with default config when no config provided', () => {
    const client = createOpencodeClient()

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function)
      })
    )
    expect(mockOpencodeClient).toHaveBeenCalledWith({
      client: expect.any(Object)
    })
  })

  it('should create client with provided config', () => {
    const config = {
      baseUrl: 'https://api.example.com',
      headers: { 'Authorization': 'Bearer token' }
    }

    const client = createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        ...config,
        fetch: expect.any(Function)
      })
    )
  })

  it('should use existing fetch when provided in config', () => {
    const customFetch = mock()
    const config = {
      fetch: customFetch
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: customFetch
      })
    )
  })

  it('should create custom fetch when none provided', () => {
    createOpencodeClient()

    const createClientCall = mockCreateClient.mock.calls[0][0]
    expect(createClientCall.fetch).toBeInstanceOf(Function)
  })

  it('should set timeout to false in custom fetch', async () => {
    const mockRequest = { timeout: true }
    const mockResponse = new Response('test')
    const originalFetch = globalThis.fetch

    globalThis.fetch = mock().mockResolvedValue(mockResponse)

    createOpencodeClient()

    const createClientCall = mockCreateClient.mock.calls[0][0]
    const customFetch = createClientCall.fetch

    await customFetch(mockRequest)

    expect(mockRequest.timeout).toBe(false)
    expect(globalThis.fetch).toHaveBeenCalledWith(mockRequest)

    globalThis.fetch = originalFetch
  })

  it('should add directory header when directory provided', () => {
    const config = {
      directory: '/path/to/directory'
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'x-opencode-directory': encodeURIComponent('/path/to/directory')
        }
      })
    )
  })

  it('should encode directory header properly', () => {
    const testCases = [
      { directory: '/path/to/directory', expected: '%2Fpath%2Fto%2Fdirectory' },
      { directory: 'C:\\Users\\Test', expected: 'C%3A%5CUsers%5CTest' },
      { directory: 'path with spaces', expected: 'path%20with%20spaces' },
      { directory: 'path/with/special&chars', expected: 'path%2Fwith%2Fspecial%26chars' }
    ]

    testCases.forEach(({ directory, expected }) => {
      mockCreateClient.mockClear()
      createOpencodeClient({ directory })

      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'x-opencode-directory': expected
          }
        })
      )
    })
  })

  it('should merge headers when directory and other headers provided', () => {
    const config = {
      directory: '/test/path',
      headers: {
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      }
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json',
          'x-opencode-directory': encodeURIComponent('/test/path')
        }
      })
    )
  })

  it('should not add directory header when directory not provided', () => {
    const config = {
      headers: { 'Authorization': 'Bearer token' }
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer token'
        }
      })
    )
  })

  it('should handle empty directory string', () => {
    const config = {
      directory: ''
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: '',
        fetch: expect.any(Function)
      })
    )
    // Should not add x-opencode-directory header for empty string
    expect(mockCreateClient).not.toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-opencode-directory': expect.any(String)
        })
      })
    )
  })

  it('should handle directory with special characters', () => {
    const config = {
      directory: '/path/with spaces & special@chars#'
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'x-opencode-directory': encodeURIComponent('/path/with spaces & special@chars#')
        }
      })
    )
  })

  it('should preserve other config options when adding directory', () => {
    const config = {
      directory: '/test',
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      headers: { 'Auth': 'token' }
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: '/test',
        baseUrl: 'https://api.example.com',
        timeout: 5000,
        headers: {
          'Auth': 'token',
          'x-opencode-directory': encodeURIComponent('/test')
        },
        fetch: expect.any(Function)
      })
    )
  })

  it('should return OpencodeClient instance', () => {
    const client = createOpencodeClient()

    expect(mockOpencodeClient).toHaveBeenCalled()
    expect(client).toBeDefined()
    expect(typeof client).toBe('object')
  })

  it('should pass the created client to OpencodeClient', () => {
    const mockBaseClient = { request: mock() }
    mockCreateClient.mockReturnValue(mockBaseClient)

    createOpencodeClient()

    expect(mockOpencodeClient).toHaveBeenCalledWith({
      client: mockBaseClient
    })
  })

  it('should handle undefined config gracefully', () => {
    expect(() => createOpencodeClient(undefined as any)).not.toThrow()
    expect(mockCreateClient).toHaveBeenCalled()
  })

  it('should handle null config gracefully', () => {
    expect(() => createOpencodeClient(null as any)).not.toThrow()
    expect(mockCreateClient).toHaveBeenCalled()
  })

  it('should handle config with only directory', () => {
    const config = { directory: '/test' }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: '/test',
        headers: {
          'x-opencode-directory': encodeURIComponent('/test')
        },
        fetch: expect.any(Function)
      })
    )
  })

  it('should handle config with only fetch', () => {
    const customFetch = mock()
    const config = { fetch: customFetch }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: customFetch
      })
    )
  })

  it('should handle config with only headers', () => {
    const config = {
      headers: { 'Custom-Header': 'value' }
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Custom-Header': 'value' },
        fetch: expect.any(Function)
      })
    )
  })

  it('should create custom fetch that preserves request properties', async () => {
    const mockRequest = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test": "data"}',
      timeout: true
    }
    const mockResponse = new Response('success')
    const originalFetch = global.fetch

    global.fetch = mock().mockResolvedValue(mockResponse)

    createOpencodeClient()

    const createClientCall = mockCreateClient.mock.calls[0][0]
    const customFetch = createClientCall.fetch

    const result = await customFetch(mockRequest)

    expect(mockRequest.timeout).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith(mockRequest)
    expect(result).toBe(mockResponse)

    global.fetch = originalFetch
  })

  it('should handle fetch errors gracefully', async () => {
    const mockRequest = { timeout: true }
    const originalFetch = global.fetch

    global.fetch = mock().mockRejectedValue(new Error('Network error'))

    createOpencodeClient()

    const createClientCall = mockCreateClient.mock.calls[0][0]
    const customFetch = createClientCall.fetch

    await expect(customFetch(mockRequest)).rejects.toThrow('Network error')
    expect(mockRequest.timeout).toBe(false)

    global.fetch = originalFetch
  })

  it('should handle complex directory paths', () => {
    const complexPaths = [
      '/very/long/path/with/many/segments',
      'C:\\Program Files\\Application\\Data',
      './relative/path/./with/./dots',
      '/path/with/unicode/🚀/and/émojis',
      '/path/with/quotes"and/apostrophes\''
    ]

    complexPaths.forEach(directory => {
      mockCreateClient.mockClear()
      createOpencodeClient({ directory })

      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'x-opencode-directory': encodeURIComponent(directory)
          }
        })
      )
    })
  })

  it('should merge headers correctly with existing x-opencode-directory', () => {
    const config = {
      directory: '/test',
      headers: {
        'x-opencode-directory': 'should-be-overwritten',
        'other-header': 'should-remain'
      }
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'x-opencode-directory': encodeURIComponent('/test'),
          'other-header': 'should-remain'
        }
      })
    )
  })

  it('should handle config object spread correctly', () => {
    const config = {
      baseUrl: 'https://api.test.com',
      timeout: 10000,
      retries: 3,
      directory: '/api/v1'
    }

    createOpencodeClient(config)

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://api.test.com',
        timeout: 10000,
        retries: 3,
        directory: '/api/v1',
        headers: {
          'x-opencode-directory': encodeURIComponent('/api/v1')
        },
        fetch: expect.any(Function)
      })
    )
  })
})
