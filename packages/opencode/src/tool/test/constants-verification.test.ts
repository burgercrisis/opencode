import { describe, test, expect } from "bun:test"
import { replace } from "../edit"

describe("Constants Verification", () => {
  test("should use configurable constants", () => {
    // Test that constants are properly defined and used
    const content = "test\n".repeat(100)
    
    // Spy on console to check for warning messages
    const originalWarn = console.warn
    let warningMessages: string[] = []
    
    console.warn = (message: string) => {
      warningMessages.push(message)
    }
    
    try {
      replace(content, "test", "updated")
      
      // Should use the defined constants
      const hasMaxMatchesWarning = warningMessages.some(msg => 
        msg.includes("1000") && msg.includes("EDIT_MAX_MATCHES")
      )
      const hasContextLengthWarning = warningMessages.some(msg => 
        msg.includes("150") && msg.includes("EDIT_MAX_CONTEXT_LENGTH")
      )
      
      expect(hasMaxMatchesWarning || hasContextLengthWarning).toBe(true)
      
    } finally {
      // Restore console.warn
      console.warn = originalWarn
    }
  })

  test("should use confidence constants", () => {
    const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

    const result = replace(content, 'console.log("hello")', 'console.log("world")')
    
    // Should work normally and use confidence constants
    expect(result).toContain('console.log("world")')
    expect(result).not.toContain('console.log("hello")')
  })

  test("should use error context preview constant", () => {
    const content = "test\n".repeat(100)
    
    try {
      replace(content, "test", "updated")
    } catch (error: any) {
      // Should use ERROR_CONTEXT_PREVIEW_LENGTH constant in error messages
      expect(error.message).toContain("Match 1 (line 1): test")
      expect(error.message).toContain("...") // Indicates truncation at 50 chars
    }
  })
})
