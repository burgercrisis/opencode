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
import { Flag } from "../flag"

describe("Flag", () => {
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
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe("truthy function", () => {
    it("should return true for 'true' string", () => {
      process.env.TEST_FLAG = "true"
      // Re-import the module to pick up new env var
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(true)
    })

    it("should return true for '1' string", () => {
      process.env.TEST_FLAG = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(true)
    })

    it("should return false for 'false' string", () => {
      process.env.TEST_FLAG = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(false)
    })

    it("should return false for '0' string", () => {
      process.env.TEST_FLAG = "0"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(false)
    })

    it("should return false for undefined", () => {
      delete process.env.TEST_FLAG
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(false)
    })

    it("should be case insensitive", () => {
      process.env.TEST_FLAG = "TRUE"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(true)
      
      process.env.TEST_FLAG = "True"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_AUTO_SHARE).toBe(true)
    })
  })

  describe("string flags", () => {
    it("should handle OPENCODE_GIT_BASH_PATH", () => {
      const testPath = "/custom/git/bash"
      process.env.OPENCODE_GIT_BASH_PATH = testPath
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_GIT_BASH_PATH).toBe(testPath)
    })

    it("should trim whitespace from OPENCODE_GIT_BASH_PATH", () => {
      process.env.OPENCODE_GIT_BASH_PATH = "  /custom/path  "
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_GIT_BASH_PATH).toBe("/custom/path")
    })

    it("should handle null bytes in OPENCODE_GIT_BASH_PATH", () => {
      process.env.OPENCODE_GIT_BASH_PATH = "/path\0with\0null\0bytes"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_GIT_BASH_PATH).toBe("/pathwithnullbytes")
    })

    it("should handle OPENCODE_CONFIG", () => {
      const testConfig = "/custom/config.json"
      process.env.OPENCODE_CONFIG = testConfig
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CONFIG).toBe(testConfig)
    })

    it("should handle OPENCODE_CONFIG_CONTENT", () => {
      const testContent = '{"key": "value"}'
      process.env.OPENCODE_CONFIG_CONTENT = testContent
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CONFIG_CONTENT).toBe(testContent)
    })

    it("should handle OPENCODE_PERMISSION", () => {
      const testPermission = "read-write"
      process.env.OPENCODE_PERMISSION = testPermission
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_PERMISSION).toBe(testPermission)
    })

    it("should handle OPENCODE_SERVER_PASSWORD", () => {
      const testPassword = "secret123"
      process.env.OPENCODE_SERVER_PASSWORD = testPassword
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_SERVER_PASSWORD).toBe(testPassword)
    })

    it("should handle OPENCODE_SERVER_USERNAME", () => {
      const testUsername = "admin"
      process.env.OPENCODE_SERVER_USERNAME = testUsername
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_SERVER_USERNAME).toBe(testUsername)
    })

    it("should handle OPENCODE_ENABLE_QUESTION_TOOL", () => {
      process.env.OPENCODE_ENABLE_QUESTION_TOOL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_ENABLE_QUESTION_TOOL).toBe(true)
    })

    it("should handle OPENCODE_MODELS_URL", () => {
      const testUrl = "https://custom.models.url"
      process.env.OPENCODE_MODELS_URL = testUrl
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_MODELS_URL).toBe(testUrl)
    })

    it("should handle OPENCODE_MODELS_PATH", () => {
      const testPath = "/custom/models/path"
      process.env.OPENCODE_MODELS_PATH = testPath
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_MODELS_PATH).toBe(testPath)
    })

    it("should handle OPENCODE_DEBUG_SHELL", () => {
      process.env.OPENCODE_DEBUG_SHELL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DEBUG_SHELL).toBe(true)
    })
  })

  describe("boolean flags", () => {
    it("should handle OPENCODE_AUTO_SHARE", () => {
      process.env.OPENCODE_AUTO_SHARE = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_AUTOUPDATE", () => {
      process.env.OPENCODE_DISABLE_AUTOUPDATE = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_AUTOUPDATE).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_PRUNE", () => {
      process.env.OPENCODE_DISABLE_PRUNE = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_PRUNE).toBe(false)
    })

    it("should handle OPENCODE_DISABLE_TERMINAL_TITLE", () => {
      process.env.OPENCODE_DISABLE_TERMINAL_TITLE = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_TERMINAL_TITLE).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_DEFAULT_PLUGINS", () => {
      process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_LSP_DOWNLOAD", () => {
      process.env.OPENCODE_DISABLE_LSP_DOWNLOAD = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_LSP_DOWNLOAD).toBe(false)
    })

    it("should handle OPENCODE_ENABLE_EXPERIMENTAL_MODELS", () => {
      process.env.OPENCODE_ENABLE_EXPERIMENTAL_MODELS = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_AUTOCOMPACT", () => {
      process.env.OPENCODE_DISABLE_AUTOCOMPACT = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_AUTOCOMPACT).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_MODELS_FETCH", () => {
      process.env.OPENCODE_DISABLE_MODELS_FETCH = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_MODELS_FETCH).toBe(false)
    })

    it("should handle OPENCODE_DISABLE_CLAUDE_CODE", () => {
      process.env.OPENCODE_DISABLE_CLAUDE_CODE = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_CLAUDE_CODE).toBe(true)
    })
  })

  describe("derived flags", () => {
    it("should derive OPENCODE_DISABLE_CLAUDE_CODE_PROMPT from OPENCODE_DISABLE_CLAUDE_CODE", () => {
      process.env.OPENCODE_DISABLE_CLAUDE_CODE = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT).toBe(true)
    })

    it("should derive OPENCODE_DISABLE_CLAUDE_CODE_SKILLS from OPENCODE_DISABLE_CLAUDE_CODE", () => {
      process.env.OPENCODE_DISABLE_CLAUDE_CODE = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS).toBe(false)
    })

    it("should derive OPENCODE_DISABLE_EXTERNAL_SKILLS from OPENCODE_DISABLE_CLAUDE_CODE_SKILLS", () => {
      process.env.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe(true)
    })

    it("should derive OPENCODE_DISABLE_EXTERNAL_SKILLS from OPENCODE_DISABLE_CLAUDE_CODE", () => {
      process.env.OPENCODE_DISABLE_CLAUDE_CODE = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe(true)
    })
  })

  describe("experimental flags", () => {
    it("should handle OPENCODE_EXPERIMENTAL", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_FILEWATCHER", () => {
      process.env.OPENCODE_EXPERIMENTAL_FILEWATCHER = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_FILEWATCHER).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER", () => {
      process.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER).toBe(false)
    })

    it("should handle OPENCODE_EXPERIMENTAL_ICON_DISCOVERY", () => {
      process.env.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY).toBe(true)
    })

    it("should derive OPENCODE_EXPERIMENTAL_ICON_DISCOVERY from OPENCODE_EXPERIMENTAL", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT", () => {
      process.env.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT).toBe(false)
    })

    it("should default OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT to true on Windows", () => {
      const originalPlatform = process.platform
      
      try {
        Object.defineProperty(process, 'platform', { value: 'win32' })
        delete process.env.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT
        delete require.cache[require.resolve("../flag")]
        const { Flag: ReimportedFlag } = require("../flag")
        
        expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT).toBe(true)
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it("should handle OPENCODE_ENABLE_EXA", () => {
      process.env.OPENCODE_ENABLE_EXA = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_ENABLE_EXA).toBe(true)
    })

    it("should derive OPENCODE_ENABLE_EXA from OPENCODE_EXPERIMENTAL", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_ENABLE_EXA).toBe(true)
    })

    it("should derive OPENCODE_ENABLE_EXA from OPENCODE_EXPERIMENTAL_EXA", () => {
      process.env.OPENCODE_EXPERIMENTAL_EXA = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_ENABLE_EXA).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_OXFMT", () => {
      process.env.OPENCODE_EXPERIMENTAL_OXFMT = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_OXFMT).toBe(false)
    })

    it("should handle OPENCODE_EXPERIMENTAL_LSP_TY", () => {
      process.env.OPENCODE_EXPERIMENTAL_LSP_TY = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_LSP_TY).toBe(true)
    })

    it("should handle OPENCODE_DISABLE_FILETIME_CHECK", () => {
      process.env.OPENCODE_DISABLE_FILETIME_CHECK = "1"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_FILETIME_CHECK).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_MARKDOWN", () => {
      process.env.OPENCODE_EXPERIMENTAL_MARKDOWN = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_MARKDOWN).toBe(false)
    })

    it("should handle OPENCODE_EXPERIMENTAL_MSYS_PATHS", () => {
      process.env.OPENCODE_EXPERIMENTAL_MSYS_PATHS = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_MSYS_PATHS).toBe(true)
    })

    it("should handle OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP", () => {
      process.env.OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP).toBe(false)
    })
  })

  describe("numeric flags", () => {
    it("should handle OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS", () => {
      process.env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = "5000"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS).toBe(5000)
    })

    it("should return undefined for invalid numeric values", () => {
      process.env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = "invalid"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS).toBeUndefined()
    })

    it("should return undefined for zero numeric values", () => {
      process.env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = "0"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS).toBeUndefined()
    })

    it("should return undefined for negative numeric values", () => {
      process.env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = "-100"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS).toBeUndefined()
    })

    it("should handle OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX", () => {
      process.env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = "10000"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX).toBe(10000)
    })
  })

  describe("dynamic property getters", () => {
    it("should evaluate OPENCODE_EXPERIMENTAL_PLAN_MODE dynamically", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_PLAN_MODE).toBe(true)
      
      process.env.OPENCODE_EXPERIMENTAL = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_EXPERIMENTAL_PLAN_MODE).toBe(false)
    })

    it("should evaluate OPENCODE_EXPERIMENTAL_LSP_TOOL dynamically", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_LSP_TOOL).toBe(true)
      
      process.env.OPENCODE_EXPERIMENTAL = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_EXPERIMENTAL_LSP_TOOL).toBe(false)
    })

    it("should evaluate OPENCODE_DISABLE_PROJECT_CONFIG dynamically", () => {
      process.env.OPENCODE_DISABLE_PROJECT_CONFIG = "true"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_DISABLE_PROJECT_CONFIG).toBe(true)
      
      process.env.OPENCODE_DISABLE_PROJECT_CONFIG = "false"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_DISABLE_PROJECT_CONFIG).toBe(false)
    })

    it("should evaluate OPENCODE_CONFIG_DIR dynamically", () => {
      const testConfigDir = "/custom/config/dir"
      process.env.OPENCODE_CONFIG_DIR = testConfigDir
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CONFIG_DIR).toBe(testConfigDir)
      
      // Test null byte handling
      process.env.OPENCODE_CONFIG_DIR = "/path\0with\0nulls"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_CONFIG_DIR).toBe("/pathwithnulls")
    })

    it("should evaluate OPENCODE_CLIENT dynamically", () => {
      process.env.OPENCODE_CLIENT = "vscode"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CLIENT).toBe("vscode")
      
      delete process.env.OPENCODE_CLIENT
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag2 } = require("../flag")
      
      expect(ReimportedFlag2.OPENCODE_CLIENT).toBe("cli") // Default value
    })
  })

  describe("special flag values", () => {
    it("should handle OPENCODE_FAKE_VCS", () => {
      const fakeVcs = "test-vcs"
      process.env.OPENCODE_FAKE_VCS = fakeVcs
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_FAKE_VCS).toBe(fakeVcs)
    })

    it("should handle declare flags as undefined", () => {
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CONFIG_DIR).toBeUndefined()
      expect(ReimportedFlag.OPENCODE_CLIENT).toBeUndefined()
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_LSP_TOOL).toBeUndefined()
      expect(ReimportedFlag.OPENCODE_EXPERIMENTAL_PLAN_MODE).toBeUndefined()
      expect(ReimportedFlag.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined()
    })
  })

  describe("edge cases", () => {
    it("should handle empty string environment variables", () => {
      process.env.TEST_FLAG = ""
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(false)
    })

    it("should handle whitespace-only environment variables", () => {
      process.env.TEST_FLAG = "   "
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_AUTO_SHARE).toBe(false)
    })

    it("should handle environment variables with null bytes", () => {
      process.env.TEST_FLAG = "value\0with\0null\0bytes"
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_GIT_BASH_PATH).toBe("valuewithnullbytes")
    })

    it("should handle very long environment variable values", () => {
      const longValue = "a".repeat(1000)
      process.env.OPENCODE_CONFIG_CONTENT = longValue
      delete require.cache[require.resolve("../flag")]
      const { Flag: ReimportedFlag } = require("../flag")
      
      expect(ReimportedFlag.OPENCODE_CONFIG_CONTENT).toBe(longValue)
    })
  })
})
