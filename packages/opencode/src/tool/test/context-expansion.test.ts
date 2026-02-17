import { describe, test, expect } from "bun:test"
import { tryWithContextExpansion } from "../edit"

describe("tryWithContextExpansion", () => {
  test("should find unique match with 1-line expansion", () => {
    const content = `
function test() {
  console.log("hello")
}

function another() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.5)

    // Should find a unique match because function names provide differentiating context
    expect(result).not.toBeNull()
    expect(result).toContain('console.log("world")')
  })

  test("should find unique match with context expansion", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.5)

    // Should find a unique match because function names provide differentiating context
    expect(result).not.toBeNull()
    expect(result).toContain('console.log("world")')
  })

  test("should find unique match when context differs", () => {
    const content = `
function test() {
  // Test function
  console.log("hello")
}

function main() {
  // Main function
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.6)

    // Should find a unique match because the context differs (different comments)
    expect(result).not.toBeNull()
    expect(result).toContain('console.log("world")')
  })

  test("should respect confidence threshold", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    // With high confidence threshold, should return null
    const result = tryWithContextExpansion(content, oldString, newString, 0.9)
    expect(result).toBeNull()
  })

  test("should handle multi-line old strings", () => {
    const content = `
function test() {
  if (true) {
    console.log("hello")
  }
}

function main() {
  if (false) {
    console.log("hello")
  }
}
`.trim()

    const oldString = `if (true) {
    console.log("hello")
  }`
    const newString = `if (true) {
    console.log("world")
  }`

    const result = tryWithContextExpansion(content, oldString, newString, 0.5)

    // Should find unique match because the condition differs (true vs false)
    expect(result).not.toBeNull()
    expect(result).toContain('console.log("world")')
  })

  test("should handle edge cases - single match", () => {
    const content = `
function main() {
  console.log("hello")
}
`.trim()

    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.5)

    // Should work with single match
    expect(result).not.toBeNull()
    expect(result).toContain('console.log("world")')
  })

  test("should handle empty content", () => {
    const result = tryWithContextExpansion("", "test", "replacement", 0.5)
    expect(result).toBeNull()
  })

  test("should handle no matches", () => {
    const content = "function test() { console.log('world'); }"
    const oldString = 'console.log("hello")'
    const newString = 'console.log("world")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.5)
    expect(result).toBeNull()
  })

  test("should give higher confidence for longer strings", () => {
    const content = `
function test() {
  // Some context
  const veryLongVariableName = "some value"
}

function main() {
  // Different context
  const veryLongVariableName = "some value"
}
`.trim()

    const oldString = 'const veryLongVariableName = "some value"'
    const newString = 'const veryLongVariableName = "new value"'

    // Lower threshold should work due to longer string bonus
    const result = tryWithContextExpansion(content, oldString, newString, 0.6)
    expect(result).not.toBeNull()
  })

  test("should handle identical contexts gracefully", () => {
    const content = `
// Helper function
function helper() {
  return true
}

// Main function
function main() {
  if (helper()) {
    console.log("test")
  }
}

// Another function
function another() {
  if (helper()) {
    console.log("test")
  }
}
`.trim()

    const oldString = 'console.log("test")'
    const newString = 'console.log("updated")'

    const result = tryWithContextExpansion(content, oldString, newString, 0.8)

    // Should return null because both matches have identical context
    expect(result).toBeNull()
  })
})
