import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { estimateSessionContextBreakdown } from "./session-context-breakdown"
import { getSessionContextMetrics } from "./session-context-metrics"

const user = (id: string) => {
  return {
    id,
    role: "user",
    time: { created: 1 },
  } as unknown as Message
}

const assistant = (
  id: string,
  tokens: { input: number; output: number; reasoning: number; read: number; write: number },
  cost: number,
  providerID = "openai",
  modelID = "gpt-4.1",
) => {
  return {
    id,
    role: "assistant",
    providerID,
    modelID,
    cost,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cache: {
        read: tokens.read,
        write: tokens.write,
      },
    },
    time: { created: 1 },
  } as unknown as Message
}

const simpleAssistant = (id: string) => {
  return {
    id,
    role: "assistant",
    time: { created: 1 },
  } as unknown as Message
}

describe("session context breakdown", () => {
  test("estimates tokens and keeps remaining tokens as other", () => {
    const messages = [user("u1"), simpleAssistant("a1")]
    const parts = {
      u1: [{ type: "text", text: "hello world" }] as unknown as Part[],
      a1: [{ type: "text", text: "assistant response" }] as unknown as Part[],
    }

    const output = estimateSessionContextBreakdown({
      messages,
      parts,
      input: 20,
      systemPrompt: "system prompt",
    })

    const map = Object.fromEntries(output.map((segment) => [segment.key, segment.tokens]))
    expect(map.system).toBe(4)
    expect(map.user).toBe(3)
    expect(map.assistant).toBe(5)
    expect(map.other).toBe(8)
  })

  test("scales segments when estimates exceed input", () => {
    const messages = [user("u1"), simpleAssistant("a1")]
    const parts = {
      u1: [{ type: "text", text: "x".repeat(400) }] as unknown as Part[],
      a1: [{ type: "text", text: "y".repeat(400) }] as unknown as Part[],
    }

    const output = estimateSessionContextBreakdown({
      messages,
      parts,
      input: 20,
      systemPrompt: "system prompt",
    })

    const map = Object.fromEntries(output.map((segment) => [segment.key, segment.tokens]))
    // Should scale down to fit within input limit
    const totalTokens = Object.values(map).reduce((sum, tokens) => sum + tokens, 0)
    expect(totalTokens).toBeLessThanOrEqual(20)
  })

  test("handles empty parts gracefully", () => {
    const messages = [user("u1"), simpleAssistant("a1")]
    const parts = {}

    const output = estimateSessionContextBreakdown({
      messages,
      parts,
      input: 20,
      systemPrompt: "system prompt",
    })

    expect(output).toHaveLength(3) // system, user, assistant
    expect(output[0].key).toBe("system")
    expect(output[1].key).toBe("u1")
    expect(output[2].key).toBe("a1")
  })

  test("handles empty messages gracefully", () => {
    const messages: Message[] = []
    const parts = {}

    const output = estimateSessionContextBreakdown({
      messages,
      parts,
      input: 20,
      systemPrompt: "system prompt",
    })

    expect(output).toHaveLength(1) // Only system prompt
    expect(output[0].key).toBe("system")
  })
})

