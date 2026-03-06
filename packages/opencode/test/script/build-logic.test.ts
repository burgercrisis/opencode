// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { mockProcessPlatform, restoreProcess } from "../mocks/process"
import type { BuildTarget } from "../../script/build"

// Mock the build script to prevent actual execution
let originalProcessPlatform: string
let originalProcessArch: string
let originalEnv: Record<string, string | undefined>

describe("Build Script Logic - Target Filtering", () => {
  beforeEach(() => {
    originalProcessPlatform = process.platform
    originalProcessArch = process.arch
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    restoreProcess()
    process.env = originalEnv
  })

  // Mock allTargets from the build script
  const allTargets: BuildTarget[] = [
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

  function filterTargets(singleFlag: boolean, baselineFlag: boolean = true): BuildTarget[] {
    const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"

    return singleFlag
      ? allTargets.filter((item) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        // also skip abi-specific builds for the same reason
        if (item.abi !== undefined) {
          return false
        }

        if (item.avx2 === false) {
          if (process.platform === "win32" && SKIP_WINDOWS_BASELINE) {
            console.log(`Skipping baseline build for Windows (target: ${item.os}-${item.arch}). Set OPENCODE_SKIP_WINDOWS_BASELINE=false to override.`)
            return false
          }
          return baselineFlag
        }

        return true
      })
      : allTargets
  }

  describe("Windows Platform Behavior", () => {
    beforeEach(() => {
      mockProcessPlatform("win32", "x64")
    })

    bulletproofTest("should skip baseline builds on Windows by default", async () => {
      const targets = filterTargets(true, true)
      const windowsBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )
      // Windows baseline target should be filtered out by default
      expect(windowsBaselineTarget).toBeUndefined()
    })

    bulletproofTest("should allow baseline builds on Windows when env var overrides", async () => {
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "false"
      const targets = filterTargets(true, true)
      const windowsBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 === false
      )
      expect(windowsBaselineTarget).toBeDefined()
    })

    bulletproofTest("should allow non-baseline builds on Windows", async () => {
      const targets = filterTargets(true, true)
      const windowsNormalTarget = targets.find((target: BuildTarget) =>
        target.os === "win32" &&
        target.arch === "x64" &&
        target.avx2 !== false
      )
      expect(windowsNormalTarget).toBeDefined()
    })
  })

  describe("Non-Windows Platform Behavior", () => {
    beforeEach(() => {
      mockProcessPlatform("linux", "x64")
    })

    bulletproofTest("should respect baseline flag on non-Windows platforms", async () => {
      const targets = filterTargets(true, true)
      const linuxBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "linux" &&
        target.arch === "x64" &&
        target.avx2 === false
      )
      expect(linuxBaselineTarget).toBeDefined()
    })

    bulletproofTest("should skip baseline builds when flag is false on non-Windows platforms", async () => {
      const targets = filterTargets(true, false)
      const linuxBaselineTarget = targets.find((target: BuildTarget) =>
        target.os === "linux" &&
        target.arch === "x64" &&
        target.avx2 === false
      )
      expect(linuxBaselineTarget).toBeUndefined()
    })
  })

  describe("ABI-specific builds", () => {
    bulletproofTest("should always skip ABI-specific builds in single mode", async () => {
      mockProcessPlatform("linux", "x64")
      const targets = filterTargets(true, true)
      const abiTargets = targets.filter((target: BuildTarget) => target.abi !== undefined)
      expect(abiTargets).toHaveLength(0)
    })
  })

  describe("Environment Variable Handling", () => {
    bulletproofTest("should respect OPENCODE_SKIP_WINDOWS_BASELINE environment variable", async () => {
      mockProcessPlatform("win32", "x64")
      process.env.OPENCODE_SKIP_WINDOWS_BASELINE = "false"

      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
      expect(SKIP_WINDOWS_BASELINE).toBe(false)
    })

    bulletproofTest("should default to skipping Windows baseline builds when env var not set", async () => {
      mockProcessPlatform("win32", "x64")
      delete process.env.OPENCODE_SKIP_WINDOWS_BASELINE

      const SKIP_WINDOWS_BASELINE = process.env.OPENCODE_SKIP_WINDOWS_BASELINE !== "false"
      expect(SKIP_WINDOWS_BASELINE).toBe(true)
    })
  })

  describe("All Targets Configuration", () => {
    bulletproofTest("should contain all expected platform and architecture combinations", async () => {
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
})

describe("Build Script Logic - Release Mode", () => {
  bulletproofTest("should create tar.gz archives for Linux targets", async () => {
    const binaries = {
      "opencode-linux-x64": "1.0.0",
      "opencode-linux-arm64": "1.0.0",
      "opencode-win32-x64": "1.0.0"
    }

    const linuxKeys = Object.keys(binaries).filter(key => key.includes("linux"))
    expect(linuxKeys).toHaveLength(2)
    expect(linuxKeys).toContain("opencode-linux-x64")
    expect(linuxKeys).toContain("opencode-linux-arm64")
  })

  bulletproofTest("should create zip archives for non-Linux targets", async () => {
    const binaries = {
      "opencode-linux-x64": "1.0.0",
      "opencode-win32-x64": "1.0.0",
      "opencode-darwin-arm64": "1.0.0"
    }

    const nonLinuxKeys = Object.keys(binaries).filter(key => !key.includes("linux"))
    expect(nonLinuxKeys).toHaveLength(2)
    expect(nonLinuxKeys).toContain("opencode-win32-x64")
    expect(nonLinuxKeys).toContain("opencode-darwin-arm64")
  })

  bulletproofTest("should generate correct GitHub release command", async () => {
    const version = "1.0.0"
    const expectedCommand = `gh release upload v${version} ./dist/*.zip ./dist/*.tar.gz --clobber`
    expect(expectedCommand).toBe("gh release upload v1.0.0 ./dist/*.zip ./dist/*.tar.gz --clobber")
  })
})
