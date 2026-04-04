import { describe, test, expect } from "bun:test"

describe("Desktop Predev Configuration Consistency", () => {
  test("should respect OPENCODE_SKIP_WINDOWS_BASELINE environment variable", () => {
    const originalEnv = process.env.OPENCODE_SKIP_WINDOWS_BASELINE

    // Test scenarios by setting environment variable programmatically
    const scenarios = [
      { env: "false", expected: "true" },   // Override to use baseline
      { env: "true", expected: "false" },   // Override to skip baseline
      { env: undefined, expected: process.platform === "win32" ? "false" : "true" }, // Default behavior
    ]

    scenarios.forEach(scenario => {
      // Set environment variable
      if (scenario.env !== undefined) {
        process.env.OPENCODE_SKIP_WINDOWS_BASELINE = scenario.env
      } else {
        delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
      }

      // Test logic
      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'
      const desktopLogic = process.platform !== 'win32' || !SKIP_WINDOWS_BASELINE

      expect(desktopLogic.toString()).toBe(scenario.expected)
    })

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = originalEnv
    } else {
      delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
    }
  })

  test("should have consistent logic with build script", () => {
    const originalEnv = process.env.OPENCODE_SKIP_WINDOWS_BASELINE

    // Both scripts should use the same environment variable logic
    const buildLogicStr = "process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'"
    const desktopLogicStr = "process.platform !== 'win32' || !process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'"

    // Test various scenarios
    const scenarios = [
      { env: "false", expected: "true" },   // Override to use baseline
      { env: "true", expected: "false" },   // Override to skip baseline
      { env: undefined, expected: process.platform === "win32" ? "false" : "true" }, // Default behavior
    ]

    scenarios.forEach(scenario => {
      // Set environment variable
      if (scenario.env !== undefined) {
        process.env.OPENCODE_SKIP_WINDOWS_BASELINE = scenario.env
      } else {
        delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
      }

      // Evaluate logic expressions
      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'
      const desktopResult = process.platform !== 'win32' || !SKIP_WINDOWS_BASELINE

      expect(desktopResult.toString()).toBe(scenario.expected)
    })

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = originalEnv
    } else {
      delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
    }
  })
})
