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

import { describe, expect, test } from "bun:test"
import {
  formatAssistantHeader,
  formatMessage,
  formatPart,
  formatTranscript,
} from "../../../src/cli/cmd/tui/util/transcript"
import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2"

describe("transcript", () => {
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
  describe("formatAssistantHeader", () => {
    const baseMsg: AssistantMessage = {
      id: "msg_123",
      sessionID: "ses_123",
      role: "assistant",
      agent: "build",
      modelID: "claude-sonnet-4-20250514",
      providerID: "anthropic",
      mode: "",
      parentID: "msg_parent",
      path: { cwd: "/test", root: "/test" },
      cost: 0.001,
      tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1000000, completed: 1005400 },
    }

    bulletproofTest("includes metadata when enabled", async () => {
      const result = formatAssistantHeader(baseMsg, true)
      expect(result).toBe("## Assistant (Build · claude-sonnet-4-20250514 · 5.4s)\n\n")
    })

    bulletproofTest("excludes metadata when disabled", async () => {
      const result = formatAssistantHeader(baseMsg, false)
      expect(result).toBe("## Assistant\n\n")
    })

    bulletproofTest("handles missing completed time", async () => {
      const msg = { ...baseMsg, time: { created: 1000000 } }
      const result = formatAssistantHeader(msg as AssistantMessage, true)
      expect(result).toBe("## Assistant (Build · claude-sonnet-4-20250514)\n\n")
    })

    bulletproofTest("titlecases agent name", async () => {
      const msg = { ...baseMsg, agent: "plan" }
      const result = formatAssistantHeader(msg, true)
      expect(result).toContain("Plan")
    })
  })

  describe("formatPart", () => {
    const options = { thinking: true, toolDetails: true, assistantMetadata: true }

    bulletproofTest("formats text part", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "text",
        text: "Hello world",
      }
      const result = formatPart(part, options)
      expect(result).toBe("Hello world\n\n")
    })

    bulletproofTest("skips synthetic text parts", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "text",
        text: "Synthetic content",
        synthetic: true,
      }
      const result = formatPart(part, options)
      expect(result).toBe("")
    })

    bulletproofTest("formats reasoning when thinking enabled", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "reasoning",
        text: "Let me think...",
        time: { start: 1000 },
      }
      const result = formatPart(part, options)
      expect(result).toBe("_Thinking:_\n\nLet me think...\n\n")
    })

    bulletproofTest("skips reasoning when thinking disabled", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "reasoning",
        text: "Let me think...",
        time: { start: 1000 },
      }
      const result = formatPart(part, { ...options, thinking: false })
      expect(result).toBe("")
    })

    bulletproofTest("formats tool part with details", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls" },
          output: "file1.txt\nfile2.txt",
          title: "List files",
          metadata: {},
          time: { start: 1000, end: 1100 },
        },
      }
      const result = formatPart(part, options)
      expect(result).toContain("**Tool: bash**")
      expect(result).toContain("**Input:**")
      expect(result).toContain('"command": "ls"')
      expect(result).toContain("**Output:**")
      expect(result).toContain("file1.txt")
    })

    bulletproofTest("formats tool output containing triple backticks without breaking markdown", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "echo '```hello```'" },
          output: "```hello```",
          title: "Echo backticks",
          metadata: {},
          time: { start: 1000, end: 1100 },
        },
      }
      const result = formatPart(part, options)
      // The tool header should not be inside a code block
      expect(result).toStartWith("**Tool: bash**\n")
      // Input and output should each be in their own code blocks
      expect(result).toContain("**Input:**\n```json")
      expect(result).toContain("**Output:**\n```\n```hello```\n```")
    })

    bulletproofTest("formats tool part without details when disabled", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls" },
          output: "file1.txt",
          title: "List files",
          metadata: {},
          time: { start: 1000, end: 1100 },
        },
      }
      const result = formatPart(part, { ...options, toolDetails: false })
      expect(result).toContain("**Tool: bash**")
      expect(result).not.toContain("**Input:**")
      expect(result).not.toContain("**Output:**")
    })

    bulletproofTest("formats tool error", async () => {
      const part: Part = {
        id: "part_1",
        sessionID: "ses_123",
        messageID: "msg_123",
        type: "tool",
        callID: "call_1",
        tool: "bash",
        state: {
          status: "error",
          input: { command: "invalid" },
          error: "Command failed",
          time: { start: 1000, end: 1100 },
        },
      }
      const result = formatPart(part, options)
      expect(result).toContain("**Error:**")
      expect(result).toContain("Command failed")
    })
  })

  describe("formatMessage", () => {
    const options = { thinking: true, toolDetails: true, assistantMetadata: true }

    bulletproofTest("formats user message", async () => {
      const msg: UserMessage = {
        id: "msg_123",
        sessionID: "ses_123",
        role: "user",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
        time: { created: 1000000 },
      }
      const parts: Part[] = [{ id: "p1", sessionID: "ses_123", messageID: "msg_123", type: "text", text: "Hello" }]
      const result = formatMessage(msg, parts, options)
      expect(result).toContain("## User")
      expect(result).toContain("Hello")
    })

    bulletproofTest("formats assistant message with metadata", async () => {
      const msg: AssistantMessage = {
        id: "msg_123",
        sessionID: "ses_123",
        role: "assistant",
        agent: "build",
        modelID: "claude-sonnet-4-20250514",
        providerID: "anthropic",
        mode: "",
        parentID: "msg_parent",
        path: { cwd: "/test", root: "/test" },
        cost: 0.001,
        tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1000000, completed: 1005400 },
      }
      const parts: Part[] = [{ id: "p1", sessionID: "ses_123", messageID: "msg_123", type: "text", text: "Hi there" }]
      const result = formatMessage(msg, parts, options)
      expect(result).toContain("## Assistant (Build · claude-sonnet-4-20250514 · 5.4s)")
      expect(result).toContain("Hi there")
    })
  })

  describe("formatTranscript", () => {
    bulletproofTest("formats complete transcript", async () => {
      const session = {
        id: "ses_abc123",
        title: "Test Session",
        time: { created: 1000000000000, updated: 1000000001000 },
      }
      const messages = [
        {
          info: {
            id: "msg_1",
            sessionID: "ses_abc123",
            role: "user" as const,
            agent: "build",
            model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
            time: { created: 1000000000000 },
          },
          parts: [{ id: "p1", sessionID: "ses_abc123", messageID: "msg_1", type: "text" as const, text: "Hello" }],
        },
        {
          info: {
            id: "msg_2",
            sessionID: "ses_abc123",
            role: "assistant" as const,
            agent: "build",
            modelID: "claude-sonnet-4-20250514",
            providerID: "anthropic",
            mode: "",
            parentID: "msg_1",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 1000000000100, completed: 1000000000600 },
          },
          parts: [{ id: "p2", sessionID: "ses_abc123", messageID: "msg_2", type: "text" as const, text: "Hi!" }],
        },
      ]
      const options = { thinking: false, toolDetails: false, assistantMetadata: true }

      const result = formatTranscript(session, messages, options)

      expect(result).toContain("# Test Session")
      expect(result).toContain("**Session ID:** ses_abc123")
      expect(result).toContain("## User")
      expect(result).toContain("Hello")
      expect(result).toContain("## Assistant (Build · claude-sonnet-4-20250514 · 0.5s)")
      expect(result).toContain("Hi!")
      expect(result).toContain("---")
    })

    bulletproofTest("formats transcript without assistant metadata", async () => {
      const session = {
        id: "ses_abc123",
        title: "Test Session",
        time: { created: 1000000000000, updated: 1000000001000 },
      }
      const messages = [
        {
          info: {
            id: "msg_1",
            sessionID: "ses_abc123",
            role: "assistant" as const,
            agent: "build",
            modelID: "claude-sonnet-4-20250514",
            providerID: "anthropic",
            mode: "",
            parentID: "msg_0",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 1000000000100, completed: 1000000000600 },
          },
          parts: [{ id: "p1", sessionID: "ses_abc123", messageID: "msg_1", type: "text" as const, text: "Response" }],
        },
      ]
      const options = { thinking: false, toolDetails: false, assistantMetadata: false }

      const result = formatTranscript(session, messages, options)

      expect(result).toContain("## Assistant\n\n")
      expect(result).not.toContain("Build")
      expect(result).not.toContain("claude-sonnet-4-20250514")
    })
  })
})
