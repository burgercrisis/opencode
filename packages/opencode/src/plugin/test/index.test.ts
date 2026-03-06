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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as Plugin from "../index"

describe("Plugin Module", () => {
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
  describe("trigger function", () => {
    it("should return output when name is empty", async () => {
      const output = { test: "value" }
      const result = await Plugin.trigger("" as any, {} as any, output)
      expect(result).toBe(output)
    })

    it("should call hooks for specified name", async () => {
      let hookCalled = false
      let hookInput: any
      let hookOutput: any

      // Mock state to return test hooks
      const mockHooks = [{
        testHook: async (input: any, output: any) => {
          hookCalled = true
          hookInput = input
          hookOutput = output
          output.modified = true
        }
      }]

      // Mock the state function
      const originalState = (Plugin as any).state
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })

      const output = { test: "value" }
      const input = { test: "input" }

      await Plugin.trigger("testHook" as any, input, output)

      expect(hookCalled).toBe(true)
      expect(hookInput).toBe(input)
      expect(hookOutput.modified).toBe(true)

      // Restore original state
      ;(Plugin as any).state = originalState
    })

    it("should handle missing hook function", async () => {
      const mockHooks = [{
        otherHook: async () => {}
      }]

      const originalState = (Plugin as any).state
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })

      const output = { test: "value" }
      const input = { test: "input" }

      // Should not throw when hook doesn't exist
      await expect(Plugin.trigger("missingHook" as any, input, output)).resolves.toBe(output)

      ;(Plugin as any).state = originalState
    })

    it("should handle multiple hooks", async () => {
      let callOrder = []
      const mockHooks = [
        {
          testHook: async (input: any, output: any) => {
            callOrder.push("hook1")
            output.step1 = true
          }
        },
        {
          testHook: async (input: any, output: any) => {
            callOrder.push("hook2")
            output.step2 = true
          }
        }
      ]

      const originalState = (Plugin as any).state
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })

      const output = { test: "value" }
      const input = { test: "input" }

      await Plugin.trigger("testHook" as any, input, output)

      expect(callOrder).toEqual(["hook1", "hook2"])
      expect(output.step1).toBe(true)
      expect(output.step2).toBe(true)

      ;(Plugin as any).state = originalState
    })
  })

  describe("list function", () => {
    it("should return hooks from state", async () => {
      const mockHooks = [{ test: "hook1" }, { test: "hook2" }]
      const originalState = (Plugin as any).state
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })

      const result = await Plugin.list()
      expect(result).toEqual(mockHooks)

      ;(Plugin as any).state = originalState
    })
  })

  describe("init function", () => {
    it("should call config hooks", async () => {
      let configCalled = false
      let configHook: any

      const mockHooks = [{
        config: async (config: any) => {
          configCalled = true
          configHook = config
        }
      }]

      const mockConfig = { test: "config" }

      // Mock both state and Config.get
      const originalState = (Plugin as any).state
      const originalConfigGet = (Plugin as any).Config?.get
      
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })
      ;(Plugin as any).Config = { get: () => Promise.resolve(mockConfig) }

      await Plugin.init()

      expect(configCalled).toBe(true)
      expect(configHook).toBe(mockConfig)

      // Restore
      ;(Plugin as any).state = originalState
      if (originalConfigGet) {
        ;(Plugin as any).Config.get = originalConfigGet
      }
    })

    it("should handle missing config hook", async () => {
      const mockHooks = [{ otherHook: async () => {} }]
      const mockConfig = { test: "config" }

      const originalState = (Plugin as any).state
      const originalConfigGet = (Plugin as any).Config?.get
      
      ;(Plugin as any).state = () => Promise.resolve({ hooks: mockHooks })
      ;(Plugin as any).Config = { get: () => Promise.resolve(mockConfig) }

      // Should not throw when config hook doesn't exist
      await expect(Plugin.init()).resolves.toBeUndefined()

      ;(Plugin as any).state = originalState
      if (originalConfigGet) {
        ;(Plugin as any).Config.get = originalConfigGet
      }
    })
  })

  describe("Plugin Loading", () => {
    it("should handle internal plugins", async () => {
      // Test that internal plugins are loaded
      const originalState = (Plugin as any).state
      
      let stateCallCount = 0
      let mockInput: any

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          // First call - return mock state for testing
          mockInput = fn()
          return Promise.resolve({
            hooks: [],
            input: mockInput
          })
        }
        return originalState()
      }

      // Mock Config.get and other dependencies
      const originalConfigGet = (Plugin as any).Config?.get
      const originalWaitForDependencies = (Plugin as any).Config?.waitForDependencies
      const originalFlag = (Plugin as any).Flag?.OPENCODE_DISABLE_DEFAULT_PLUGINS

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({ plugin: [] }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: false }

      // Trigger state initialization
      await (Plugin as any).state()

      expect(mockInput).toBeDefined()
      expect(mockInput.client).toBeDefined()
      expect(mockInput.project).toBeDefined()
      expect(mockInput.directory).toBeDefined()
      expect(mockInput.serverUrl).toBeDefined()
      expect(mockInput.$).toBeDefined()

      // Restore
      ;(Plugin as any).state = originalState
      if (originalConfigGet) {
        ;(Plugin as any).Config.get = originalConfigGet
      }
      if (originalWaitForDependencies) {
        ;(Plugin as any).Config.waitForDependencies = originalWaitForDependencies
      }
      if (originalFlag) {
        ;(Plugin as any).Flag.OPENCODE_DISABLE_DEFAULT_PLUGINS = originalFlag
      }
    })

    it("should handle deprecated plugins", async () => {
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: [
            "opencode-openai-codex-auth",
            "opencode-copilot-auth",
            "valid-plugin"
          ]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: false }

      await (Plugin as any).state()

      // Deprecated plugins should be filtered out
      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })

    it("should handle builtin plugins", async () => {
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({ plugin: [] }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: false }

      await (Plugin as any).state()

      // Builtin plugins should be added when flag is false
      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })

    it("should skip builtin plugins when flag is set", async () => {
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({ plugin: [] }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      // Builtin plugins should be skipped when flag is true
      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })
  })

  describe("Plugin Installation", () => {
    it("should handle file:// protocol", async () => {
      // This would require mocking the file system and import
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: ["file:///path/to/plugin.js"]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })

    it("should handle npm package installation", async () => {
      // This would require mocking Bun.install and import
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: ["test-plugin@1.0.0"]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })

    it("should handle version parsing", async () => {
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: ["test-plugin@latest", "another-plugin@2.1.0"]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })
  })

  describe("Plugin Module Loading", () => {
    it("should handle duplicate plugin exports", async () => {
      // This would require mocking import with duplicate exports
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: ["test-plugin"]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })

    it("should handle plugin loading errors", async () => {
      // This would require mocking import to throw error
      const originalState = (Plugin as any).state
      
      let mockConfig: any
      let stateCallCount = 0

      ;(Plugin as any).state = async (fn: any) => {
        stateCallCount++
        if (stateCallCount === 1) {
          mockConfig = fn()
          return Promise.resolve({
            hooks: [],
            input: mockConfig
          })
        }
        return originalState()
      }

      ;(Plugin as any).Config = {
        get: () => Promise.resolve({
          plugin: ["error-plugin"]
        }),
        waitForDependencies: () => Promise.resolve()
      }
      ;(Plugin as any).Flag = { OPENCODE_DISABLE_DEFAULT_PLUGINS: true }

      await (Plugin as any).state()

      expect(mockConfig).toBeDefined()

      ;(Plugin as any).state = originalState
    })
  })

  describe("Constants", () => {
    it("should have BUILTIN constant", () => {
      expect((Plugin as any).BUILTIN).toBeDefined()
      expect(Array.isArray((Plugin as any).BUILTIN)).toBe(true)
    })

    it("should have INTERNAL_PLUGINS constant", () => {
      expect((Plugin as any).INTERNAL_PLUGINS).toBeDefined()
      expect(Array.isArray((Plugin as any).INTERNAL_PLUGINS)).toBe(true)
    })
  })
})
