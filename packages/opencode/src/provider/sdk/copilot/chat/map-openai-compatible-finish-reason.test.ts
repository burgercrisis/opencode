import { describe, it, expect } from "bun:test"
import { mapOpenAICompatibleFinishReason } from "../map-openai-compatible-finish-reason"
import type { LanguageModelV2FinishReason } from "@ai-sdk/provider"

describe("mapOpenAICompatibleFinishReason", () => {
  it("should map 'stop' to 'stop'", () => {
    const result = mapOpenAICompatibleFinishReason("stop")
    expect(result).toBe("stop" as LanguageModelV2FinishReason)
  })

  it("should map 'length' to 'length'", () => {
    const result = mapOpenAICompatibleFinishReason("length")
    expect(result).toBe("length" as LanguageModelV2FinishReason)
  })

  it("should map 'content_filter' to 'content-filter'", () => {
    const result = mapOpenAICompatibleFinishReason("content_filter")
    expect(result).toBe("content-filter" as LanguageModelV2FinishReason)
  })

  it("should map 'function_call' to 'tool-calls'", () => {
    const result = mapOpenAICompatibleFinishReason("function_call")
    expect(result).toBe("tool-calls" as LanguageModelV2FinishReason)
  })

  it("should map 'tool_calls' to 'tool-calls'", () => {
    const result = mapOpenAICompatibleFinishReason("tool_calls")
    expect(result).toBe("tool-calls" as LanguageModelV2FinishReason)
  })

  it("should map null to 'unknown'", () => {
    const result = mapOpenAICompatibleFinishReason(null)
    expect(result).toBe("unknown" as LanguageModelV2FinishReason)
  })

  it("should map undefined to 'unknown'", () => {
    const result = mapOpenAICompatibleFinishReason(undefined)
    expect(result).toBe("unknown" as LanguageModelV2FinishReason)
  })

  it("should map empty string to 'unknown'", () => {
    const result = mapOpenAICompatibleFinishReason("")
    expect(result).toBe("unknown" as LanguageModelV2FinishReason)
  })

  it("should map unrecognized finish reasons to 'unknown'", () => {
    const result = mapOpenAICompatibleFinishReason("unrecognized_reason")
    expect(result).toBe("unknown" as LanguageModelV2FinishReason)
  })

  it("should map case-sensitive reasons correctly", () => {
    expect(mapOpenAICompatibleFinishReason("STOP")).toBe("unknown" as LanguageModelV2FinishReason)
    expect(mapOpenAICompatibleFinishReason("Stop")).toBe("unknown" as LanguageModelV2FinishReason)
    expect(mapOpenAICompatibleFinishReason("stop")).toBe("stop" as LanguageModelV2FinishReason)
  })

  it("should handle all known finish reasons", () => {
    const knownReasons = ["stop", "length", "content_filter", "function_call", "tool_calls"]
    const expectedResults = ["stop", "length", "content-filter", "tool-calls", "tool-calls"]
    
    knownReasons.forEach((reason, index) => {
      const result = mapOpenAICompatibleFinishReason(reason)
      expect(result).toBe(expectedResults[index] as LanguageModelV2FinishReason)
    })
  })
})
