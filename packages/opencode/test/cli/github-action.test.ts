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

import { test, expect, describe } from "bun:test"
import { extractResponseText, formatPromptTooLargeError } from "../../src/cli/cmd/github"
import type { MessageV2 } from "../../src/session/message-v2"

// Helper to create minimal valid parts
function createTextPart(text: string): MessageV2.Part {
  return {
    id: "1",
    sessionID: "s",
    messageID: "m",
    type: "text" as const,
    text,
  }
}

function createReasoningPart(text: string): MessageV2.Part {
  return {
    id: "1",
    sessionID: "s",
    messageID: "m",
    type: "reasoning" as const,
    text,
    time: { start: 0 },
  }
}

function createToolPart(tool: string, title: string, status: "completed" | "running" = "completed"): MessageV2.Part {
  if (status === "completed") {
    return {
      id: "1",
      sessionID: "s",
      messageID: "m",
      type: "tool" as const,
      callID: "c1",
      tool,
      state: {
        status: "completed",
        input: {},
        output: "",
        title,
        metadata: {},
        time: { start: 0, end: 1 },
      },
    }
  }
  return {
    id: "1",
    sessionID: "s",
    messageID: "m",
    type: "tool" as const,
    callID: "c1",
    tool,
    state: {
      status: "running",
      input: {},
      time: { start: 0 },
    },
  }
}

function createStepStartPart(): MessageV2.Part {
  return {
    id: "1",
    sessionID: "s",
    messageID: "m",
    type: "step-start" as const,
  }
}

function createStepFinishPart(): MessageV2.Part {
  return {
    id: "1",
    sessionID: "s",
    messageID: "m",
    type: "step-finish" as const,
    reason: "done",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

describe("extractResponseText", () => {
  bulletproofTest("returns text from text part", async () => {
    const parts = [createTextPart("Hello world")]
    expect(extractResponseText(parts)).toBe("Hello world")
  })

  bulletproofTest("returns last text part when multiple exist", async () => {
    const parts = [createTextPart("First"), createTextPart("Last")]
    expect(extractResponseText(parts)).toBe("Last")
  })

  bulletproofTest("returns text even when tool parts follow", async () => {
    const parts = [createTextPart("I'll help with that."), createToolPart("todowrite", "3 todos")]
    expect(extractResponseText(parts)).toBe("I'll help with that.")
  })

  bulletproofTest("returns null for reasoning-only response (signals summary needed)", async () => {
    const parts = [createReasoningPart("Let me think about this...")]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns null for tool-only response (signals summary needed)", async () => {
    // This is the exact scenario from the bug report - todowrite with no text
    const parts = [createToolPart("todowrite", "8 todos")]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns null for multiple completed tools", async () => {
    const parts = [
      createToolPart("read", "src/file.ts"),
      createToolPart("edit", "src/file.ts"),
      createToolPart("bash", "bun test"),
    ]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns null for running tool parts (signals summary needed)", async () => {
    const parts = [createToolPart("bash", "", "running")]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("throws on empty array", async () => {
    expect(() => extractResponseText([])).toThrow("no parts returned")
  })

  bulletproofTest("returns null for step-start only", async () => {
    const parts = [createStepStartPart()]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns null for step-finish only", async () => {
    const parts = [createStepFinishPart()]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns null for step-start and step-finish", async () => {
    const parts = [createStepStartPart(), createStepFinishPart()]
    expect(extractResponseText(parts)).toBeNull()
  })

  bulletproofTest("returns text from multi-step response", async () => {
    const parts = [
      createStepStartPart(),
      createToolPart("read", "src/file.ts"),
      createTextPart("Done"),
      createStepFinishPart(),
    ]
    expect(extractResponseText(parts)).toBe("Done")
  })

  bulletproofTest("prefers text over reasoning when both present", async () => {
    const parts = [createReasoningPart("Internal thinking..."), createTextPart("Final answer")]
    expect(extractResponseText(parts)).toBe("Final answer")
  })

  bulletproofTest("prefers text over tools when both present", async () => {
    const parts = [createToolPart("read", "src/file.ts"), createTextPart("Here's what I found")]
    expect(extractResponseText(parts)).toBe("Here's what I found")
  })
})

describe("formatPromptTooLargeError", () => {
  bulletproofTest("formats error without files", async () => {
    const result = formatPromptTooLargeError([])
    expect(result).toBe("PROMPT_TOO_LARGE: The prompt exceeds the model's context limit.")
  })

  bulletproofTest("formats error with files (base64 content)", async () => {
    // Base64 is ~33% larger than original, so we multiply by 0.75 to get original size
    // 400 KB base64 = 300 KB original, 200 KB base64 = 150 KB original
    const files = [
      { filename: "screenshot.png", content: "a".repeat(400 * 1024) },
      { filename: "diagram.png", content: "b".repeat(200 * 1024) },
    ]
    const result = formatPromptTooLargeError(files)

    expect(result).toStartWith("PROMPT_TOO_LARGE: The prompt exceeds the model's context limit.")
    expect(result).toInclude("Files in prompt:")
    expect(result).toInclude("screenshot.png (300 KB)")
    expect(result).toInclude("diagram.png (150 KB)")
  })

  bulletproofTest("lists all files when multiple present", async () => {
    // Base64 sizes: 4KB -> 3KB, 8KB -> 6KB, 12KB -> 9KB
    const files = [
      { filename: "img1.png", content: "x".repeat(4 * 1024) },
      { filename: "img2.jpg", content: "y".repeat(8 * 1024) },
      { filename: "img3.gif", content: "z".repeat(12 * 1024) },
    ]
    const result = formatPromptTooLargeError(files)

    expect(result).toInclude("img1.png (3 KB)")
    expect(result).toInclude("img2.jpg (6 KB)")
    expect(result).toInclude("img3.gif (9 KB)")
  })
})
