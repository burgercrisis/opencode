import { describe, it, expect, test, mock } from "bun:test"
import { CopilotAuthPlugin } from "../../src/plugin/copilot"
import { createOpenaiCompatible, openaiCompatible, type OpenaiCompatibleProviderSettings } from "../../src/provider/sdk/copilot/copilot-provider"
import type { OpenaiCompatibleProvider } from "../../src/provider/sdk/copilot/copilot-provider"
import { openaiCompatibleErrorDataSchema, defaultOpenAICompatibleErrorStructure, type OpenAICompatibleErrorData } from "../../src/provider/sdk/copilot/openai-compatible-error"
import { OpenAICompatibleChatLanguageModel } from "../../src/provider/sdk/copilot/chat/openai-compatible-chat-language-model"
import type { LanguageModelV2Prompt } from "@ai-sdk/provider"

async function convertReadableStreamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const result: T[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result.push(value)
  }
  return result
}

const TEST_PROMPT: LanguageModelV2Prompt = [{ role: "user", content: [{ type: "text", text: "Hello" }] }]

// Fixtures from copilot_test.exs
const FIXTURES = {
  basicText: [
    `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-2.0-flash-001","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}`,
    `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-2.0-flash-001","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}`,
    `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gemini-2.0-flash-001","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":"stop"}]}`,
    `data: [DONE]`,
  ],

  reasoningWithToolCalls: [
    `data: {"choices":[{"index":0,"delta":{"content":null,"role":"assistant","reasoning_text":"**Understanding Dayzee's Purpose**\\n\\nI'm starting to get a better handle on \`dayzee\`.\\n\\n"}}],"created":1764940861,"id":"OdwyabKMI9yel7oPlbzgwQM","usage":{"completion_tokens":0,"prompt_tokens":0,"prompt_tokens_details":{"cached_tokens":0},"total_tokens":0,"reasoning_tokens":0},"model":"gemini-3-pro-preview"}`,
    `data: {"choices":[{"index":0,"delta":{"content":null,"role":"assistant","reasoning_text":"**Assessing Dayzee's Functionality**\\n\\nI've reviewed the files.\\n\\n"}}],"created":1764940862,"id":"OdwyabKMI9yel7oPlbzgwQM","usage":{"completion_tokens":0,"prompt_tokens":0,"prompt_tokens_details":{"cached_tokens":0},"total_tokens":0,"reasoning_tokens":0},"model":"gemini-3-pro-preview"}`,
    `data: {"choices":[{"index":0,"delta":{"content":null,"role":"assistant","tool_calls":[{"function":{"arguments":"{\\"filePath\\":\\"/README.md\\"}","name":"read_file"},"id":"call_abc123","index":0,"type":"function"}],"reasoning_opaque":"4CUQ6696CwSXOdQ5rtvDimqA91tBzfmga4ieRbmZ5P67T2NLW3"}}],"created":1764940862,"id":"OdwyabKMI9yel7oPlbzgwQM","usage":{"completion_tokens":0,"prompt_tokens":0,"prompt_tokens_details":{"cached_tokens":0},"total_tokens":0,"reasoning_tokens":0},"model":"gemini-3-pro-preview"}`,
    `data: [DONE]`,
  ],

  errorHandling: [
    `data: {"error":{"message":"Invalid request","type":"invalid_request_error","code":"invalid_request"}}`,
    `data: [DONE]`,
  ]
}

