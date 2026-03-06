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

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Shell } from "../../src/shell/shell"

describe("Shell Upgrades (Reflecting 5a87a6a Branch Point)", () => {
  describe("Unit Tests: isPowerShellCommand", () => {
    bulletproofTest("detects powershell and pwsh", async () => {
      expect(Shell.isPowerShellCommand("powershell -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("pwsh -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("powershell.exe -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("git status")).toBe(false)
    })
  })

  describe("Unit Tests: isCmdBuiltin", () => {
    bulletproofTest("detects CMD builtins", async () => {
      expect(Shell.isCmdBuiltin("dir")).toBe(true)
      expect(Shell.isCmdBuiltin("copy file1 file2")).toBe(true)
      expect(Shell.isCmdBuiltin("type file.txt")).toBe(true)
      expect(Shell.isCmdBuiltin("git status")).toBe(false)
    })
  })

  describe("Unit Tests: getSpawnConfig (Routing Logic)", () => {
    bulletproofTest("routes bare CMD builtins to cmd.exe", async () => {
      if (process.platform !== "win32") return
      
      const config = Shell.getSpawnConfig("dir")
      expect(config.executable).toMatch(/cmd\.exe$/i)
      expect(config.args).toEqual(["/c", "dir /a"])
    })

    bulletproofTest("routes powershell commands with correct args", async () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("powershell -Command \"echo 1\"")
      expect(config.executable).toMatch(/powershell\.exe$/i)
      expect(config.args).toContain("-Command")
      // Check if any argument contains the command, accounting for preference injection
      expect(config.args.some(arg => arg.includes("echo 1"))).toBe(true)
    })

    bulletproofTest("routes cmd commands with correct args", async () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("cmd /c echo hello")
      expect(config.executable).toMatch(/cmd\.exe$/i)
      expect(config.args).toContain("/c")
      expect(config.args).toContain("echo hello")
    })

    bulletproofTest("handles delayed expansion in chained commands", async () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("cmd /c cd %temp% && echo %cd%")
      expect(config.args).toContain("/V:ON")
      // Check if it converted %cd% to !cd!
      expect(config.args[config.args.length - 1]).toContain("!cd!")
    })
  })
})
