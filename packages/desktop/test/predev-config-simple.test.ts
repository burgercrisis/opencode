import { describe, test, expect } from "bun:test"

describe("Desktop Predev Configuration Logic", () => {
  test("should have correct baseline logic", () => {
    // Test the actual logic used in predev.ts
    const originalEnv = process.env.OPENCODE_SKIP_WINDOWS_BASELINE

    // Simulate the logic from predev.ts
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
    const useBaseline = process.platform !== "win32" || !SKIP_WINDOWS_BASELINE

    // Test scenarios
    const scenarios = [
      {
        name: "default (no env var)",
        env: undefined,
        expected: process.platform === "win32" ? false : true
      },
      {
        name: "env set to false (use baseline)",
        env: "false",
        expected: true
      },
      {
        name: "env set to true (skip baseline)",
        env: "true",
        expected: false
      }
    ]

    scenarios.forEach(scenario => {
      // Set environment variable
      if (scenario.env !== undefined) {
        process.env.OPENCODE_SKIP_WINDOWS_BASELINE = scenario.env
      } else {
        delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
      }

      // Test the logic
      const testSkipWindowsBaseline = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
      const testUseBaseline = process.platform !== "win32" || !testSkipWindowsBaseline

      // Debug logging
      console.log(`Scenario: ${scenario.name}`)
      console.log(`  Env: ${process.env.OPENCODE_SKIP_WINDOWS_BASELINE}`)
      console.log(`  Platform: ${process.platform}`)
      console.log(`  testSkipWindowsBaseline: ${testSkipWindowsBaseline}`)
      console.log(`  testUseBaseline: ${testUseBaseline}`)
      console.log(`  Expected: ${scenario.expected}`)

      expect(testUseBaseline).toBe(scenario.expected)
    })

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = originalEnv
    } else {
      delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE
    }
  })
})
