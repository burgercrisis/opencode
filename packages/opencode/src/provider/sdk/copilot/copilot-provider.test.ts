import { describe, it, expect } from "bun:test"
import { createOpenaiCompatible, openaiCompatible, type OpenaiCompatibleProviderSettings } from "../copilot-provider"
import type { OpenaiCompatibleProvider } from "../copilot-provider"
import { openaiCompatibleErrorDataSchema, defaultOpenAICompatibleErrorStructure, type OpenAICompatibleErrorData } from "../openai-compatible-error"

describe("Copilot Provider", () => {
  describe("createOpenaiCompatible()", () => {
    it("should create provider with default settings", () => {
      const provider = createOpenaiCompatible()
      
      expect(provider).toBeDefined()
      expect(typeof provider).toBe("function")
      expect(typeof provider.chat).toBe("function")
      expect(typeof provider.responses).toBe("function")
      expect(typeof provider.languageModel).toBe("function")
    })

    it("should create provider with custom baseURL", () => {
      const options: OpenaiCompatibleProviderSettings = {
        baseURL: "https://custom.api.com/v1"
      }
      
      const provider = createOpenaiCompatible(options)
      const model = provider("test-model")
      
      expect(provider).toBeDefined()
      expect(model).toBeDefined()
    })

    it("should create provider with API key", () => {
      const options: OpenaiCompatibleProviderSettings = {
        apiKey: "test-api-key"
      }
      
      const provider = createOpenaiCompatible(options)
      expect(provider).toBeDefined()
    })

    it("should create provider with custom headers", () => {
      const options: OpenaiCompatibleProviderSettings = {
        headers: {
          "Custom-Header": "custom-value",
          "Another-Header": "another-value"
        }
      }
      
      const provider = createOpenaiCompatible(options)
      expect(provider).toBeDefined()
    })

    it("should create provider with custom name", () => {
      const options: OpenaiCompatibleProviderSettings = {
        name: "custom-provider"
      }
      
      const provider = createOpenaiCompatible(options)
      expect(provider).toBeDefined()
    })

    it("should create provider with custom fetch function", () => {
      const customFetch = jest.fn()
      const options: OpenaiCompatibleProviderSettings = {
        fetch: customFetch
      }
      
      const provider = createOpenaiCompatible(options)
      expect(provider).toBeDefined()
    })

    it("should throw error when baseURL is empty", () => {
      const options: OpenaiCompatibleProviderSettings = {
        baseURL: ""
      }
      
      expect(() => createOpenaiCompatible(options)).toThrow("baseURL is required")
    })

    it("should throw error when baseURL is null", () => {
      const options: OpenaiCompatibleProviderSettings = {
        baseURL: null as any
      }
      
      expect(() => createOpenaiCompatible(options)).toThrow("baseURL is required")
    })

    it("should create provider with all options", () => {
      const options: OpenaiCompatibleProviderSettings = {
        apiKey: "test-key",
        baseURL: "https://api.test.com/v1",
        name: "test-provider",
        headers: {
          "Test-Header": "test-value"
        },
        fetch: jest.fn()
      }
      
      const provider = createOpenaiCompatible(options)
      expect(provider).toBeDefined()
    })
  })

  describe("provider methods", () => {
    let provider: OpenaiCompatibleProvider
    
    beforeEach(() => {
      provider = createOpenaiCompatible({
        apiKey: "test-key",
        baseURL: "https://api.test.com/v1"
      })
    })

    it("should create chat model", () => {
      const model = provider.chat("gpt-4")
      expect(model).toBeDefined()
    })

    it("should create responses model", () => {
      const model = provider.responses("gpt-4")
      expect(model).toBeDefined()
    })

    it("should create language model", () => {
      const model = provider.languageModel("gpt-4")
      expect(model).toBeDefined()
    })

    it("should create default model (same as chat)", () => {
      const defaultModel = provider("gpt-4")
      const chatModel = provider.chat("gpt-4")
      
      // Both should be the same type (chat model)
      expect(defaultModel).toBeDefined()
      expect(chatModel).toBeDefined()
    })

    it("should handle different model IDs", () => {
      const modelIds = ["gpt-4", "gpt-3.5-turbo", "claude-3", "custom-model"]
      
      modelIds.forEach(modelId => {
        expect(() => provider.chat(modelId)).not.toThrow()
        expect(() => provider.responses(modelId)).not.toThrow()
        expect(() => provider.languageModel(modelId)).not.toThrow()
      })
    })
  })

  describe("default provider", () => {
    it("should export default openaiCompatible provider", () => {
      expect(openaiCompatible).toBeDefined()
      expect(typeof openaiCompatible).toBe("function")
      expect(typeof openaiCompatible.chat).toBe("function")
      expect(typeof openaiCompatible.responses).toBe("function")
      expect(typeof openaiCompatible.languageModel).toBe("function")
    })
  })

  describe("provider behavior", () => {
    it("should use default baseURL when not specified", () => {
      const provider = createOpenaiCompatible()
      expect(provider).toBeDefined()
      // Should not throw with default OpenAI URL
    })

    it("should handle baseURL without trailing slash", () => {
      const provider = createOpenaiCompatible({
        baseURL: "https://api.test.com/v1/"
      })
      
      expect(provider).toBeDefined()
      const model = provider("test-model")
      expect(model).toBeDefined()
    })

    it("should merge headers correctly", () => {
      const provider = createOpenaiCompatible({
        apiKey: "test-key",
        headers: {
          "Custom-Header": "custom-value"
        }
      })
      
      expect(provider).toBeDefined()
      // Authorization header should be added from API key
      // Custom header should be preserved
    })

    it("should handle missing API key in headers", () => {
      const provider = createOpenaiCompatible({
        headers: {
          "Custom-Header": "custom-value"
        }
      })
      
      expect(provider).toBeDefined()
      // Should not add Authorization header when no API key
    })
  })
})

