import { describe, test, expect } from "bun:test"
import { replace } from "../edit"

describe("Memory Leak Fix in Edit Tool", () => {
  test("should limit matches to prevent memory exhaustion", () => {
    // Create a large content with many occurrences
    const largeContent = "const test = 'hello';\n".repeat(2000) // 2000 lines

    const oldString = "'hello'"
    const newString = "'world'"

    // This should trigger the memory limit
    const result = replace(largeContent, oldString, newString)

    // Should still work but with limited matches
    expect(result).toContain("'world'")
    expect(result.length).toBeGreaterThan(0)
  })

  test("should use reduced context length to save memory", () => {
    const content = "const test = 'hello world';\n".repeat(100)

    const oldString = "'hello'"
    const newString = "'hi'"

    const result = replace(content, oldString, newString)

    // Should still work
    expect(result).toContain("'hi'")
    expect(result).not.toContain("'hello'")
  })

  test("should handle MultiOccurrenceReplacer with memory limits", () => {
    // Create content with many identical occurrences
    const content = "console.log('test');\n".repeat(1500) // 1500 occurrences

    const oldString = "'test'"
    const newString = "'updated'"

    const result = replace(content, oldString, newString)

    // Should work but limit matches
    expect(result).toContain("'updated'")
    // Should not replace all 1500 occurrences due to memory limit
    const originalCount = (content.match(/'test'/g) || []).length
    const updatedCount = (result.match(/'updated'/g) || []).length
    expect(updatedCount).toBeLessThan(originalCount)
    expect(updatedCount).toBeLessThanOrEqual(1000) // MAX_MATCHES limit
  })

  test("should maintain functionality with memory limits", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}

function helper() {
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = replace(content, oldString, newString)

    // Should still work normally for typical cases
    expect(result).toContain('console.log("world")')
    // Should replace all occurrences when under limit
    const originalCount = (content.match(/console\.log\("hello"\)/g) || []).length
    const updatedCount = (result.match(/console\.log\("world"\)/g) || []).length
    expect(updatedCount).toBe(originalCount)
  })

  test("should warn when reaching memory limit", () => {
    // Spy on console.warn
    const originalWarn = console.warn
    let warnCalled = false
    let warnMessage = ""

    console.warn = (message: string) => {
      warnCalled = true
      warnMessage = message
    }

    try {
      // Create content that will exceed limit
      const largeContent = "const test = 'hello';\n".repeat(2000)

      replace(content, "'hello'", "'world'")

      // Should have warned about memory limit
      expect(warnCalled).toBe(true)
      expect(warnMessage).toContain("Reached maximum match limit")
      expect(warnMessage).toContain("1000")
    } finally {
      // Restore console.warn
      console.warn = originalWarn
    }
  })

  test("should handle edge case with exactly MAX_MATCHES", () => {
    // Create content with exactly 1000 occurrences
    const content = "test\n".repeat(1000)

    const oldString = "test"
    const newString = "updated"

    const result = replace(content, oldString, newString)

    // Should work exactly at the limit
    expect(result).toContain("updated")
    const updatedCount = (result.match(/updated/g) || []).length
    expect(updatedCount).toBeLessThanOrEqual(1000)
  })
})
