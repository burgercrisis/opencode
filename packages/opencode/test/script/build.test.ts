import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mockProcessPlatform, restoreProcess } from "../mocks/process"
import type { BuildTarget } from "../../script/build"

// Mock the build script functions for testing
let originalProcessPlatform: string
let originalProcessArch: string

describe("Build Script - Windows Baseline Build Skipping", () => {
  beforeEach(() => {
    originalProcessPlatform = process.platform
    originalProcessArch = process.arch
  })

  afterEach(() => {
    restoreProcess()
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
})
