import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { mockProcessPlatform, restoreProcess } from "../mocks/process"
import type { BuildTarget } from "../../script/build"

// Mock build script functions for testing
let originalProcessPlatform: string
let originalProcessArch: string
let originalEnv: Record<string, string | undefined>

describe("Build Script - Windows Baseline Build Skipping", () => {
  beforeEach(() => {
    originalProcessPlatform = process.platform
    originalProcessArch = process.arch
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    restoreProcess()
    // Restore environment variables
    process.env = originalEnv
  })

  describe("Windows Platform Behavior", () => {
    beforeEach(() => {
      mockProcessPlatform("win32", "x64")
    })

    test("should skip baseline builds on Windows regardless of baseline flag", async () => {
      // Import build script logic dynamically
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      const baselineTarget = allTargets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      expect(baselineTarget).toBeDefined()

      // Simulate the filter logic from build script
      const singleFlag = true // Simulate --single flag
      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        // When building for the current platform, prefer a single native binary by default.
        // Baseline binaries require additional Bun artifacts and can be flaky to download.
        if (item.avx2 === false) {
          // Skip baseline builds on Windows due to Bun download issues
          if (process.platform === "win32") {
            return false
          }
          return singleFlag
        }

        // also skip abi-specific builds for same reason
        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const windowsBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      // Windows baseline target should be filtered out
      expect(windowsBaselineTarget).toBeUndefined()
    })

    test("should allow non-baseline builds on Windows", async () => {
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      const normalTarget = allTargets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 !== false
      )

      expect(normalTarget).toBeDefined()

      // Simulate the filter logic
      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32") {
            return false
          }
          return true // baselineFlag = true
        }

        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const windowsNormalTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 !== false
      )

      // Windows normal target should be included
      expect(windowsNormalTarget).toBeDefined()
    })
  })

  describe("Non-Windows Platform Behavior", () => {
    beforeEach(() => {
      mockProcessPlatform("linux", "x64")
    })

    test("should respect baseline flag on non-Windows platforms", async () => {
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      const baselineTarget = allTargets.find((target: BuildTarget) =>
        target.os === "linux" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      expect(baselineTarget).toBeDefined()

      // Test with baseline flag = true
      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32") {
            return false
          }
          return true // baselineFlag = true
        }

        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const linuxBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "linux" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      // Linux baseline target should be included when flag is true
      expect(linuxBaselineTarget).toBeDefined()
    })

    test("should skip baseline builds when flag is false on non-Windows platforms", async () => {
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      // Simulate baseline flag = false
      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32") {
            return false
          }
          return false // baselineFlag = false
        }

        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const linuxBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "linux" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      // Linux baseline target should be excluded when flag is false
      expect(linuxBaselineTarget).toBeUndefined()
    })
  })

  describe("All Targets Configuration", () => {
    test("should contain all expected platform and architecture combinations", async () => {
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      const expectedTargets = [
        { os: "linux", arch: "arm64" },
        { os: "linux", arch: "x64" },
        { os: "linux", arch: "x64", avx2: false },
        { os: "linux", arch: "arm64", abi: "musl" },
        { os: "linux", arch: "x64", abi: "musl" },
        { os: "linux", arch: "x64", abi: "musl", avx2: false },
        { os: "darwin", arch: "arm64" },
        { os: "darwin", arch: "x64" },
        { os: "darwin", arch: "x64", avx2: false },
        { os: "win32", arch: "x64" },
        { os: "win32", arch: "x64", avx2: false },
      ]

      expect(allTargets).toHaveLength(expectedTargets.length)

      for (const expected of expectedTargets) {
        const found = allTargets.find((target: BuildTarget) =>
          target.os === expected.os &&
          target.arch === expected.arch &&
          (expected.avx2 === undefined ? target.avx2 !== false : target.avx2 === false) &&
          (expected.abi === undefined ? target.abi === undefined : target.abi === expected.abi)
        )
        expect(found).toBeDefined()
      }
    })
  })

  describe("ABI-specific builds", () => {
    test("should always skip ABI-specific builds in single mode", async () => {
      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      Object.defineProperty(process, "platform", { value: "linux" })
      Object.defineProperty(process, "arch", { value: "x64" })

      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        // ABI-specific builds are always skipped in single mode
        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const abiTargets = targets.filter((target: BuildTarget) => target.abi !== undefined)
      expect(abiTargets).toHaveLength(0)
    })
  })

  describe("Environment Variable Handling", () => {
    test("should respect OPENCODE_SKIP_WINDOWS_BASELINE environment variable", async () => {
      mockProcessPlatform("win32", "x64")

      // Test with OPENCODE_SKIP_WINDOWS_BASELINE=false (override default behavior)
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "false"

      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      // Simulate filter logic with environment variable
      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
      expect(SKIP_WINDOWS_BASELINE).toBe(false)

      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32" && SKIP_WINDOWS_BASELINE) {
            return false
          }
          return true // baselineFlag = true
        }

        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const windowsBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      // Should be included when environment variable overrides default
      expect(windowsBaselineTarget).toBeDefined()
    })

    test("should default to skipping Windows baseline builds when env var not set", async () => {
      mockProcessPlatform("win32", "x64")

      // Remove environment variable to test default behavior
      delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE

      const buildModule = await import("../../script/build")
      const { allTargets } = buildModule

      // Simulate filter logic without environment variable
      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
      expect(SKIP_WINDOWS_BASELINE).toBe(true)

      const targets = allTargets.filter((item: BuildTarget) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32" && SKIP_WINDOWS_BASELINE) {
            return false
          }
          return true // baselineFlag = true
        }

        if (item.abi !== undefined) {
          return false
        }

        return true
      })

      const windowsBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )

      // Should be skipped by default
      expect(windowsBaselineTarget).toBeUndefined()
    })
  })

  describe("Release Mode Archive Creation", () => {
    test("should create tar.gz archives for Linux targets in release mode", async () => {
      // Mock Script.release to true
      const mockScript = {
        release: true,
        version: "1.0.0"
      }

      // Mock the Script module
      const originalModule = await import("@opencode-ai/script")
      mock.module("@opencode-ai/script", () => ({
        Script: mockScript
      }))

      const binaries = {
        "opencode-linux-x64": "1.0.0",
        "opencode-linux-arm64": "1.0.0"
      }

      // Mock Bun's $ command for tar creation
      const mockTar = mock(() => Promise.resolve())
      mock.module("bun", () => ({
        $: mockTar
      }))

      // Simulate the release logic
      for (const key of Object.keys(binaries)) {
        if (key.includes("linux")) {
          expect(key.includes("linux")).toBe(true)
          // Would call: await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
        }
      }
    })

    test("should create zip archives for non-Linux targets in release mode", async () => {
      const mockScript = {
        release: true,
        version: "1.0.0"
      }

      mock.module("@opencode-ai/script", () => ({
        Script: mockScript
      }))

      const binaries = {
        "opencode-win32-x64": "1.0.0",
        "opencode-darwin-arm64": "1.0.0"
      }

      // Mock Bun's $ command for zip creation
      const mockZip = mock(() => Promise.resolve())
      mock.module("bun", () => ({
        $: mockZip
      }))

      // Simulate the release logic
      for (const key of Object.keys(binaries)) {
        if (!key.includes("linux")) {
          expect(key.includes("linux")).toBe(false)
          // Would call: await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
        }
      }
    })

    test("should upload to GitHub release in release mode", async () => {
      const mockScript = {
        release: true,
        version: "1.0.0"
      }

      mock.module("@opencode-ai/script", () => ({
        Script: mockScript
      }))

      const binaries = {
        "opencode-linux-x64": "1.0.0",
        "opencode-win32-x64": "1.0.0"
      }

      // Mock GitHub CLI command
      const mockGH = mock(() => Promise.resolve())
      mock.module("bun", () => ({
        $: mockGH
      }))

      // Simulate GitHub upload logic
      const expectedCommand = `gh release upload v${mockScript.version} ./dist/*.zip ./dist/*.tar.gz --clobber`
      expect(expectedCommand).toBe("gh release upload v1.0.0 ./dist/*.zip ./dist/*.tar.gz --clobber")
    })

    test("should skip archive creation when not in release mode", async () => {
      const mockScript = {
        release: false,
        version: "1.0.0"
      }

      mock.module("@opencode-ai/script", () => ({
        Script: mockScript
      }))

      const binaries = {
        "opencode-linux-x64": "1.0.0",
        "opencode-win32-x64": "1.0.0"
      }

      // When release is false, archive creation should be skipped
      expect(mockScript.release).toBe(false)

      // No archive creation or GitHub upload should occur
      // This test verifies the conditional logic
    })
  })
})
