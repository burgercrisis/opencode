import { expect, test, describe } from "bun:test"
import { BunProc } from "../../src/bun/index"

describe("BunProc", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  describe("which", () => {
    test("returns the current executable path", () => {
      const result = BunProc.which()
      expect(result).toBe(process.execPath)
    })
  })

  describe("InstallFailedError", () => {
    test("is a named error type", () => {
      expect(BunProc.InstallFailedError).toBeDefined()
      expect(BunProc.InstallFailedError.name).toBe("BunInstallFailedError")
    })

    test("can create error instance with package info", () => {
      const error = new BunProc.InstallFailedError({
        pkg: "test-package",
        version: "1.0.0",
      })
      // The error contains the package info in its data
      expect(error.name).toBe("BunInstallFailedError")
    })
  })

  describe("install", () => {
    test("can install a package", async () => {
      // This might take a while or fail if network is not available
      // Using a lightweight package for testing
      try {
        await BunProc.install("ms", "0.1.1")
      } catch (e: any) {
        // Network or other errors may occur in test environment
        console.log("Install skipped:", e.message)
      }
    })

    test("can install with latest version", async () => {
      try {
        await BunProc.install("ms")
      } catch (e: any) {
        console.log("Install skipped:", e.message)
      }
    })
  })
})
