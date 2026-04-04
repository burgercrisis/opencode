import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { NamedError } from './error'

describe('NamedError', () => {
  describe('create method', () => {
    it('should create a new error class with specified name and schema', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string(),
        code: z.number()
      }))

      expect(TestError.name).toBe('TestError')
      expect(TestError.Schema).toBeDefined()
    })

    it('should create error instances with correct properties', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string(),
        code: z.number()
      }))

      const error = new TestError({ message: 'test message', code: 123 })

      expect(error).toBeInstanceOf(NamedError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('TestError')
      expect(error.message).toBe('TestError')
      expect(error.data).toEqual({ message: 'test message', code: 123 })
    })

    it('should support ErrorOptions in constructor', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const cause = new Error('cause')
      const error = new TestError({ message: 'test' }, { cause })

      expect(error.cause).toBe(cause)
    })

    it('should have static isInstance method', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const AnotherError = NamedError.create('AnotherError', z.object({
        message: z.string()
      }))

      const testError = new TestError({ message: 'test' })
      const anotherError = new AnotherError({ message: 'test' })
      const plainError = new Error('test')

      expect(TestError.isInstance(testError)).toBe(true)
      expect(TestError.isInstance(anotherError)).toBe(false)
      expect(TestError.isInstance(plainError)).toBe(false)
      expect(TestError.isInstance(null)).toBe(false)
      expect(TestError.isInstance(undefined)).toBe(false)
      expect(TestError.isInstance({})).toBe(false)
      expect(TestError.isInstance({ name: 'TestError' })).toBe(false)
    })

    it('should have schema method that returns the schema', () => {
      const schema = z.object({
        message: z.string(),
        code: z.number()
      })
      const TestError = NamedError.create('TestError', schema)

      const error = new TestError({ message: 'test', code: 123 })
      expect(error.schema()).toBe(schema)
    })

    it('should have toObject method that returns serialized form', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string(),
        code: z.number()
      }))

      const error = new TestError({ message: 'test message', code: 123 })
      const obj = error.toObject()

      expect(obj).toEqual({
        name: 'TestError',
        data: { message: 'test message', code: 123 }
      })
    })

    it('should validate data against schema', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string(),
        code: z.number()
      }))

      // Valid data should work
      expect(() => new TestError({ message: 'test', code: 123 })).not.toThrow()

      // Invalid data should throw
      expect(() => new TestError({ message: 'test', code: 'invalid' as any })).toThrow()
    })

    it('should support complex schemas', () => {
      const ComplexError = NamedError.create('ComplexError', z.object({
        user: z.object({
          id: z.number(),
          name: z.string()
        }),
        metadata: z.record(z.any()),
        tags: z.array(z.string()).optional()
      }))

      const data = {
        user: { id: 1, name: 'John' },
        metadata: { key: 'value' },
        tags: ['tag1', 'tag2']
      }

      const error = new ComplexError(data)
      expect(error.data).toEqual(data)
    })

    it('should support union schemas', () => {
      const UnionError = NamedError.create('UnionError', z.union([
        z.object({ type: z.literal('error'), message: z.string() }),
        z.object({ type: z.literal('warning'), message: z.string() })
      ]))

      const error1 = new UnionError({ type: 'error', message: 'error message' })
      const error2 = new UnionError({ type: 'warning', message: 'warning message' })

      expect(error1.data.type).toBe('error')
      expect(error2.data.type).toBe('warning')
    })

    it('should support optional fields', () => {
      const OptionalError = NamedError.create('OptionalError', z.object({
        required: z.string(),
        optional: z.string().optional()
      }))

      const error1 = new OptionalError({ required: 'test' })
      const error2 = new OptionalError({ required: 'test', optional: 'optional' })

      expect(error1.data.optional).toBeUndefined()
      expect(error2.data.optional).toBe('optional')
    })

    it('should support transform and refine in schema', () => {
      const TransformError = NamedError.create('TransformError', z.object({
        email: z.string().email().transform(val => val.toLowerCase()),
        age: z.number().refine(val => val >= 0, 'Age must be non-negative')
      }))

      const error = new TransformError({ email: 'TEST@EXAMPLE.COM', age: 25 })
      expect(error.data.email).toBe('test@example.com')
      expect(error.data.age).toBe(25)

      expect(() => new TransformError({ email: 'invalid', age: -1 })).toThrow()
    })
  })

  describe('abstract class behavior', () => {
    it('should require implementation of abstract methods', () => {
      // Can't instantiate abstract class directly
      expect(() => new (NamedError as any)()).toThrow()
    })

    it('should work with custom error classes extending NamedError', () => {
      class CustomError extends NamedError {
        schema() {
          return z.object({ message: z.string() })
        }
        
        toObject() {
          return { name: 'CustomError', data: { message: 'custom' } }
        }
      }

      const error = new CustomError({ message: 'test' } as any)
      expect(error).toBeInstanceOf(NamedError)
      expect(error.toObject()).toEqual({ name: 'CustomError', data: { message: 'custom' } })
    })
  })

  describe('Unknown error type', () => {
    it('should create Unknown error class', () => {
      expect(NamedError.Unknown).toBeDefined()
      expect(NamedError.Unknown.name).toBe('UnknownError')
    })

    it('should create Unknown error instances', () => {
      const error = new NamedError.Unknown({ message: 'unknown error occurred' })

      expect(error).toBeInstanceOf(NamedError)
      expect(error.name).toBe('UnknownError')
      expect(error.data).toEqual({ message: 'unknown error occurred' })
    })

    it('should validate Unknown error data', () => {
      expect(() => new NamedError.Unknown({ message: 'valid message' })).not.toThrow()
      expect(() => new NamedError.Unknown({ message: 123 as any })).toThrow()
      expect(() => new NamedError.Unknown({} as any)).toThrow()
    })

    it('should have Unknown error schema', () => {
      const schema = NamedError.Unknown.Schema
      expect(schema).toBeDefined()
      
      const validData = { message: 'test' }
      expect(schema.parse(validData)).toEqual(validData)
    })

    it('should use Unknown error isInstance method', () => {
      const unknownError = new NamedError.Unknown({ message: 'test' })
      const otherError = new (NamedError.create('Other', z.object({ message: z.string() })))({ message: 'test' })

      expect(NamedError.Unknown.isInstance(unknownError)).toBe(true)
      expect(NamedError.Unknown.isInstance(otherError)).toBe(false)
    })
  })

  describe('schema metadata', () => {
    it('should include ref metadata in schema', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const schema = TestError.Schema
      expect(schema._def.meta).toEqual({ ref: 'TestError' })
    })

    it('should preserve metadata through schema operations', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const extendedSchema = TestError.Schema.extend({
        extra: z.string()
      })

      expect(extendedSchema._def.meta).toEqual({ ref: 'TestError' })
    })
  })

  describe('error inheritance and instanceof', () => {
    it('should maintain proper inheritance chain', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const error = new TestError({ message: 'test' })

      expect(error).toBeInstanceOf(TestError)
      expect(error).toBeInstanceOf(NamedError)
      expect(error).toBeInstanceOf(Error)
    })

    it('should work with try/catch blocks', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      try {
        throw new TestError({ message: 'test error' })
      } catch (error) {
        expect(TestError.isInstance(error)).toBe(true)
        expect(error.name).toBe('TestError')
      }
    })

    it('should work with Promise rejection', async () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string()
      }))

      const promise = Promise.reject(new TestError({ message: 'async error' }))

      try {
        await promise
      } catch (error) {
        expect(TestError.isInstance(error)).toBe(true)
        expect(error.name).toBe('TestError')
      }
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle empty string names', () => {
      const EmptyNameError = NamedError.create('', z.object({
        message: z.string()
      }))

      expect(EmptyNameError.name).toBe('')
    })

    it('should handle special characters in names', () => {
      const SpecialNameError = NamedError.create('Error-With_Special.Chars', z.object({
        message: z.string()
      }))

      expect(SpecialNameError.name).toBe('Error-With_Special.Chars')
    })

    it('should handle very long names', () => {
      const longName = 'A'.repeat(1000)
      const LongNameError = NamedError.create(longName, z.object({
        message: z.string()
      }))

      expect(LongNameError.name).toBe(longName)
    })

    it('should handle null/undefined data gracefully', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string().optional()
      }))

      expect(() => new TestError(null as any)).toThrow()
      expect(() => new TestError(undefined as any)).toThrow()
    })

    it('should handle circular references in data', () => {
      const TestError = NamedError.create('TestError', z.object({
        obj: z.any()
      }))

      const circular: any = { prop: 'value' }
      circular.self = circular

      const error = new TestError({ obj: circular })
      expect(error.data.obj).toBe(circular)
    })
  })

  describe('serialization and deserialization', () => {
    it('should serialize to JSON correctly', () => {
      const TestError = NamedError.create('TestError', z.object({
        message: z.string(),
        code: z.number()
      }))

      const error = new TestError({ message: 'test', code: 123 })
      const serialized = JSON.stringify(error.toObject())
      const deserialized = JSON.parse(serialized)

      expect(deserialized).toEqual({
        name: 'TestError',
        data: { message: 'test', code: 123 }
      })
    })

    it('should handle complex data serialization', () => {
      const ComplexError = NamedError.create('ComplexError', z.object({
        date: z.date(),
        buffer: z.instanceof(Uint8Array),
        set: z.set(z.string())
      }))

      const data = {
        date: new Date('2023-01-01'),
        buffer: new Uint8Array([1, 2, 3]),
        set: new Set(['a', 'b', 'c'])
      }

      const error = new ComplexError(data)
      const obj = error.toObject()

      expect(obj.name).toBe('ComplexError')
      expect(obj.data.date).toBe(data.date)
      expect(obj.data.buffer).toBe(data.buffer)
      expect(obj.data.set).toBe(data.set)
    })
  })
})