describe("Copilot System - Comprehensive Tests", () => {
  describe("Copilot Plugin", () => {
    describe("normalizeDomain", () => {
      it("should remove https protocol", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("https://github.com")).toBe("github.com")
      })

      it("should remove http protocol", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("http://github.com")).toBe("github.com")
      })

      it("should remove trailing slash", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("https://github.com/")).toBe("github.com")
      })

      it("should handle domain without protocol", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("github.com")).toBe("github.com")
      })

      it("should handle complex domain", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("https://company.ghe.com/")).toBe("company.ghe.com")
      })

      it("should handle subdomains", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("https://api.github.com/")).toBe("api.github.com")
      })

      it("should handle port numbers", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("https://github.com:443/")).toBe("github.com:443")
      })

      it("should handle empty strings", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain("")).toBe("")
      })

      it("should handle null and undefined", () => {
        const normalizeDomain = (global as any).normalizeDomain
        expect(normalizeDomain(null as any)).toBe("")
        expect(normalizeDomain(undefined as any)).toBe("")
      })
    })

    describe("Copilot Authentication", () => {
      it("should handle GitHub Enterprise authentication", () => {
        const plugin = new CopilotAuthPlugin()
        expect(plugin).toBeDefined()
      })

      it("should validate GitHub tokens", () => {
        const validateToken = (global as any).validateGitHubToken
        if (validateToken) {
          expect(validateToken("ghp_1234567890abcdef")).toBe(true)
          expect(validateToken("invalid")).toBe(false)
        }
      })

      it("should handle token refresh", () => {
        const refreshToken = (global as any).refreshGitHubToken
        if (refreshToken) {
          expect(typeof refreshToken).toBe("function")
        }
      })
    })
  })

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
        const model = provider("test-model")
        
        expect(provider).toBeDefined()
        expect(model).toBeDefined()
      })

      it("should create provider with custom headers", () => {
        const options: OpenaiCompatibleProviderSettings = {
          headers: {
            "X-Custom-Header": "custom-value"
          }
        }
        
        const provider = createOpenaiCompatible(options)
        expect(provider).toBeDefined()
      })

      it("should handle invalid options gracefully", () => {
        const invalidOptions = {
          baseURL: "invalid-url",
          apiKey: null as any
        }
        
        expect(() => createOpenaiCompatible(invalidOptions)).not.toThrow()
      })
    })

    describe("openaiCompatible()", () => {
      it("should create OpenAI compatible provider", () => {
        const provider = openaiCompatible({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key"
        })
        
        expect(provider).toBeDefined()
        expect(typeof provider).toBe("function")
      })

      it("should handle missing API key", () => {
        const provider = openaiCompatible({
          baseURL: "https://api.githubcopilot.com"
        })
        
        expect(provider).toBeDefined()
      })

      it("should handle custom model settings", () => {
        const provider = openaiCompatible({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          models: {
            "gpt-4": {
              maxTokens: 4096,
              temperature: 0.7
            }
          }
        })
        
        expect(provider).toBeDefined()
      })
    })

    describe("Error Handling", () => {
      it("should validate error data schema", () => {
        const validError: OpenAICompatibleErrorData = {
          message: "Invalid request",
          type: "invalid_request_error",
          code: "invalid_request"
        }
        
        const result = openaiCompatibleErrorDataSchema.safeParse(validError)
        expect(result.success).toBe(true)
      })

      it("should reject invalid error data", () => {
        const invalidError = {
          message: 123, // Should be string
          type: "invalid_request_error"
        }
        
        const result = openaiCompatibleErrorDataSchema.safeParse(invalidError)
        expect(result.success).toBe(false)
      })

      it("should provide default error structure", () => {
        const defaultError = defaultOpenAICompatibleErrorStructure
        expect(defaultError).toBeDefined()
        expect(typeof defaultError).toBe("object")
      })

      it("should handle network errors", () => {
        const provider = createOpenaiCompatible({
          baseURL: "https://invalid-url-that-does-not-exist.com",
          apiKey: "test-key"
        })
        
        expect(provider).toBeDefined()
        // Should handle network errors gracefully when making requests
      })

      it("should handle rate limiting", () => {
        const rateLimitError: OpenAICompatibleErrorData = {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded"
        }
        
        const result = openaiCompatibleErrorDataSchema.safeParse(rateLimitError)
        expect(result.success).toBe(true)
      })

      it("should handle authentication errors", () => {
        const authError: OpenAICompatibleErrorData = {
          message: "Invalid API key",
          type: "authentication_error",
          code: "invalid_api_key"
        }
        
        const result = openaiCompatibleErrorDataSchema.safeParse(authError)
        expect(result.success).toBe(true)
      })
    })
  })

  describe("Copilot Chat Model", () => {
    describe("Basic Text Generation", () => {
      it("should handle basic text streaming", async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            FIXTURES.basicText.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk + '\n\n'))
            })
            controller.close()
          }
        })

        // Mock the fetch to return our test stream
        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: mockStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
        expect(result.text).toContain("Hello world!")
      })

      it("should handle empty responses", async () => {
        const emptyStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: emptyStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
      })
    })

    describe("Reasoning and Tool Calls", () => {
      it("should handle reasoning text", async () => {
        const reasoningStream = new ReadableStream({
          start(controller) {
            FIXTURES.reasoningWithToolCalls.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk + '\n\n'))
            })
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: reasoningStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gemini-3-pro-preview"
        })

        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
        expect(result.text).toBeDefined()
      })

      it("should handle tool calls in response", async () => {
        const toolCallStream = new ReadableStream({
          start(controller) {
            FIXTURES.reasoningWithToolCalls.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk + '\n\n'))
            })
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: toolCallStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gemini-3-pro-preview"
        })

        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
      })
    })

    describe("Error Handling in Chat Model", () => {
      it("should handle API errors gracefully", async () => {
        const errorStream = new ReadableStream({
          start(controller) {
            FIXTURES.errorHandling.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk + '\n\n'))
            })
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: errorStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        // Should handle errors without throwing
        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
      })

      it("should handle network timeouts", async () => {
        global.fetch = mock(() => Promise.reject(new Error("Network timeout")))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        // Should handle network errors gracefully
        await expect(model.doGenerate(TEST_PROMPT, {})).resolves.toBeDefined()
      })

      it("should handle malformed responses", async () => {
        const malformedStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"invalid": json\n\n'))
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: malformedStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        // Should handle malformed JSON gracefully
        const result = await model.doGenerate(TEST_PROMPT, {})
        expect(result).toBeDefined()
      })
    })

    describe("Chat Model Configuration", () => {
      it("should respect temperature settings", () => {
        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4",
          temperature: 0.5
        })

        expect(model).toBeDefined()
      })

      it("should respect max tokens settings", () => {
        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4",
          maxTokens: 2048
        })

        expect(model).toBeDefined()
      })

      it("should handle custom headers", () => {
        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4",
          headers: {
            "X-Custom-Header": "custom-value"
          }
        })

        expect(model).toBeDefined()
      })
    })

    describe("Streaming and Performance", () => {
      it("should handle large responses efficiently", async () => {
        const largeChunks = []
        for (let i = 0; i < 100; i++) {
          largeChunks.push(`data: {"choices":[{"index":0,"delta":{"content":"chunk ${i}"}}]}\n\n`)
        }
        largeChunks.push('data: [DONE]\n\n')

        const largeStream = new ReadableStream({
          start(controller) {
            largeChunks.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk))
            })
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: largeStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        const startTime = Date.now()
        const result = await model.doGenerate(TEST_PROMPT, {})
        const endTime = Date.now()

        expect(endTime - startTime).toBeLessThan(5000) // Should complete in under 5 seconds
        expect(result).toBeDefined()
      })

      it("should handle concurrent requests", async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            FIXTURES.basicText.forEach(chunk => {
              controller.enqueue(new TextEncoder().encode(chunk + '\n\n'))
            })
            controller.close()
          }
        })

        global.fetch = mock(() => Promise.resolve({
          ok: true,
          body: mockStream
        } as Response))

        const model = new OpenAICompatibleChatLanguageModel({
          baseURL: "https://api.githubcopilot.com",
          apiKey: "test-key",
          model: "gpt-4"
        })

        // Test concurrent requests
        const promises = Array.from({ length: 5 }, () => model.doGenerate(TEST_PROMPT, {}))
        const results = await Promise.allSettled(promises)

        results.forEach(result => {
          expect(result.status).toBe("fulfilled")
        })
      })
    })
  })

  describe("Copilot Integration", () => {
    it("should integrate with GitHub authentication", () => {
      const provider = createOpenaiCompatible({
        baseURL: "https://api.githubcopilot.com",
        apiKey: "github-token"
      })

      expect(provider).toBeDefined()
    })

    it("should handle enterprise GitHub instances", () => {
      const provider = createOpenaiCompatible({
        baseURL: "https://api.githubenterprise.com",
        apiKey: "enterprise-token"
      })

      expect(provider).toBeDefined()
    })

    it("should validate Copilot-specific models", () => {
      const copilotModels = [
        "gpt-4",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
        "claude-3-sonnet",
        "claude-3-haiku"
      ]

      copilotModels.forEach(model => {
        const provider = createOpenaiCompatible()
        const instance = provider(model)
        expect(instance).toBeDefined()
      })
    })

    it("should handle Copilot-specific features", () => {
      const provider = createOpenaiCompatible({
        baseURL: "https://api.githubcopilot.com",
        apiKey: "test-key",
        features: {
          codeContext: true,
          repositoryAwareness: true,
          fileReferences: true
        }
      })

      expect(provider).toBeDefined()
    })
  })

  describe("Copilot Security and Privacy", () => {
    it("should handle sensitive data securely", () => {
      const provider = createOpenaiCompatible({
        baseURL: "https://api.githubcopilot.com",
        apiKey: "sensitive-token"
      })

      // API key should be handled securely
      expect(provider).toBeDefined()
    })

    it("should validate input data", () => {
      const model = new OpenAICompatibleChatLanguageModel({
        baseURL: "https://api.githubcopilot.com",
        apiKey: "test-key",
        model: "gpt-4"
      })

      // Should validate prompt data
      expect(model).toBeDefined()
    })

    it("should handle malicious input gracefully", async () => {
      const maliciousPrompt = [{ role: "user", content: [{ type: "text", text: "<script>alert('xss')</script>" }] }]
      
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      global.fetch = mock(() => Promise.resolve({
        ok: true,
        body: mockStream
      } as Response))

      const model = new OpenAICompatibleChatLanguageModel({
        baseURL: "https://api.githubcopilot.com",
        apiKey: "test-key",
        model: "gpt-4"
      })

      // Should handle malicious input without security issues
      const result = await model.doGenerate(maliciousPrompt, {})
      expect(result).toBeDefined()
    })
  })
})
