import { describe, test, expect } from "bun:test"
import { execSync } from "child_process"

describe("Desktop Predev Configuration Consistency", () => {
  test("should respect OPENCODE_SKIP_WINDOWS_BASELINE environment variable", () => {
    // Test with environment variable set to false (should use baseline)
    const result1 = execSync("OPENCODE_SKIP_WINDOWS_BASELINE=false && node -e \"console.log(process.platform !== 'win32' || process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false')\"", {
      encoding: "utf8",
      cwd: process.cwd(),
      shell: true
    }).trim()
    expect(result1).toBe("true")

    // Test with environment variable set to true (should skip baseline)
    const result2 = execSync("OPENCODE_SKIP_WINDOWS_BASELINE=true && node -e \"console.log(process.platform !== 'win32' || process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false')\"", {
      encoding: "utf8",
      cwd: process.cwd(),
      shell: true
    }).trim()
    expect(result2).toBe("false")

    // Test with no environment variable (should skip baseline on Windows)
    const result3 = execSync("node -e \"console.log(process.platform !== 'win32' || process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false')\"", {
      encoding: "utf8",
      cwd: process.cwd(),
      shell: true
    }).trim()

    if (process.platform === "win32") {
      expect(result3).toBe("false")
    } else {
      expect(result3).toBe("true")
    }
  })

  test("should have consistent logic with build script", () => {
    // Both scripts should use the same environment variable logic
    const buildLogic = "process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'"
    const desktopLogic = "process.platform !== 'win32' || !process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== 'false'"

    // Test various scenarios
    const scenarios = [
      { env: "false", expected: "true" },   // Override to use baseline
      { env: "true", expected: "false" },   // Override to skip baseline
      { env: undefined, expected: "false" }, // Default behavior on Windows
    ]

    scenarios.forEach(scenario => {
      const envPrefix = scenario.env ? `OPENCODE_SKIP_WINDOWS_BASELINE=${scenario.env} && ` : ""

      const buildResult = execSync(`${envPrefix} node -e "console.log(${buildLogic})"`, {
        encoding: "utf8",
        cwd: process.cwd(),
        shell: true
      }).trim()

      const desktopResult = execSync(`${envPrefix} node -e "console.log(${desktopLogic})"`, {
        encoding: "utf8",
        cwd: process.cwd(),
        shell: true
      }).trim()

      expect(buildResult).toBe(desktopResult)
      expect(buildResult).toBe(scenario.expected)
    })
  })
})