describe("session context metrics", () => {
  test("computes totals and usage from latest assistant with tokens", () => {
    const messages = [
      user("u1"),
      assistant("a1", { input: 0, output: 0, reasoning: 0, read: 0, write: 0 }, 0.5),
      assistant("a2", { input: 300, output: 100, reasoning: 50, read: 25, write: 25 }, 1.25),
    ]
    const providers = [
      {
        id: "openai",
        name: "OpenAI",
        models: [
          { id: "gpt-4.1", pricing: { input: 0.01, output: 0.03, reasoning: 0.03, cache: { read: 0.01, write: 0.01 } } },
        ],
      },
    ]

    const metrics = getSessionContextMetrics(messages, providers)

    expect(metrics).toBeDefined()
    expect(metrics.total.input).toBe(300) // Latest assistant with tokens
    expect(metrics.total.output).toBe(100)
    expect(metrics.total.reasoning).toBe(50)
    expect(metrics.total.cache.read).toBe(25)
    expect(metrics.total.cache.write).toBe(25)
    expect(metrics.total.cost).toBe(1.25) // Latest assistant cost
    expect(metrics.usage.input).toBe(300)
    expect(metrics.usage.output).toBe(100)
    expect(metrics.usage.reasoning).toBe(50)
    expect(metrics.usage.cache.read).toBe(25)
    expect(metrics.usage.cache.write).toBe(25)
    expect(metrics.usage.cost).toBe(1.25)
  })

  test("handles messages without tokens gracefully", () => {
    const messages = [
      user("u1"),
      simpleAssistant("a1"),
      user("u2"),
    ]
    const providers = [
      {
        id: "openai",
        name: "OpenAI",
        models: [
          { id: "gpt-4.1", pricing: { input: 0.01, output: 0.03, reasoning: 0.03, cache: { read: 0.01, write: 0.01 } } },
        ],
      },
    ]

    const metrics = getSessionContextMetrics(messages, providers)

    expect(metrics).toBeDefined()
    expect(metrics.total.input).toBe(0)
    expect(metrics.total.output).toBe(0)
    expect(metrics.total.reasoning).toBe(0)
    expect(metrics.total.cache.read).toBe(0)
    expect(metrics.total.cache.write).toBe(0)
    expect(metrics.total.cost).toBe(0)
  })

  test("handles empty messages list", () => {
    const messages: Message[] = []
    const providers = [
      {
        id: "openai",
        name: "OpenAI",
        models: [
          { id: "gpt-4.1", pricing: { input: 0.01, output: 0.03, reasoning: 0.03, cache: { read: 0.01, write: 0.01 } } },
        ],
      },
    ]

    const metrics = getSessionContextMetrics(messages, providers)

    expect(metrics).toBeDefined()
    expect(metrics.total.input).toBe(0)
    expect(metrics.total.output).toBe(0)
    expect(metrics.total.reasoning).toBe(0)
    expect(metrics.total.cache.read).toBe(0)
    expect(metrics.total.cache.write).toBe(0)
    expect(metrics.total.cost).toBe(0)
  })

  test("computes usage from multiple assistant messages", () => {
    const messages = [
      user("u1"),
      assistant("a1", { input: 100, output: 50, reasoning: 25, read: 10, write: 5 }, 0.75),
      assistant("a2", { input: 200, output: 100, reasoning: 50, read: 20, write: 10 }, 1.5),
      assistant("a3", { input: 150, output: 75, reasoning: 30, read: 15, write: 8 }, 1.0),
    ]
    const providers = [
      {
        id: "openai",
        name: "OpenAI",
        models: [
          { id: "gpt-4.1", pricing: { input: 0.01, output: 0.03, reasoning: 0.03, cache: { read: 0.01, write: 0.01 } } },
        ],
      },
    ]

    const metrics = getSessionContextMetrics(messages, providers)

    expect(metrics).toBeDefined()
    expect(metrics.total.input).toBe(150) // Latest assistant (a3)
    expect(metrics.total.output).toBe(75)
    expect(metrics.total.reasoning).toBe(30)
    expect(metrics.total.cache.read).toBe(15)
    expect(metrics.total.cache.write).toBe(8)
    expect(metrics.total.cost).toBe(1.0) // Latest assistant cost
    
    // Usage should sum all assistant messages
    expect(metrics.usage.input).toBe(450) // 100 + 200 + 150
    expect(metrics.usage.output).toBe(225) // 50 + 100 + 75
    expect(metrics.usage.reasoning).toBe(105) // 25 + 50 + 30
    expect(metrics.usage.cache.read).toBe(45) // 10 + 20 + 15
    expect(metrics.usage.cache.write).toBe(23) // 5 + 10 + 8
    expect(metrics.usage.cost).toBe(3.25) // 0.75 + 1.5 + 1.0
  })
})
