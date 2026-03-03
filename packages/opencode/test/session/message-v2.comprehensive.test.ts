import { describe, expect, test } from "bun:test"
import { APICallError } from "ai"
import { MessageV2 } from "../../src/session/message-v2"
import type { Provider } from "../../src/provider/provider"

const sessionID = "session"
const model: Provider.Model = {
  id: "test-model",
  providerID: "test",
  api: {
    id: "test-model",
    url: "https://example.com",
    npm: "@ai-sdk/openai",
  },
  name: "Test Model",
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: true,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
  },
}

describe("MessageV2 - Comprehensive Tests", () => {
  describe("Basic Functionality", () => {
    test("should create a basic text message", () => {
      const message = new MessageV2({
        role: "user",
        content: "Hello, world!",
        sessionID,
        model,
      })

      expect(message.role).toBe("user")
      expect(message.content).toBe("Hello, world!")
      expect(message.sessionID).toBe(sessionID)
      expect(message.model).toBe(model)
    })

    test("should create a system message", () => {
      const message = new MessageV2({
        role: "system",
        content: "You are a helpful assistant.",
        sessionID,
        model,
      })

      expect(message.role).toBe("system")
      expect(message.content).toBe("You are a helpful assistant.")
    })

    test("should create an assistant message", () => {
      const message = new MessageV2({
        role: "assistant",
        content: "I can help you with that!",
        sessionID,
        model,
      })

      expect(message.role).toBe("assistant")
      expect(message.content).toBe("I can help you with that!")
    })
  })

  describe("Tool Call Support", () => {
    test("should create message with tool calls", () => {
      const toolCalls = [
        {
          id: "call_1",
          type: "function" as const,
          function: {
            name: "read_file",
            arguments: '{"path": "test.txt"}',
          },
        },
      ]

      const message = new MessageV2({
        role: "assistant",
        content: null,
        toolCalls,
        sessionID,
        model,
      })

      expect(message.role).toBe("assistant")
      expect(message.content).toBeNull()
      expect(message.toolCalls).toEqual(toolCalls)
    })

    test("should create message with tool results", () => {
      const toolResults = [
        {
          toolCallId: "call_1",
          role: "tool" as const,
          content: "File content: Hello, world!",
        },
      ]

      const message = new MessageV2({
        role: "tool",
        content: "File content: Hello, world!",
        toolCallId: "call_1",
        sessionID,
        model,
      })

      expect(message.role).toBe("tool")
      expect(message.toolCallId).toBe("call_1")
    })
  })

  describe("Error Handling", () => {
    test("should handle API call errors", () => {
      const apiError = new APICallError({
        message: "API rate limit exceeded",
        cause: new Error("Rate limit"),
        statusCode: 429,
      })

      const message = new MessageV2({
        role: "assistant",
        content: "I encountered an error.",
        error: apiError,
        sessionID,
        model,
      })

      expect(message.error).toBe(apiError)
      expect(message.content).toBe("I encountered an error.")
    })

    test("should handle validation errors", () => {
      expect(() => {
        new MessageV2({
          role: "invalid" as any,
          content: "test",
          sessionID,
          model,
        })
      }).toThrow()

      expect(() => {
        new MessageV2({
          role: "user",
          content: "",
          sessionID: "",
          model,
        })
      }).toThrow()

      expect(() => {
        new MessageV2({
          role: "user",
          content: "test",
          sessionID,
          model: null as any,
        })
      }).toThrow()
    })
  })

  describe("Serialization", () => {
    test("should serialize to JSON correctly", () => {
      const message = new MessageV2({
        role: "user",
        content: "Hello, world!",
        sessionID,
        model,
        metadata: { timestamp: Date.now() },
      })

      const json = message.toJSON()
      const parsed = JSON.parse(json)

      expect(parsed.role).toBe("user")
      expect(parsed.content).toBe("Hello, world!")
      expect(parsed.sessionID).toBe(sessionID)
      expect(parsed.metadata).toBeDefined()
    })

    test("should deserialize from JSON correctly", () => {
      const messageData = {
        role: "assistant",
        content: "I can help!",
        sessionID,
        model,
        metadata: { timestamp: Date.now() },
      }

      const message = MessageV2.fromJSON(JSON.stringify(messageData))

      expect(message.role).toBe("assistant")
      expect(message.content).toBe("I can help!")
      expect(message.sessionID).toBe(sessionID)
      expect(message.metadata).toEqual(messageData.metadata)
    })
  })

  describe("Content Types", () => {
    test("should handle text content", () => {
      const message = new MessageV2({
        role: "user",
        content: "Plain text message",
        sessionID,
        model,
      })

      expect(message.contentType).toBe("text")
      expect(message.textContent).toBe("Plain text message")
    })

    test("should handle structured content", () => {
      const structuredContent = {
        type: "structured",
        data: { key: "value", items: [1, 2, 3] },
      }

      const message = new MessageV2({
        role: "user",
        content: structuredContent,
        sessionID,
        model,
      })

      expect(message.content).toEqual(structuredContent)
    })

    test("should handle null content for tool calls", () => {
      const message = new MessageV2({
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "test",
              arguments: "{}",
            },
          },
        ],
        sessionID,
        model,
      })

      expect(message.content).toBeNull()
      expect(message.toolCalls).toHaveLength(1)
    })
  })

  describe("Metadata and Extensions", () => {
    test("should store and retrieve metadata", () => {
      const metadata = {
        timestamp: Date.now(),
        userId: "user123",
        tags: ["important", "follow-up"],
      }

      const message = new MessageV2({
        role: "user",
        content: "Test message",
        sessionID,
        model,
        metadata,
      })

      expect(message.metadata).toEqual(metadata)
      expect(message.getMetadata("timestamp")).toBe(metadata.timestamp)
      expect(message.getMetadata("userId")).toBe("user123")
      expect(message.getMetadata("tags")).toEqual(metadata.tags)
    })

    test("should update metadata", () => {
      const message = new MessageV2({
        role: "user",
        content: "Test message",
        sessionID,
        model,
        metadata: { initial: true },
      })

      message.setMetadata("updated", true)
      message.setMetadata("timestamp", Date.now())

      expect(message.getMetadata("initial")).toBe(true)
      expect(message.getMetadata("updated")).toBe(true)
      expect(message.getMetadata("timestamp")).toBeDefined()
    })

    test("should handle missing metadata gracefully", () => {
      const message = new MessageV2({
        role: "user",
        content: "Test message",
        sessionID,
        model,
      })

      expect(message.metadata).toEqual({})
      expect(message.getMetadata("nonexistent")).toBeUndefined()
    })
  })

  describe("Message Chains and Context", () => {
    test("should maintain message ordering", () => {
      const messages = [
        new MessageV2({
          role: "system",
          content: "System prompt",
          sessionID,
          model,
        }),
        new MessageV2({
          role: "user",
          content: "User message",
          sessionID,
          model,
        }),
        new MessageV2({
          role: "assistant",
          content: "Assistant response",
          sessionID,
          model,
        }),
      ]

      expect(messages[0].role).toBe("system")
      expect(messages[1].role).toBe("user")
      expect(messages[2].role).toBe("assistant")
    })

    test("should handle conversation context", () => {
      const systemMessage = new MessageV2({
        role: "system",
        content: "You are a helpful assistant.",
        sessionID,
        model,
      })

      const userMessage = new MessageV2({
        role: "user",
        content: "Hello!",
        sessionID,
        model,
        context: [systemMessage],
      })

      expect(userMessage.context).toHaveLength(1)
      expect(userMessage.context![0]).toEqual(systemMessage)
    })
  })

  describe("Model Integration", () => {
    test("should validate model compatibility", () => {
      const compatibleMessage = new MessageV2({
        role: "user",
        content: "Test message",
        sessionID,
        model,
      })

      expect(compatibleMessage.isCompatibleWith(model)).toBe(true)

      const incompatibleModel = {
        ...model,
        capabilities: {
          ...model.capabilities,
          input: { text: false, audio: true, image: true, video: true, pdf: true },
        },
      }

      expect(compatibleMessage.isCompatibleWith(incompatibleModel)).toBe(false)
    })

    test("should handle model-specific features", () => {
      const messageWithImage = new MessageV2({
        role: "user",
        content: "Look at this image",
        sessionID,
        model,
        attachments: [
          {
            type: "image",
            url: "https://example.com/image.jpg",
            mimeType: "image/jpeg",
          },
        ],
      })

      if (model.capabilities.input.image) {
        expect(messageWithImage.attachments).toHaveLength(1)
      } else {
        expect(messageWithImage.attachments).toBeUndefined()
      }
    })
  })

  describe("Performance and Memory", () => {
    test("should handle large content efficiently", () => {
      const largeContent = "x".repeat(100000) // 100KB of text

      const startTime = Date.now()
      const message = new MessageV2({
        role: "user",
        content: largeContent,
        sessionID,
        model,
      })
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(100) // Should create quickly
      expect(message.content).toBe(largeContent)
    })

    test("should handle many messages efficiently", () => {
      const messages = []
      const startTime = Date.now()

      for (let i = 0; i < 1000; i++) {
        messages.push(
          new MessageV2({
            role: i % 2 === 0 ? "user" : "assistant",
            content: `Message ${i}`,
            sessionID,
            model,
          })
        )
      }

      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(1000) // Should create 1000 messages in under 1 second
      expect(messages).toHaveLength(1000)
    })
  })

  describe("Edge Cases and Error Recovery", () => {
    test("should handle circular references in metadata", () => {
      const circularMetadata: any = { name: "test" }
      circularMetadata.self = circularMetadata

      expect(() => {
        new MessageV2({
          role: "user",
          content: "Test",
          sessionID,
          model,
          metadata: circularMetadata,
        })
      }).not.toThrow()
    })

    test("should handle extremely long role names", () => {
      const longRole = "a".repeat(1000)

      expect(() => {
        new MessageV2({
          role: longRole as any,
          content: "Test",
          sessionID,
          model,
        })
      }).toThrow()
    })

    test("should handle special characters in content", () => {
      const specialContent = "🚀 Hello! \n\t\r 中文 العربية 日本語 한국어"

      const message = new MessageV2({
        role: "user",
        content: specialContent,
        sessionID,
        model,
      })

      expect(message.content).toBe(specialContent)
    })

    test("should handle null and undefined values gracefully", () => {
      expect(() => {
        new MessageV2({
          role: "user",
          content: null as any,
          sessionID,
          model,
          toolCalls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "test", arguments: "{}" },
            },
          ],
        })
      }).not.toThrow()

      expect(() => {
        new MessageV2({
          role: "user",
          content: undefined as any,
          sessionID,
          model,
        })
      }).toThrow()
    })
  })

  describe("Module Integration", () => {
    test("can be imported", async () => {
      const mod = await import("../../src/session/message-v2")
      expect(mod).toBeDefined()
      expect(mod.MessageV2).toBeDefined()
    })

    test("should work with static factory methods", () => {
      const userMessage = MessageV2.user("Hello, world!", sessionID, model)
      expect(userMessage.role).toBe("user")
      expect(userMessage.content).toBe("Hello, world!")

      const assistantMessage = MessageV2.assistant("I can help!", sessionID, model)
      expect(assistantMessage.role).toBe("assistant")
      expect(assistantMessage.content).toBe("I can help!")

      const systemMessage = MessageV2.system("You are helpful", sessionID, model)
      expect(systemMessage.role).toBe("system")
      expect(systemMessage.content).toBe("You are helpful")
    })
  })
})
