import { describe, test, expect } from "bun:test"
import { replace } from "../edit"

describe("Memory Leak Fix in Edit Tool", () => {
  test("should throw error for multiple matches", () => {
    // Create a large content with many occurrences
    const largeContent = "const test = 'hello';\n".repeat(2000) // 2000 lines

    const oldString = "'hello'"
    const newString = "'world'"

    // This should throw because there are multiple matches
    expect(() => replace(largeContent, oldString, newString)).toThrow("Found multiple matches")
  })

  test("should replace unique match", () => {
    const content = "const test = 'hello';\n"

    const oldString = "'hello'"
    const newString = "'hi'"

    const result = replace(content, oldString, newString)

    // Should still work
    expect(result).toContain("'hi'")
    expect(result).not.toContain("'hello'")
  })

  test("should replace all with replaceAll flag", () => {
    // Create content with many identical occurrences
    const content = "console.log('test');\n".repeat(1500) // 1500 occurrences

    const oldString = "'test'"
    const newString = "'updated'"

    const result = replace(content, oldString, newString, true)

    // Should replace all with replaceAll flag
    expect(result).toContain("'updated'")
    const updatedCount = (result.match(/'updated'/g) || []).length
    expect(updatedCount).toBe(1500)
  })

  test("should maintain functionality for unique matches", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("world")
}

function helper() {
  console.log("foo")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("replaced")'

    const result = replace(content, oldString, newString)

    // Should still work normally for unique match
    expect(result).toContain('console.log("replaced")')
    expect(result).not.toContain('console.log("hello")')
    // Other content should remain
    expect(result).toContain('console.log("world")')
    expect(result).toContain('console.log("foo")')
  })

  test("should throw error for identical strings", () => {
    const content = "test content"
    
    expect(() => replace(content, "test", "test")).toThrow(
      "No changes to apply: oldString and newString are identical."
    )
  })

  test("should handle edge case with exactly 1000 matches", () => {
    // Create content with exactly 1000 occurrences
    const content = "test\n".repeat(1000)

    const oldString = "test"
    const newString = "updated"

    // Should throw because there are multiple matches
    expect(() => replace(content, oldString, newString)).toThrow("Found multiple matches")
  })
})
