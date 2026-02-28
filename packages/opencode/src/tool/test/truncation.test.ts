import { describe, test, expect } from "bun:test"
import { Truncate } from "../truncation"

describe("Truncation", () => {
  describe("output", () => {
    test("should return content unchanged when under limits", async () => {
      const text = "Hello world\n".repeat(100)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    test("should truncate when exceeding line limit", async () => {
      const text = "Line\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
        expect(result.content).toContain("truncated")
      }
    })

    test("should truncate when exceeding byte limit", async () => {
      const text = "A".repeat(100 * 1024)
      const result = await Truncate.output(text, { maxBytes: 1024 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
      }
    })

    test("should handle tail direction", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxLines: 10, direction: "tail" })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.content).toContain("Line 90")
        expect(result.content).toContain("Line 99")
      }
    })

    test("should handle tail direction with byte limit", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i + " with some content")
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxBytes: 200, direction: "tail" })
      expect(result.truncated).toBe(true)
    })

    test("should save truncated content to file", async () => {
      const text = "Test content\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        const fileContent = await Bun.file(result.outputPath).text()
        expect(fileContent).toBe(text)
      }
    })
  })

  describe("constants", () => {
    test("should have correct MAX_LINES", () => {
      expect(Truncate.MAX_LINES).toBe(2000)
    })

    test("should have correct MAX_BYTES", () => {
      expect(Truncate.MAX_BYTES).toBe(50 * 1024)
    })
  })
})
import { Truncate } from "../truncation"

describe("Truncation", () => {
  describe("output", () => {
    test("should return content unchanged when under limits", async () => {
      const text = "Hello world\n".repeat(100)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    test("should truncate when exceeding line limit", async () => {
      const text = "Line\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
        expect(result.content).toContain("truncated")
      }
    })

    test("should truncate when exceeding byte limit", async () => {
      const text = "A".repeat(100 * 1024)
      const result = await Truncate.output(text, { maxBytes: 1024 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.outputPath).toBeDefined()
      }
    })

    test("should handle tail direction", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxLines: 10, direction: "tail" })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        expect(result.content).toContain("Line 90")
        expect(result.content).toContain("Line 99")
      }
    })

    test("should handle tail direction with byte limit", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i + " with some content")
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxBytes: 200, direction: "tail" })
      expect(result.truncated).toBe(true)
    })

    test("should save truncated content to file", async () => {
      const text = "Test content\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 })
      expect(result.truncated).toBe(true)
      if (result.truncated) {
        const fileContent = await Bun.file(result.outputPath).text()
        expect(fileContent).toBe(text)
      }
    })
  })

  describe("constants", () => {
    test("should have correct MAX_LINES", () => {
      expect(Truncate.MAX_LINES).toBe(2000)
    })

    test("should have correct MAX_BYTES", () => {
      expect(Truncate.MAX_BYTES).toBe(50 * 1024)
    })
  })
})

