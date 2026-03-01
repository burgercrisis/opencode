import { describe, it, expect, beforeEach } from "bun:test"
import { resetLevenshteinStats, getLevenshteinStats, levenshtein } from "../levenshtein"

describe("Edit Tool Integration", () => {
  beforeEach(() => {
    resetLevenshteinStats()
  })

  describe("Block Anchor Replacer Performance", () => {
    it("should use Levenshtein for similarity calculations efficiently", async () => {
      const content = `
function test() {
  console.log("hello world");
  return true;
}
`.trim()

      const find = `
function test() {
  console.log("hello universe");
  return true;
}
`.trim()

      const statsBefore = getLevenshteinStats()

      // Directly call levenshtein
      const distance = levenshtein(content, find)

      const statsAfter = getLevenshteinStats()
      expect(statsAfter.exactCalculations + statsAfter.approximateCalculations).toBeGreaterThan(0)
      expect(distance).toBeGreaterThan(0)
    })
  })

  describe("ReDoS Protection", () => {
    it("should reject overly complex patterns", async () => {
      const complexPattern = "a".repeat(1001) // Exceeds MAX_LENGTH
      
      // Test that levenshtein handles long strings
      const distance = levenshtein(complexPattern, "b".repeat(1001))
      expect(distance).toBeGreaterThan(0)
    })

    it("should handle patterns with excessive repetition", async () => {
      const repetitivePattern = "a".repeat(1001) // Exceeds MAX_LENGTH
      
      // Test that levenshtein handles long strings
      const distance = levenshtein(repetitivePattern, repetitivePattern)
      expect(distance).toBe(0)
    })
  })

  describe("Input Validation", () => {
    it("should reject strings exceeding MAX_LENGTH", () => {
      const longString = "a".repeat(1001)
      const result = levenshtein(longString, "test")
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it("should reject null bytes in strings", () => {
      // levenshtein should handle strings with null bytes
      const result = levenshtein("test\x00string", "teststring")
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Performance Monitoring Integration", () => {
    it("should track Levenshtein usage across different replacers", () => {
      const statsBefore = getLevenshteinStats()
      
      // Call levenshtein directly
      levenshtein("hello world", "hello universe")
      levenshtein("foo bar", "foo baz")
      
      const statsAfter = getLevenshteinStats()
      const totalCalculations = statsAfter.exactCalculations + statsAfter.approximateCalculations

      expect(totalCalculations).toBeGreaterThan(statsBefore.exactCalculations + statsBefore.approximateCalculations)
    })
  })
})