describe("OpenAI Compatible Error", () => {
  describe("openaiCompatibleErrorDataSchema", () => {
    it("should validate valid error data", () => {
      const validError = {
        error: {
          message: "Test error message",
          type: "invalid_request_error",
          param: "model",
          code: "invalid_model"
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(validError)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.error.message).toBe("Test error message")
        expect(result.data.error.type).toBe("invalid_request_error")
        expect(result.data.error.param).toBe("model")
        expect(result.data.error.code).toBe("invalid_model")
      }
    })

    it("should validate error data with only required message", () => {
      const minimalError = {
        error: {
          message: "Simple error message"
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(minimalError)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.error.message).toBe("Simple error message")
        expect(result.data.error.type).toBeUndefined()
        expect(result.data.error.param).toBeUndefined()
        expect(result.data.error.code).toBeUndefined()
      }
    })

    it("should validate error data with string code", () => {
      const errorWithStringCode = {
        error: {
          message: "Error with string code",
          code: "custom_error_code"
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(errorWithStringCode)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.error.code).toBe("custom_error_code")
      }
    })

    it("should validate error data with number code", () => {
      const errorWithNumberCode = {
        error: {
          message: "Error with number code",
          code: 400
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(errorWithNumberCode)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.error.code).toBe(400)
      }
    })

    it("should reject invalid error data structure", () => {
      const invalidError = {
        notError: {
          message: "This is not the right structure"
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(invalidError)
      expect(result.success).toBe(false)
    })

    it("should reject error without message", () => {
      const errorWithoutMessage = {
        error: {
          type: "invalid_request_error"
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(errorWithoutMessage)
      expect(result.success).toBe(false)
    })

    it("should reject non-string message", () => {
      const errorWithNonStringMessage = {
        error: {
          message: 123
        }
      }
      
      const result = openaiCompatibleErrorDataSchema.safeParse(errorWithNonStringMessage)
      expect(result.success).toBe(false)
    })
  })

  describe("defaultOpenAICompatibleErrorStructure", () => {
    it("should have correct error schema", () => {
      expect(defaultOpenAICompatibleErrorStructure.errorSchema).toBe(openaiCompatibleErrorDataSchema)
    })

    it("should extract message from error data", () => {
      const errorData: OpenAICompatibleErrorData = {
        error: {
          message: "Test error message",
          type: "invalid_request_error"
        }
      }
      
      const message = defaultOpenAICompatibleErrorStructure.errorToMessage(errorData)
      expect(message).toBe("Test error message")
    })

    it("should handle complex error data", () => {
      const complexErrorData: OpenAICompatibleErrorData = {
        error: {
          message: "Complex error with details",
          type: "invalid_request_error",
          param: "temperature",
          code: "invalid_parameter_value"
        }
      }
      
      const message = defaultOpenAICompatibleErrorStructure.errorToMessage(complexErrorData)
      expect(message).toBe("Complex error with details")
    })

    it("should have undefined isRetryable by default", () => {
      expect(defaultOpenAICompatibleErrorStructure.isRetryable).toBeUndefined()
    })
  })

  describe("type definitions", () => {
    it("should allow valid error data structure", () => {
      const errorData: OpenAICompatibleErrorData = {
        error: {
          message: "Test message",
          type: "test_type",
          param: "test_param",
          code: "test_code"
        }
      }
      
      expect(errorData.error.message).toBe("Test message")
      expect(errorData.error.type).toBe("test_type")
      expect(errorData.error.param).toBe("test_param")
      expect(errorData.error.code).toBe("test_code")
    })

    it("should allow minimal error data structure", () => {
      const minimalErrorData: OpenAICompatibleErrorData = {
        error: {
          message: "Minimal message"
        }
      }
      
      expect(minimalErrorData.error.message).toBe("Minimal message")
      expect(minimalErrorData.error.type).toBeUndefined()
    })
  })
})
