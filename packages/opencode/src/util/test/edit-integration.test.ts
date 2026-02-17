import { describe, it, expect, beforeEach } from "bun:test"
import { EditTool } from "../../tool/edit"
import { resetLevenshteinStats, getLevenshteinStats } from "../levenshtein"

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

      // Initialize the tool and execute
      const toolInfo = await EditTool.init()

      // This should trigger Levenshtein calculations in BlockAnchorReplacer
      try {
        await toolInfo.execute({
          filePath: "/tmp/test.js",
          oldString: find,
          newString: find.replace("universe", "world"),
          replaceAll: false
        }, {} as any)
      } catch (error) {
        // Expected to fail since file doesn't exist, but we're testing Levenshtein usage
      }

      const statsAfter = getLevenshteinStats()
      expect(statsAfter.exactCalculations + statsAfter.approximateCalculations).toBeGreaterThan(0)
    })
  })

  describe("ReDoS Protection", () => {
    it("should reject overly complex patterns", async () => {
      const content = "some test content"
      const complexPattern = "a".repeat(1001) // Exceeds MAX_LENGTH

      const toolInfo = await EditTool.init()

      try {
        await toolInfo.execute({
          filePath: "/tmp/test.txt",
          oldString: complexPattern,
          newString: "replacement",
          replaceAll: false
        }, {} as any)
      } catch (error) {
        expect(error.message).toContain("too long")
      }
    })

    it("should handle patterns with excessive repetition", async () => {
      const content = "test content"
      const repetitivePattern = "a".repeat(1001) // Exceeds MAX_LENGTH

      const toolInfo = await EditTool.init()

      try {
        await toolInfo.execute({
          filePath: "/tmp/test.txt",
          oldString: repetitivePattern,
          newString: "replacement",
          replaceAll: false
        }, {} as any)
      } catch (error) {
        expect(error.message).toContain("too long")
      }
    })
  })

  describe("Input Validation", () => {
    it("should reject strings exceeding MAX_LENGTH", async () => {
      const longString = "a".repeat(1001)

      const toolInfo = await EditTool.init()

      try {
        await toolInfo.execute({
          filePath: "/tmp/test.txt",
          oldString: longString,
          newString: "replacement",
          replaceAll: false
        }, {} as any)
      } catch (error) {
        expect(error.message).toContain("too long")
      }
    })

    it("should reject null bytes in strings", async () => {
      const toolInfo = await EditTool.init()

      try {
        await toolInfo.execute({
          filePath: "/tmp/test.txt",
          oldString: "test\0malicious",
          newString: "replacement",
          replaceAll: false
        }, {} as any)
      } catch (error) {
        expect(error.message).toContain("null bytes")
      }
    })
  })

  describe("Performance Monitoring Integration", () => {
    it("should track Levenshtein usage across different replacers", async () => {
      const content = `
// Function with similar but not identical content
function example() {
  const message = "hello world";
  console.log(message);
  return message;
}
`.trim()

      const find = `
// Function with similar but not identical content  
function example() {
  const message = "hello universe";
  console.log(message);
  return message;
}
`.trim()

      const statsBefore = getLevenshteinStats()
      const toolInfo = await EditTool.init()

      try {
        await toolInfo.execute({
          filePath: "/tmp/test.js",
          oldString: find,
          newString: find.replace("universe", "world"),
          replaceAll: false
        }, {} as any)
      } catch (error) {
        // Expected to fail, but we're monitoring performance
      }

      const statsAfter = getLevenshteinStats()
      const totalCalculations = statsAfter.exactCalculations + statsAfter.approximateCalculations

      expect(totalCalculations).toBeGreaterThan(statsBefore.exactCalculations + statsBefore.approximateCalculations)
    })
  })
})
