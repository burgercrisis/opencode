
import { describe, expect, test, mock } from "bun:test"
import { SessionCompaction } from "./compaction"
import { SessionPrompt } from "./prompt"

// Mock Config.get()
mock.module("@/config/config", () => ({
  Config: {
    get: async () => ({
      compaction: { auto: true }
    })
  }
}))

describe("SessionCompaction.isOverflow", () => {
  test("returns true when model context limit is 0 (uses fallback)", async () => {
    const input = {
      tokens: {
        input: 150000, // Greater than 128000 fallback
        output: 1000,
        cache: { read: 0, write: 0 }
      },
      model: {
        id: "custom-model",
        limit: {
          context: 0, // No limit specified
          output: 4096
        }
      }
    }

    // @ts-ignore
    const result = await SessionCompaction.isOverflow(input)
    expect(result).toBe(true)
  })

  test("returns true when usage exceeds limit", async () => {
    const input = {
      tokens: {
        input: 100000,
        output: 1000,
        cache: { read: 0, write: 0 }
      },
      model: {
        id: "custom-model",
        limit: {
          context: 50000, // Explicit limit
          output: 4096
        }
      }
    }

    // @ts-ignore
    const result = await SessionCompaction.isOverflow(input)
    expect(result).toBe(true)
  })
})
