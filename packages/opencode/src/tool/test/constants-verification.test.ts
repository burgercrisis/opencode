import { describe, test, expect } from "bun:test"
import { replace } from "../edit"

describe("Constants Verification", () => {
  test("should throw error for multiple matches", () => {
    // Test that multiple matches throw an error
    const content = "test\n".repeat(100)
    
    expect(() => replace(content, "test", "updated")).toThrow(
      "Found multiple matches for oldString. Provide more surrounding context to make the match unique."
    )
  })

  test("should replace unique match", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("world")
}
`.trim()

    const result = replace(content, 'console.log("hello")', 'console.log("replaced")')
    
    // Should work normally for unique match
    expect(result).toContain('console.log("replaced")')
    expect(result).not.toContain('console.log("hello")')
    // Other content should remain
    expect(result).toContain('console.log("world")')
  })

  test("should throw error for not found string", () => {
    const content = "some content here"
    
    expect(() => replace(content, "nonexistent", "updated")).toThrow(
      "Could not find oldString in the file"
    )
  })

  test("should throw error for identical old and new strings", () => {
    const content = "test content"
    
    expect(() => replace(content, "test", "test")).toThrow(
      "No changes to apply: oldString and newString are identical."
    )
  })

  test("should replace with replaceAll flag", () => {
    const content = "test\ntest\ntest\n"
    
    const result = replace(content, "test", "updated", true)
    
    // All occurrences should be replaced
    expect(result).toBe("updated\nupdated\nupdated\n")
  })
})
