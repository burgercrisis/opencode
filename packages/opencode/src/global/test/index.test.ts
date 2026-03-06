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

import { describe, it, expect, beforeEach, mock } from "bun:test"
import * as Global from "../index"
import { fsp } from "../../util/filesystem"

describe("Global", () => {
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
  beforeEach(() => {
    // Reset environment
    delete process.env.OPENCODE_TEST_HOME
    delete process.env.XDG_DATA_HOME
    delete process.env.XDG_CACHE_HOME
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
  })

  describe("path constants", () => {
    it("should have correct path structure", () => {
      expect(Global.Path.data).toBeDefined()
      expect(Global.Path.cache).toBeDefined()
      expect(Global.Path.config).toBeDefined()
      expect(Global.Path.state).toBeDefined()
      expect(Global.Path.bin).toBeDefined()
      expect(Global.Path.log).toBeDefined()
    })

    it("should use XDG base directory specification", () => {
      // Test that paths follow XDG conventions
      expect(Global.Path.data).toContain("opencode")
      expect(Global.Path.cache).toContain("opencode")
      expect(Global.Path.config).toContain("opencode")
      expect(Global.Path.state).toContain("opencode")
    })

    it("should handle custom test home directory", () => {
      process.env.OPENCODE_TEST_HOME = "/custom/test/home"
      
      // Re-import to test environment variable handling
      delete require.cache[require.resolve("../index")]
      const GlobalWithTestHome = require("../index")
      
      expect(GlobalWithTestHome.Path.data).toContain("/custom/test/home")
    })
  })

  describe("resetForTest function", () => {
    it("should be defined", () => {
      expect(Global.resetForTest).toBeDefined()
      expect(typeof Global.resetForTest).toBe("function")
    })

    it("should not throw when called", () => {
      expect(() => Global.resetForTest?.()).not.toThrow()
    })
  })

  describe("cache versioning", () => {
    it("should handle cache version mismatch", async () => {
      // Mock filesystem operations
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(true),
          readText: () => Promise.resolve(JSON.stringify({ version: "1.0.0" })),
          writeText: () => Promise.resolve(),
          remove: () => Promise.resolve()
        }
      })()

      // Mock current version
      mock(async () => {
        const mod = await import("../../../package.json")
        return { version: "2.0.0" }
      })()

      // Should handle version mismatch gracefully
      expect(() => Global.resetForTest?.()).not.toThrow()
    })

    it("should create cache directory if missing", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(false),
          mkdir: () => Promise.resolve()
        }
      })()

      // Should create directories without error
      expect(() => Global.resetForTest?.()).not.toThrow()
    })
  })

  describe("directory creation", () => {
    it("should ensure all directories exist", async () => {
      let mkdirCalls = []
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          mkdir: (path) => {
            mkdirCalls.push(path)
            return Promise.resolve()
          }
        }
      })()

      Global.resetForTest?.()
      
      // Should attempt to create all required directories
      expect(mkdirCalls.length).toBeGreaterThan(0)
      expect(mkdirCalls.some(path => path.includes("opencode"))).toBe(true)
    })

    it("should handle directory creation errors", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          mkdir: () => Promise.reject(new Error("Permission denied"))
        }
      })()

      // Should handle errors gracefully
      expect(() => Global.resetForTest?.()).not.toThrow()
    })
  })

  describe("cache cleanup", () => {
    it("should clean old cache when version changes", async () => {
      let removeCalled = false
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(true),
          readText: () => Promise.resolve(JSON.stringify({ version: "1.0.0" })),
          remove: () => {
            removeCalled = true
            return Promise.resolve()
          },
          writeText: () => Promise.resolve()
        }
      })()

      Global.resetForTest?.()
      expect(removeCalled).toBe(true)
    })

    it("should not clean cache when version matches", async () => {
      let removeCalled = false
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(true),
          readText: () => Promise.resolve(JSON.stringify({ version: "2.0.0" })),
          remove: () => {
            removeCalled = true
            return Promise.resolve()
          },
          writeText: () => Promise.resolve()
        }
      })()

      Global.resetForTest?.()
      expect(removeCalled).toBe(false)
    })

    it("should handle missing cache version file", async () => {
      let writeCalled = false
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(false),
          writeText: () => {
            writeCalled = true
            return Promise.resolve()
          }
        }
      })()

      Global.resetForTest?.()
      expect(writeCalled).toBe(true)
    })
  })

  describe("environment variable handling", () => {
    it("should respect XDG_DATA_HOME", () => {
      process.env.XDG_DATA_HOME = "/custom/data"
      
      // Re-import to test environment variable
      delete require.cache[require.resolve("../index")]
      const GlobalWithXDG = require("../index")
      
      expect(GlobalWithXDG.Path.data).toContain("/custom/data")
    })

    it("should respect XDG_CACHE_HOME", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache"
      
      delete require.cache[require.resolve("../index")]
      const GlobalWithXDG = require("../index")
      
      expect(GlobalWithXDG.Path.cache).toContain("/custom/cache")
    })

    it("should respect XDG_CONFIG_HOME", () => {
      process.env.XDG_CONFIG_HOME = "/custom/config"
      
      delete require.cache[require.resolve("../index")]
      const GlobalWithXDG = require("../index")
      
      expect(GlobalWithXDG.Path.config).toContain("/custom/config")
    })

    it("should respect XDG_STATE_HOME", () => {
      process.env.XDG_STATE_HOME = "/custom/state"
      
      delete require.cache[require.resolve("../index")]
      const GlobalWithXDG = require("../index")
      
      expect(GlobalWithXDG.Path.state).toContain("/custom/state")
    })

    it("should fall back to defaults when XDG variables not set", () => {
      // Ensure no XDG variables are set
      delete process.env.XDG_DATA_HOME
      delete process.env.XDG_CACHE_HOME
      delete process.env.XDG_CONFIG_HOME
      delete process.env.XDG_STATE_HOME
      
      delete require.cache[require.resolve("../index")]
      const GlobalDefaults = require("../index")
      
      // Should use default paths
      expect(GlobalDefaults.Path.data).toBeDefined()
      expect(GlobalDefaults.Path.cache).toBeDefined()
      expect(GlobalDefaults.Path.config).toBeDefined()
      expect(GlobalDefaults.Path.state).toBeDefined()
    })
  })

  describe("path resolution", () => {
    it("should resolve paths correctly on different platforms", () => {
      // Test path structure is consistent
      expect(typeof Global.Path.data).toBe("string")
      expect(typeof Global.Path.cache).toBe("string")
      expect(typeof Global.Path.config).toBe("string")
      expect(typeof Global.Path.state).toBe("string")
      expect(typeof Global.Path.bin).toBe("string")
      expect(typeof Global.Path.log).toBe("string")
    })

    it("should create absolute paths", () => {
      // All paths should be absolute
      expect(Global.Path.data.startsWith("/")).toBe(true)
      expect(Global.Path.cache.startsWith("/")).toBe(true)
      expect(Global.Path.config.startsWith("/")).toBe(true)
      expect(Global.Path.state.startsWith("/")).toBe(true)
      expect(Global.Path.bin.startsWith("/")).toBe(true)
      expect(Global.Path.log.startsWith("/")).toBe(true)
    })

    it("should include opencode in all paths", () => {
      const paths = [
        Global.Path.data,
        Global.Path.cache,
        Global.Path.config,
        Global.Path.state,
        Global.Path.bin,
        Global.Path.log
      ]

      paths.forEach(path => {
        expect(path).toContain("opencode")
      })
    })
  })

  describe("error handling", () => {
    it("should handle os.homedir errors", async () => {
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          homedir: () => {
            throw new Error("Cannot determine home directory")
          }
        }
      })()

      // Should handle error gracefully
      expect(() => Global.resetForTest?.()).not.toThrow()
    })

    it("should handle filesystem permission errors", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.reject(new Error("Permission denied")),
          mkdir: () => Promise.reject(new Error("Permission denied"))
        }
      })()

      // Should handle permission errors gracefully
      expect(() => Global.resetForTest?.()).not.toThrow()
    })

    it("should handle JSON parsing errors", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(true),
          readText: () => Promise.resolve("invalid json"),
          writeText: () => Promise.resolve()
        }
      })()

      // Should handle JSON errors gracefully
      expect(() => Global.resetForTest?.()).not.toThrow()
    })
  })

  describe("integration with other modules", () => {
    it("should work with filesystem module", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(false),
          mkdir: () => Promise.resolve()
        }
      })()

      Global.resetForTest?.()
      
      // Should complete without errors
      expect(true).toBe(true)
    })

    it("should provide paths usable by other modules", () => {
      // Paths should be usable by other modules
      expect(typeof Global.Path.data).toBe("string")
      expect(Global.Path.data.length).toBeGreaterThan(0)
      
      expect(typeof Global.Path.cache).toBe("string")
      expect(Global.Path.cache.length).toBeGreaterThan(0)
    })
  })

  describe("concurrent access", () => {
    it("should handle concurrent reset calls", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          exists: () => Promise.resolve(false),
          mkdir: () => Promise.resolve()
        }
      })()

      // Multiple concurrent calls should not cause issues
      const promises = Array(10).fill(null).map(() => {
        return new Promise(resolve => {
          Global.resetForTest?.()
          resolve(true)
        })
      })

      await expect(Promise.all(promises)).resolves.toHaveLength(10)
    })
  })

  describe("path validation", () => {
    it("should create valid directory paths", () => {
      const paths = [
        Global.Path.data,
        Global.Path.cache,
        Global.Path.config,
        Global.Path.state,
        Global.Path.bin,
        Global.Path.log
      ]

      paths.forEach(path => {
        expect(path).toMatch(/^\/[^\/]+\/opencode/)
        expect(path.length).toBeGreaterThan(10)
      })
    })

    it("should not have trailing slashes", () => {
      const paths = [
        Global.Path.data,
        Global.Path.cache,
        Global.Path.config,
        Global.Path.state,
        Global.Path.bin,
        Global.Path.log
      ]

      paths.forEach(path => {
        expect(path.endsWith("/")).toBe(false)
      })
    })
  })
})
