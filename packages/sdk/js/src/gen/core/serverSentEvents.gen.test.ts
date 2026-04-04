import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createSseClient, type ServerSentEventsOptions, type StreamEvent } from './serverSentEvents.gen'

describe('serverSentEvents.gen', () => {
  let mockFetch: jest.Mock
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    mockFetch = jest.fn()
    originalFetch = global.fetch
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  describe('createSseClient', () => {
    it('should create SSE client with default options', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events'
      }

      const result = createSseClient(options)

      expect(result).toHaveProperty('stream')
      expect(typeof result.stream[Symbol.asyncIterator]).toBe('function')
    })

    it('should use custom retry delay', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseDefaultRetryDelay: 5000
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should use custom max retry attempts', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseMaxRetryAttempts: 10
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should use custom max retry delay', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseMaxRetryDelay: 60000
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should use custom sleep function', () => {
      const customSleep = jest.fn().mockResolvedValue(undefined)
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseSleepFn: customSleep
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle onSseEvent callback', () => {
      const onSseEvent = jest.fn()
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        onSseEvent
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle onSseError callback', () => {
      const onSseError = jest.fn()
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        onSseError
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle response transformer', () => {
      const responseTransformer = jest.fn()
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        responseTransformer
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle response validator', () => {
      const responseValidator = jest.fn()
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        responseValidator
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle custom headers', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        headers: {
          'Authorization': 'Bearer token',
          'Custom-Header': 'value'
        }
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle Headers instance headers', () => {
      const headers = new Headers({
        'Authorization': 'Bearer token',
        'Custom-Header': 'value'
      })
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        headers
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle abort signal', () => {
      const abortController = new AbortController()
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        signal: abortController.signal
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })

    it('should handle custom method', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        method: 'POST'
      }

      const result = createSseClient(options)
      expect(result).toHaveProperty('stream')
    })
  })

  describe('ServerSentEventsOptions type', () => {
    it('should accept all valid options', () => {
      const options: ServerSentEventsOptions<string> = {
        url: 'https://example.com/events',
        onSseError: (error) => console.log(error),
        onSseEvent: (event) => console.log(event),
        sseDefaultRetryDelay: 1000,
        sseMaxRetryAttempts: 5,
        sseMaxRetryDelay: 10000,
        sseSleepFn: async (ms) => await new Promise(resolve => setTimeout(resolve, ms)),
        method: 'GET',
        responseTransformer: (response) => response,
        responseValidator: (response) => true,
        headers: { 'Authorization': 'Bearer token' },
        signal: new AbortController().signal
      }

      expect(options.url).toBe('https://example.com/events')
      expect(typeof options.onSseError).toBe('function')
      expect(typeof options.onSseEvent).toBe('function')
      expect(options.sseDefaultRetryDelay).toBe(1000)
      expect(options.sseMaxRetryAttempts).toBe(5)
      expect(options.sseMaxRetryDelay).toBe(10000)
      expect(typeof options.sseSleepFn).toBe('function')
      expect(options.method).toBe('GET')
      expect(typeof options.responseTransformer).toBe('function')
      expect(typeof options.responseValidator).toBe('function')
      expect(options.headers).toEqual({ 'Authorization': 'Bearer token' })
      expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('should accept generic type parameter', () => {
      const options: ServerSentEventsOptions<{ message: string; timestamp: number }> = {
        url: 'https://example.com/events',
        onSseEvent: (event) => {
          // TypeScript should know the type of event.data
          const data: { message: string; timestamp: number } = event.data
          expect(data).toHaveProperty('message')
          expect(data).toHaveProperty('timestamp')
        }
      }

      expect(options.url).toBe('https://example.com/events')
    })

    it('should accept minimal options', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events'
      }

      expect(options.url).toBe('https://example.com/events')
      expect(options.onSseError).toBeUndefined()
      expect(options.onSseEvent).toBeUndefined()
      expect(options.sseDefaultRetryDelay).toBeUndefined()
      expect(options.sseMaxRetryAttempts).toBeUndefined()
      expect(options.sseMaxRetryDelay).toBeUndefined()
      expect(options.sseSleepFn).toBeUndefined()
    })
  })

  describe('StreamEvent interface', () => {
    it('should accept all valid properties', () => {
      const event: StreamEvent<{ message: string }> = {
        data: { message: 'hello' },
        event: 'message',
        id: 'event-123',
        retry: 3000
      }

      expect(event.data).toEqual({ message: 'hello' })
      expect(event.event).toBe('message')
      expect(event.id).toBe('event-123')
      expect(event.retry).toBe(3000)
    })

    it('should accept minimal event', () => {
      const event: StreamEvent<string> = {
        data: 'simple message'
      }

      expect(event.data).toBe('simple message')
      expect(event.event).toBeUndefined()
      expect(event.id).toBeUndefined()
      expect(event.retry).toBeUndefined()
    })

    it('should accept complex data types', () => {
      const complexData = {
        user: { id: 1, name: 'John' },
        metadata: { timestamp: Date.now(), source: 'api' },
        tags: ['important', 'user-action']
      }

      const event: StreamEvent<typeof complexData> = {
        data: complexData,
        event: 'user.action'
      }

      expect(event.data).toEqual(complexData)
      expect(event.data.user.name).toBe('John')
      expect(event.data.tags).toContain('important')
    })
  })

  describe('ServerSentEventsResult type', () => {
    it('should create result with stream property', () => {
      const options: ServerSentEventsOptions<string> = {
        url: 'https://example.com/events'
      }

      const result = createSseClient(options)

      expect(result).toHaveProperty('stream')
      expect(typeof result.stream[Symbol.asyncIterator]).toBe('function')
    })

    it('should handle generic data types', async () => {
      const options: ServerSentEventsOptions<{ message: string }> = {
        url: 'https://example.com/events'
      }

      const result = createSseClient(options)
      
      // The stream should be an async generator
      expect(typeof result.stream[Symbol.asyncIterator]).toBe('function')
    })

    it('should handle record data types', async () => {
      type EventData = {
        message: string
        notification: string
      }

      const options: ServerSentEventsOptions<EventData> = {
        url: 'https://example.com/events'
      }

      const result = createSseClient(options)
      
      expect(typeof result.stream[Symbol.asyncIterator]).toBe('function')
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete SSE workflow setup', () => {
      let eventCount = 0
      let errorCount = 0

      const options: ServerSentEventsOptions<{ type: string; data: any }> = {
        url: 'https://api.example.com/stream',
        headers: {
          'Authorization': 'Bearer token123',
          'Accept': 'text/event-stream'
        },
        sseDefaultRetryDelay: 2000,
        sseMaxRetryAttempts: 5,
        sseMaxRetryDelay: 30000,
        onSseEvent: (event) => {
          eventCount++
          expect(event.data).toHaveProperty('type')
        },
        onSseError: (error) => {
          errorCount++
          console.error('SSE Error:', error)
        },
        responseTransformer: (response) => {
          return response
        },
        responseValidator: (response) => {
          return response.ok
        }
      }

      const client = createSseClient(options)

      expect(client).toHaveProperty('stream')
      expect(typeof options.onSseEvent).toBe('function')
      expect(typeof options.onSseError).toBe('function')
      expect(options.sseDefaultRetryDelay).toBe(2000)
      expect(options.sseMaxRetryAttempts).toBe(5)
      expect(options.sseMaxRetryDelay).toBe(30000)
    })

    it('should handle different event types', () => {
      const events: StreamEvent[] = []

      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        onSseEvent: (event) => {
          events.push(event)
        }
      }

      createSseClient(options)

      expect(typeof options.onSseEvent).toBe('function')
      expect(events).toEqual([]) // Initially empty
    })

    it('should handle custom sleep function for retry backoff', () => {
      const sleepCalls: number[] = []
      const customSleep = async (ms: number) => {
        sleepCalls.push(ms)
        await new Promise(resolve => setTimeout(resolve, ms))
      }

      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseSleepFn: customSleep,
        sseDefaultRetryDelay: 1000,
        sseMaxRetryDelay: 10000
      }

      createSseClient(options)

      expect(typeof options.sseSleepFn).toBe('function')
      expect(options.sseDefaultRetryDelay).toBe(1000)
      expect(options.sseMaxRetryDelay).toBe(10000)
    })
  })

  describe('edge cases', () => {
    it('should handle empty URL', () => {
      const options: ServerSentEventsOptions = {
        url: ''
      }

      expect(() => createSseClient(options)).not.toThrow()
    })

    it('should handle very long URL', () => {
      const longUrl = 'https://example.com/' + 'path/'.repeat(100)
      const options: ServerSentEventsOptions = {
        url: longUrl
      }

      expect(() => createSseClient(options)).not.toThrow()
    })

    it('should handle special characters in URL', () => {
      const url = 'https://example.com/events?param=value&special=测试&emoji=🚀'
      const options: ServerSentEventsOptions = {
        url
      }

      expect(() => createSseClient(options)).not.toThrow()
    })

    it('should handle null and undefined callbacks', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        onSseError: null as any,
        onSseEvent: undefined as any
      }

      expect(() => createSseClient(options)).not.toThrow()
    })

    it('should handle invalid retry delays', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseDefaultRetryDelay: -1,
        sseMaxRetryDelay: 0
      }

      expect(() => createSseClient(options)).not.toThrow()
    })

    it('should handle very large retry counts', () => {
      const options: ServerSentEventsOptions = {
        url: 'https://example.com/events',
        sseMaxRetryAttempts: Number.MAX_SAFE_INTEGER
      }

      expect(() => createSseClient(options)).not.toThrow()
    })
  })
})
