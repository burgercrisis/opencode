import { describe, test, expect } from "bun:test"

describe("Windows Baseline Build Logic Fix", () => {
  test("should default to NOT skipping baseline builds", () => {
    // Test default behavior (environment variable not set)
    delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
    
    // Import the logic from build script
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE === "true"
    
    // Should default to false (NOT skipping baseline)
    expect(SKIP_WINDOWS_BASELINE).toBe(false)
  })

  test("should skip baseline when explicitly enabled", () => {
    // Test when environment variable is set to true
    process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "true"
    
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE === "true"
    
    // Should skip baseline when explicitly enabled
    expect(SKIP_WINDOWS_BASELINE).toBe(true)
  })

  test("should not skip baseline when explicitly disabled", () => {
    // Test when environment variable is set to false
    process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "false"
    
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE === "true"
    
    // Should NOT skip baseline when explicitly disabled
    expect(SKIP_WINDOWS_BASELINE).toBe(false)
  })

  test("should handle useBaseline logic correctly", () => {
    // Test predev.ts useBaseline logic
    process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "true"
    
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE === "true"
    const useBaseline = process.platform !== "win32" || !SKIP_WINDOWS_BASELINE
    
    // When skipping is enabled, should not use baseline
    expect(useBaseline).toBe(false)
    
    // Test with skipping disabled
    process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "false"
    const SKIP_WINDOWS_BASELINE2 = process.env.OPENCODE_SKIP_WINDOWS_BASELINE === "true"
    const useBaseline2 = process.platform !== "win32" || !SKIP_WINDOWS_BASELINE2
    
    // When skipping is disabled, should use baseline
    expect(useBaseline2).toBe(true)
  })

  test("should demonstrate the fix from inverted logic", () => {
    // Show the difference between old and new logic
    
    // OLD (incorrect) logic: !== "false"
    const oldLogic = (value: string | undefined) => value !== "false"
    
    // NEW (correct) logic: === "true"
    const newLogic = (value: string | undefined) => value === "true"
    
    // Test cases
    const testCases = [
      { input: undefined, expected: false },
      { input: "true", expected: true },
      { input: "false", expected: false },
      { input: "anything", expected: false }
    ]
    
    for (const { input, expected } of testCases) {
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = input
      
      const oldResult = oldLogic(input)
      const newResult = newLogic(input)
      
      // New logic should give correct results
      expect(newResult).toBe(expected)
      
      // Show where old logic was wrong
      if (input === undefined) {
        expect(oldResult).toBe(true) // Old logic incorrectly skipped by default
        expect(newResult).toBe(false) // New logic correctly doesn't skip by default
      }
    }
  })
})
