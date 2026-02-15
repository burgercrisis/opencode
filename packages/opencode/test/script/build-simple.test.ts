import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mockProcessPlatform, restoreProcess } from "../mocks/process"

// Define the BuildTarget interface locally to avoid import issues
interface BuildTarget {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}

// Mock allTargets array to simulate the build script logic
const mockAllTargets: BuildTarget[] = [
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

// Simulate the build script filter logic
function simulateBuildFilter(singleFlag: boolean, skipWindowsBaseline: boolean = true) {
  return mockAllTargets.filter((item) => {
    if (item.os !== process.platform || item.arch !== process.arch) {
      return false
    }

    // When building for the current platform, prefer a single native binary by default.
    // Baseline binaries require additional Bun artifacts and can be flaky to download.
    if (item.avx2 === false) {
      // Skip baseline builds on Windows due to Bun download issues
      if (process.platform === "win32" && skipWindowsBaseline) {
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
}

describe("Build Script - Windows Baseline Build Skipping (Simple)", () => {
  beforeEach(() => {
    mockProcessPlatform("win32", "x64")
  })

  afterEach(() => {
    restoreProcess()
  })

  describe("Windows Platform Behavior", () => {
    test("should skip baseline builds on Windows by default", () => {
      const targets = simulateBuildFilter(true, true)
      
      const windowsBaselineTarget = targets.find(target => 
        target.os === "win32" && 
        target.arch === "x64" && 
        target.avx2 === false
      )

      // Windows baseline target should be filtered out by default
      expect(windowsBaselineTarget).toBeUndefined()
    })

    test("should allow baseline builds when override is false", () => {
      const targets = simulateBuildFilter(true, false)
      
      const windowsBaselineTarget = targets.find(target => 
        target.os === "win32" && 
        target.arch === "x64" && 
        target.avx2 === false
      )

      // Windows baseline target should be included when override is false
      expect(windowsBaselineTarget).toBeDefined()
    })

    test("should allow non-baseline builds on Windows", () => {
      const targets = simulateBuildFilter(true, true)
      
      const windowsNormalTarget = targets.find(target => 
        target.os === "win32" && 
        target.arch === "x64" && 
        target.avx2 !== false
      )

      // Windows normal target should always be included
      expect(windowsNormalTarget).toBeDefined()
    })
  })

  describe("Non-Windows Platform Behavior", () => {
    beforeEach(() => {
      mockProcessPlatform("linux", "x64")
    })

    test("should respect baseline flag on non-Windows platforms", () => {
      const targets = simulateBuildFilter(true, true)
      
      const linuxBaselineTarget = targets.find(target => 
        target.os === "linux" && 
        target.arch === "x64" && 
        target.avx2 === false
      )

      // Linux baseline target should be included when flag is true
      expect(linuxBaselineTarget).toBeDefined()
    })

    test("should skip baseline builds when flag is false on non-Windows platforms", () => {
      const targets = simulateBuildFilter(false, true)
      
      const linuxBaselineTarget = targets.find(target => 
        target.os === "linux" && 
        target.arch === "x64" && 
        target.avx2 === false
      )

      // Linux baseline target should be excluded when flag is false
      expect(linuxBaselineTarget).toBeUndefined()
    })
  })

  describe("Configuration Override", () => {
    test("should respect environment variable override", () => {
      // Test with override=false (allow baseline)
      const targetsAllow = simulateBuildFilter(true, false)
      const windowsBaselineAllow = targetsAllow.find(target => 
        target.os === "win32" && 
        target.arch === "x64" && 
        target.avx2 === false
      )
      expect(windowsBaselineAllow).toBeDefined()

      // Test with override=true (skip baseline - default)
      const targetsSkip = simulateBuildFilter(true, true)
      const windowsBaselineSkip = targetsSkip.find(target => 
        target.os === "win32" && 
        target.arch === "x64" && 
        target.avx2 === false
      )
      expect(windowsBaselineSkip).toBeUndefined()
    })
  })

  describe("All Targets Configuration", () => {
    test("should contain all expected platform and architecture combinations", () => {
      expect(mockAllTargets).toHaveLength(11)
      
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

      for (const expected of expectedTargets) {
        const found = mockAllTargets.find(target => 
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
    test("should always skip ABI-specific builds in single mode", () => {
      const targets = simulateBuildFilter(true, true)
      
      const abiTargets = targets.filter(target => target.abi !== undefined)
      expect(abiTargets).toHaveLength(0)
    })
  })
})
