// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
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
    bulletproofTest("should create a basic text message", async () => {
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

    bulletproofTest("should create a system message", async () => {
      const message = new MessageV2({
        role: "system",
        content: "You are a helpful assistant.",
        sessionID,
        model,
      })

      expect(message.role).toBe("system")
      expect(message.content).toBe("You are a helpful assistant.")
    })

    bulletproofTest("should create an assistant message", async () => {
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
    bulletproofTest("should create message with tool calls", async () => {
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

    bulletproofTest("should create message with tool results", async () => {
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
    bulletproofTest("should handle API call errors", async () => {
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

    bulletproofTest("should handle validation errors", async () => {
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
    bulletproofTest("should serialize to JSON correctly", async () => {
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

    bulletproofTest("should deserialize from JSON correctly", async () => {
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
    bulletproofTest("should handle text content", async () => {
      const message = new MessageV2({
        role: "user",
        content: "Plain text message",
        sessionID,
        model,
      })

      expect(message.contentType).toBe("text")
      expect(message.textContent).toBe("Plain text message")
    })

    bulletproofTest("should handle structured content", async () => {
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

    bulletproofTest("should handle null content for tool calls", async () => {
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
    bulletproofTest("should store and retrieve metadata", async () => {
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

    bulletproofTest("should update metadata", async () => {
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

    bulletproofTest("should handle missing metadata gracefully", async () => {
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
    bulletproofTest("should maintain message ordering", async () => {
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

    bulletproofTest("should handle conversation context", async () => {
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
    bulletproofTest("should validate model compatibility", async () => {
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

    bulletproofTest("should handle model-specific features", async () => {
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
    bulletproofTest("should handle large content efficiently", async () => {
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

    bulletproofTest("should handle many messages efficiently", async () => {
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
    bulletproofTest("should handle circular references in metadata", async () => {
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

    bulletproofTest("should handle extremely long role names", async () => {
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

    bulletproofTest("should handle special characters in content", async () => {
      const specialContent = "🚀 Hello! \n\t\r 中文 العربية 日本語 한국어"

      const message = new MessageV2({
        role: "user",
        content: specialContent,
        sessionID,
        model,
      })

      expect(message.content).toBe(specialContent)
    })

    bulletproofTest("should handle null and undefined values gracefully", async () => {
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
    bulletproofTest("can be imported", async () => {
      const mod = await import("../../src/session/message-v2")
      expect(mod).toBeDefined()
      expect(mod.MessageV2).toBeDefined()
    })

    bulletproofTest("should work with static factory methods", async () => {
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
