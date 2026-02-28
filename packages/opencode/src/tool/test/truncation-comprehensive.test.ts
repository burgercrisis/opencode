import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Truncate } from "../truncation"
import fs from "fs/promises"
import path from "path"
import { Global } from "../../../global"

describe("Truncation", () => {
  describe("constants", () => {
    test("should have correct MAX_LINES", () => {
      expect(Truncate.MAX_LINES).toBe(2000)
    })

    test("should have correct MAX_BYTES", () => {
      expect(Truncate.MAX_BYTES).toBe(50 * 1024)
    })

    test("should have correct DIR", () => {
      expect(Truncate.DIR).toContain("tool-output")
    })

    test("should have correct GLOB pattern", () => {
      expect(Truncate.GLOB).toContain("*")
    })
  })

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

    test("should use default maxLines when not specified", async () => {
      const text = "Line\n".repeat(2500)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(true)
    })

    test("should use default maxBytes when not specified", async () => {
      const text = "A".repeat(60 * 1024)
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(true)
    })

    test("should use default head direction when not specified", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxLines: 10 })
      if (result.truncated) {
        expect(result.content).toContain("Line 0")
        expect(result.content).toContain("Line 9")
        expect(result.content).not.toContain("Line 90")
      }
    })

    test("should handle empty text", async () => {
      const text = ""
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe("")
    })

    test("should handle single line text", async () => {
      const text = "Single line"
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe("Single line")
    })

    test("should handle text with exactly maxLines", async () => {
      // Create 100 lines without trailing newline (exactly 100 lines)
      const text = Array(100).fill("Line").join("\n")
      const result = await Truncate.output(text, { maxLines: 100 })
      // The function returns content, not output
      expect(result.content).toBeDefined()
      expect(result.truncated).toBe(false)
    })

    test("should handle text with exactly maxBytes", async () => {
      const text = "A".repeat(1024)
      const result = await Truncate.output(text, { maxBytes: 1024 })
      expect(result.truncated).toBe(false)
    })

    test("should count bytes correctly with newlines", async () => {
      const lines: string[] = []
      for (let i = 0; i < 100; i++) {
        lines.push("Line " + i)
      }
      const text = lines.join("\n")
      const result = await Truncate.output(text, { maxBytes: 100, direction: "head" })
      expect(result.truncated).toBe(true)
    })

    test("should include hint about task tool when agent has task permission", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {
        permission: [{ permission: "task", pattern: "*", action: "allow" }]
      } as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Task tool")
      }
    })

    test("should include hint about grep/read when agent lacks task permission", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {
        permission: [{ permission: "task", pattern: "*", action: "deny" }]
      } as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })

    test("should handle agent without permission array", async () => {
      const text = "Line\n".repeat(3000)
      const mockAgent = {} as any
      const result = await Truncate.output(text, { maxLines: 100 }, mockAgent)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })

    test("should handle undefined agent", async () => {
      const text = "Line\n".repeat(3000)
      const result = await Truncate.output(text, { maxLines: 100 }, undefined)
      if (result.truncated) {
        expect(result.content).toContain("Grep")
      }
    })
  })

  describe("init", () => {
    test("should register cleanup scheduler", () => {
      // Just verify it doesn't throw
      expect(() => Truncate.init()).not.toThrow()
    })
  })

  describe("cleanup", () => {
    test("should not throw when directory doesn't exist", async () => {
      // Just verify it completes without throwing an error
      // The cleanup function may resolve with undefined
      const result = await Truncate.cleanup()
      expect(result).toBeUndefined()
    })
  })
})