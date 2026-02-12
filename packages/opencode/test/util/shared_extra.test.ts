import { describe, expect, test } from "bun:test"
import { findLast } from "@opencode-ai/util/array"
import { retry } from "@opencode-ai/util/retry"
import { Slug } from "@opencode-ai/util/slug"

describe("shared util extra", () => {
  describe("array.findLast", () => {
    test("finds last matching element", () => {
      const items = [1, 2, 3, 2, 1]
      expect(findLast(items, (x) => x === 2)).toBe(2)
      expect(findLast(items, (x, i) => x === 2 && i === 1)).toBe(2)
    })

    test("returns undefined if no match", () => {
      expect(findLast([1, 2, 3], (x) => x === 4)).toBeUndefined()
      expect(findLast([], () => true)).toBeUndefined()
    })
  })

  describe("retry", () => {
    test("retries on transient errors", async () => {
      let calls = 0
      const result = await retry(async () => {
        calls++
        if (calls < 3) throw new Error("failed to fetch")
        return "success"
      }, { delay: 1, attempts: 3 })

      expect(result).toBe("success")
      expect(calls).toBe(3)
    })

    test("throws after max attempts", async () => {
      let calls = 0
      const p = retry(async () => {
        calls++
        throw new Error("failed to fetch")
      }, { delay: 1, attempts: 2 })

      await expect(p).rejects.toThrow("failed to fetch")
      expect(calls).toBe(2)
    })

    test("throws immediately on non-transient error", async () => {
      let calls = 0
      const p = retry(async () => {
        calls++
        throw new Error("permanent error")
      }, { delay: 1, attempts: 3 })

      await expect(p).rejects.toThrow("permanent error")
      expect(calls).toBe(1)
    })

    test("handles null error", async () => {
      const p = retry(async () => {
        throw null
      }, { delay: 1, attempts: 2 })
      await expect(p).rejects.toBeNull()
    })
  })

  describe("slug", () => {
    test("creates a slug with two parts", () => {
      const slug = Slug.create()
      expect(slug).toMatch(/^[a-z]+-[a-z]+$/)
    })

    test("generates different slugs", () => {
      const slug1 = Slug.create()
      const slug2 = Slug.create()
      // This might flake but highly unlikely with the current word lists
      expect(slug1).not.toBe(slug2)
    })
  })
})
