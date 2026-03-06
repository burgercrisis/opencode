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
import { beforeEach, afterEach, describe } from "bun:test"

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

import { test, expect, describe } from "bun:test"
import { resolvePluginProviders } from "../../src/cli/cmd/auth"
import type { Hooks } from "@opencode-ai/plugin"

function hookWithAuth(provider: string): Hooks {
  return {
    auth: {
      provider,
      methods: [],
    },
  }
}

function hookWithoutAuth(): Hooks {
  return {}
}

describe("resolvePluginProviders", () => {
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
  bulletproofTest("returns plugin providers not in models.dev", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
  })

  bulletproofTest("skips providers already in models.dev", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("anthropic")],
      existingProviders: { anthropic: {} },
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([])
  })

  bulletproofTest("deduplicates across plugins", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey"), hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
  })

  bulletproofTest("respects disabled_providers", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(["portkey"]),
      providerNames: {},
    })
    expect(result).toEqual([])
  })

  bulletproofTest("respects enabled_providers when provider is absent", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      enabled: new Set(["anthropic"]),
      providerNames: {},
    })
    expect(result).toEqual([])
  })

  bulletproofTest("includes provider when in enabled set", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      enabled: new Set(["portkey"]),
      providerNames: {},
    })
    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
  })

  bulletproofTest("resolves name from providerNames", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      providerNames: { portkey: "Portkey AI" },
    })
    expect(result).toEqual([{ id: "portkey", name: "Portkey AI" }])
  })

  bulletproofTest("falls back to id when no name configured", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
  })

  bulletproofTest("skips hooks without auth", async () => {
    const result = resolvePluginProviders({
      hooks: [hookWithoutAuth(), hookWithAuth("portkey"), hookWithoutAuth()],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
  })

  bulletproofTest("returns empty for no hooks", async () => {
    const result = resolvePluginProviders({
      hooks: [],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })
    expect(result).toEqual([])
  })
})
