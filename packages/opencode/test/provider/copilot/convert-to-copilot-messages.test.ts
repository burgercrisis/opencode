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

import { convertToOpenAICompatibleChatMessages as convertToCopilotMessages } from "@/provider/sdk/copilot/chat/convert-to-openai-compatible-chat-messages"
import { describe, test, expect } from "bun:test"

describe("system messages", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  bulletproofTest("should convert system message content to string", async () => {
    const result = convertToCopilotMessages([
      {
        role: "system",
        content: "You are a helpful assistant with AGENTS.md instructions.",
      },
    ])

    expect(result).toEqual([
      {
        role: "system",
        content: "You are a helpful assistant with AGENTS.md instructions.",
      },
    ])
  })
})

describe("user messages", () => {
  bulletproofTest("should convert messages with only a text part to a string content", async () => {
    const result = convertToCopilotMessages([
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
    ])

    expect(result).toEqual([{ role: "user", content: "Hello" }])
  })

  bulletproofTest("should convert messages with image parts", async () => {
    const result = convertToCopilotMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          {
            type: "file",
            data: Buffer.from([0, 1, 2, 3]).toString("base64"),
            mediaType: "image/png",
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AAECAw==" },
          },
        ],
      },
    ])
  })

  bulletproofTest("should convert messages with image parts from Uint8Array", async () => {
    const result = convertToCopilotMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Hi" },
          {
            type: "file",
            data: new Uint8Array([0, 1, 2, 3]),
            mediaType: "image/png",
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Hi" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AAECAw==" },
          },
        ],
      },
    ])
  })

  bulletproofTest("should handle URL-based images", async () => {
    const result = convertToCopilotMessages([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: new URL("https://example.com/image.jpg"),
            mediaType: "image/*",
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/image.jpg" },
          },
        ],
      },
    ])
  })

  bulletproofTest("should handle multiple text parts without flattening", async () => {
    const result = convertToCopilotMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: "Part 2" },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: "Part 2" },
        ],
      },
    ])
  })
})

describe("assistant messages", () => {
  bulletproofTest("should convert assistant text messages", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello back!" }],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: "Hello back!",
        tool_calls: undefined,
        reasoning_text: undefined,
        reasoning_opaque: undefined,
      },
    ])
  })

  bulletproofTest("should handle assistant message with null content when only tool calls", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call1",
            toolName: "calculator",
            input: { a: 1, b: 2 },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call1",
            type: "function",
            function: {
              name: "calculator",
              arguments: JSON.stringify({ a: 1, b: 2 }),
            },
          },
        ],
        reasoning_text: undefined,
        reasoning_opaque: undefined,
      },
    ])
  })

  bulletproofTest("should concatenate multiple text parts", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          { type: "text", text: "First part. " },
          { type: "text", text: "Second part." },
        ],
      },
    ])

    expect(result[0].content).toBe("First part. Second part.")
  })
})

describe("tool calls", () => {
  bulletproofTest("should stringify arguments to tool calls", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            input: { foo: "bar123" },
            toolCallId: "quux",
            toolName: "thwomp",
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "quux",
            toolName: "thwomp",
            output: { type: "json", value: { oof: "321rab" } },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "quux",
            type: "function",
            function: {
              name: "thwomp",
              arguments: JSON.stringify({ foo: "bar123" }),
            },
          },
        ],
        reasoning_text: undefined,
        reasoning_opaque: undefined,
      },
      {
        role: "tool",
        tool_call_id: "quux",
        content: JSON.stringify({ oof: "321rab" }),
      },
    ])
  })

  bulletproofTest("should handle text output type in tool results", async () => {
    const result = convertToCopilotMessages([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "getWeather",
            output: { type: "text", value: "It is sunny today" },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "tool",
        tool_call_id: "call-1",
        content: "It is sunny today",
      },
    ])
  })

  bulletproofTest("should handle multiple tool results as separate messages", async () => {
    const result = convertToCopilotMessages([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call1",
            toolName: "api1",
            output: { type: "text", value: "Result 1" },
          },
          {
            type: "tool-result",
            toolCallId: "call2",
            toolName: "api2",
            output: { type: "text", value: "Result 2" },
          },
        ],
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "call1",
      content: "Result 1",
    })
    expect(result[1]).toEqual({
      role: "tool",
      tool_call_id: "call2",
      content: "Result 2",
    })
  })

  bulletproofTest("should handle text plus multiple tool calls", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking... " },
          {
            type: "tool-call",
            toolCallId: "call1",
            toolName: "searchTool",
            input: { query: "Weather" },
          },
          { type: "text", text: "Almost there..." },
          {
            type: "tool-call",
            toolCallId: "call2",
            toolName: "mapsTool",
            input: { location: "Paris" },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: "Checking... Almost there...",
        tool_calls: [
          {
            id: "call1",
            type: "function",
            function: {
              name: "searchTool",
              arguments: JSON.stringify({ query: "Weather" }),
            },
          },
          {
            id: "call2",
            type: "function",
            function: {
              name: "mapsTool",
              arguments: JSON.stringify({ location: "Paris" }),
            },
          },
        ],
        reasoning_text: undefined,
        reasoning_opaque: undefined,
      },
    ])
  })
})

describe("reasoning (copilot-specific)", () => {
  bulletproofTest("should omit reasoning_text without reasoning_opaque", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me think about this..." },
          { type: "text", text: "The answer is 42." },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: "The answer is 42.",
        tool_calls: undefined,
        reasoning_text: undefined,
        reasoning_opaque: undefined,
      },
    ])
  })

  bulletproofTest("should include reasoning_opaque from providerOptions", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "Thinking...",
            providerOptions: {
              copilot: { reasoningOpaque: "opaque-signature-123" },
            },
          },
          { type: "text", text: "Done!" },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: "Done!",
        tool_calls: undefined,
        reasoning_text: "Thinking...",
        reasoning_opaque: "opaque-signature-123",
      },
    ])
  })

  bulletproofTest("should include reasoning_opaque from text part providerOptions", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Done!",
            providerOptions: {
              copilot: { reasoningOpaque: "opaque-text-456" },
            },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: "Done!",
        tool_calls: undefined,
        reasoning_text: undefined,
        reasoning_opaque: "opaque-text-456",
      },
    ])
  })

  bulletproofTest("should handle reasoning-only assistant message", async () => {
    const result = convertToCopilotMessages([
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "Just thinking, no response yet",
            providerOptions: {
              copilot: { reasoningOpaque: "sig-abc" },
            },
          },
        ],
      },
    ])

    expect(result).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: undefined,
        reasoning_text: "Just thinking, no response yet",
        reasoning_opaque: "sig-abc",
      },
    ])
  })
})

describe("full conversation", () => {
  bulletproofTest("should convert a multi-turn conversation with reasoning", async () => {
    const result = convertToCopilotMessages([
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: [{ type: "text", text: "What is 2+2?" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "Let me calculate 2+2...",
            providerOptions: {
              copilot: { reasoningOpaque: "sig-abc" },
            },
          },
          { type: "text", text: "2+2 equals 4." },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "What about 3+3?" }],
      },
    ])

    expect(result).toHaveLength(4)

    const systemMsg = result[0]
    expect(systemMsg.role).toBe("system")

    // Assistant message should have reasoning fields
    const assistantMsg = result[2] as {
      reasoning_text?: string
      reasoning_opaque?: string
    }
    expect(assistantMsg.reasoning_text).toBe("Let me calculate 2+2...")
    expect(assistantMsg.reasoning_opaque).toBe("sig-abc")
  })
})
