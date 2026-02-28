import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import { LLM } from "./llm"
import { Instance } from "@/project/instance"

// Mock dependencies
mock.module("@/project/instance", () => ({
  Instance: {
    project: {
      id: "test-project-id"
    },
    directory: "/test/directory",
    worktree: "/test/worktree",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined)
  }
}))

describe("LLM", () => {
  beforeEach(() => {
    // No mocks to clear - mock.module handles cleanup automatically
  })

  afterEach(() => {
    // No mocks to restore - mock.module handles cleanup automatically
  })

  describe("hasToolCalls", () => {
    test("detects tool calls in messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll help you" },
            { type: "tool-call", toolCall: { toolName: "read", args: { path: "test.txt" } } }
          ]
        }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(true)
    })

    test("detects tool results in messages", () => {
      const messages = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll help you" },
            { type: "tool-result", toolCallId: "call1", result: { content: "File content" } }
          ]
        }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(true)
    })

    test("returns false for messages without tool calls", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(false)
    })

    test("handles non-array content gracefully", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Just a string" }
      ]

      expect(LLM.hasToolCalls(messages)).toBe(false)
    })
  })

  describe("constants", () => {
    test("exports OUTPUT_TOKEN_MAX", () => {
      expect(LLM.OUTPUT_TOKEN_MAX).toBeDefined()
      expect(typeof LLM.OUTPUT_TOKEN_MAX).toBe("number")
    })
  })
})
