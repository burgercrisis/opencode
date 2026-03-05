
// Final Instance protection - runs BEFORE each test
import { beforeAll, beforeEach, afterEach } from "bun:test"

// Import preload to ensure it runs
import "./preload"

// Global state preservation
let globalSavedInstance: any
let globalSavedFilesystem: any
let originalProvide: any

// Save global state at the very beginning
beforeAll(async () => {
  globalSavedInstance = (globalThis as any).Instance
  globalSavedFilesystem = (globalThis as any).Filesystem

  // Save the original provide method
  if (globalSavedInstance && globalSavedInstance.provide) {
    originalProvide = globalSavedInstance.provide
  }
})

// CRITICAL: Restore global state BEFORE each test runs
beforeEach(async () => {
  // First, call the emergency fallback if it exists
  try {
    if (typeof (globalThis as any).ensureInstanceProvide === 'function') {
      (globalThis as any).ensureInstanceProvide()
    }
  } catch (e) {
    // Ignore errors
  }

  // Restore the original Instance
  if (globalSavedInstance !== undefined) {
    (globalThis as any).Instance = globalSavedInstance
  }

  // Restore Filesystem
  if (globalSavedFilesystem !== undefined) {
    (globalThis as any).Filesystem = globalSavedFilesystem
  }

  // CRITICAL: Ensure provide method is always available
  if (!(globalThis as any).Instance?.provide) {
    console.error("[global-test-setup] CRITICAL: Instance.provide missing, restoring from saved")
    if (originalProvide) {
      (globalThis as any).Instance.provide = originalProvide
    } else {
      // Create emergency provide method
      (globalThis as any).Instance.provide = async (input: any) => {
        console.error("[global-test-setup] EMERGENCY: Using fallback Instance.provide")
        return input.fn()
      }
    }
  }

  // Verify the provide method is working
  if (typeof (globalThis as any).Instance?.provide !== 'function') {
    console.error("[global-test-setup] CRITICAL: Instance.provide still not working!")
    // Last resort - force module reload
    try {
      delete require.cache[require.resolve("../src/project/instance")]
      const { Instance: FreshInstance } = await import("../src/project/instance")
      if (typeof FreshInstance?.provide === 'function') {
        (globalThis as any).Instance = FreshInstance
        console.error("[global-test-setup] Successfully reloaded Instance module")
      }
    } catch (e) {
      console.error("[global-test-setup] Failed to reload Instance module:", e)
    }
  }
})

// Clean up after each test
afterEach(() => {
  // Clean up any mocks that might have been left behind
  try {
    if (typeof mock !== 'undefined' && mock.unmock) {
      mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
})

// Export for potential use in individual tests
export const savedInstance = globalSavedInstance
export const savedFilesystem = globalSavedFilesystem
export const savedProvide = originalProvide
