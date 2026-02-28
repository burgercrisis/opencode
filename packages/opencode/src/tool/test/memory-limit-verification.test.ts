import { describe, test, expect } from "bun:test"
import { replace } from "../edit"

describe("Memory Limit Verification", () => {
  test("should throw error for multiple matches", () => {
    // Create content with many occurrences
    const content = "test\n".repeat(1500) // 1500 occurrences

    // Should throw because there are multiple matches
    expect(() => replace(content, "test", "updated")).toThrow("Found multiple matches")
  })

  test("should throw error for not found string", () => {
    const content = "prefix-" + "xyz".repeat(100) + "-suffix"

    expect(() => replace(content, "test", "updated")).toThrow(
      "Could not find oldString in the file"
    )
  })

  test("should work normally for unique match", () => {
    // Create content with a unique match
    const content = "prefix-unique-suffix"

    const result = replace(content, "unique", "updated")

    // Should work normally
    expect(result).toContain("updated")
    expect(result).toBe("prefix-updated-suffix")
  })

  test("should replace all with replaceAll flag", () => {
    // Create content with many occurrences
    const content = "test\n".repeat(100) // 100 occurrences

    const result = replace(content, "test", "updated", true)

    // Should replace all with replaceAll flag
    expect(result).toContain("updated")
    const updateCount = (result.match(/updated/g) || []).length
    expect(updateCount).toBe(100)
  })
})
