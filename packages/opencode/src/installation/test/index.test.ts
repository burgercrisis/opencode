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
import * as Installation from "../index"
import { Bus } from "../../bus/bus"
import { Global } from "../../global"

describe("Installation", () => {
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
    delete process.env.npm_config_user_agent
    delete process.env.npm_config_prefix
    delete process.env.HOME
    delete process.env.USERPROFILE
    delete process.env.ProgramData
    delete process.env.ProgramFiles
    delete process.env.ProgramFiles(x86)
    delete process.env.LOCALAPPDATA
  })

  describe("method function", () => {
    it("should detect npm installation", () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      expect(InstallationWithNPM.method()).toBe("npm")
    })

    it("should detect pnpm installation", () => {
      process.env.npm_config_user_agent = "pnpm/8.0.0 node/18.0.0"
      
      delete require.cache[require.resolve("../index")]
      const InstallationWithPNPM = require("../index")
      
      expect(InstallationWithPNPM.method()).toBe("pnpm")
    })

    it("should detect yarn installation", () => {
      process.env.npm_config_user_agent = "yarn/1.22.0 node/18.0.0"
      
      delete require.cache[require.resolve("../index")]
      const InstallationWithYarn = require("../index")
      
      expect(InstallationWithYarn.method()).toBe("yarn")
    })

    it("should detect bun installation", () => {
      process.env.npm_config_user_agent = "bun/1.0.0 node/18.0.0"
      
      delete require.cache[require.resolve("../index")]
      const InstallationWithBun = require("../index")
      
      expect(InstallationWithBun.method()).toBe("bun")
    })

    it("should detect brew installation on macOS", () => {
      // Mock platform detection
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "darwin"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithBrew = require("../index")
      
      expect(InstallationWithBrew.method()).toBe("brew")
    })

    it("should detect scoop installation on Windows", () => {
      // Mock platform detection
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "win32"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithScoop = require("../index")
      
      expect(InstallationWithScoop.method()).toBe("scoop")
    })

    it("should detect chocolatey installation on Windows", () => {
      // Mock platform detection and check for chocolatey
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "win32"
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "C:\\ProgramData\\chocolatey\\choco.exe"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithChocolatey = require("../index")
      
      expect(InstallationWithChocolatey.method()).toBe("chocolatey")
    })

    it("should return unknown for unsupported platforms", () => {
      // Mock platform detection
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "freebsd"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationUnknown = require("../index")
      
      expect(InstallationUnknown.method()).toBe("unknown")
    })
  })

  describe("info function", () => {
    it("should return installation info", async () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0",
          channel: "stable"
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0),
            stdout: new TextEncoder().encode("latest version: 2.1.0")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      const info = await InstallationModule.info()
      
      expect(info.current).toBe("2.0.0")
      expect(info.latest).toBe("2.1.0")
      expect(info.method).toBeDefined()
      expect(info.channel).toBe("stable")
    })

    it("should handle version check errors", async () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0",
          channel: "stable"
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(1),
            stderr: new TextEncoder().encode("Network error")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      const info = await InstallationModule.info()
      
      expect(info.current).toBe("2.0.0")
      expect(info.latest).toBe("unknown")
      expect(info.method).toBeDefined()
    })
  })

  describe("isPreview function", () => {
    it("should detect preview version", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          channel: "preview"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationPreview = require("../index")
      
      expect(InstallationPreview.isPreview()).toBe(true)
    })

    it("should return false for stable version", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          channel: "stable"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationStable = require("../index")
      
      expect(InstallationStable.isPreview()).toBe(false)
    })
  })

  describe("isLocal function", () => {
    it("should detect local installation", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0-local"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationLocal = require("../index")
      
      expect(InstallationLocal.isLocal()).toBe(true)
    })

    it("should return false for released version", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationReleased = require("../index")
      
      expect(InstallationReleased.isLocal()).toBe(false)
    })
  })

  describe("upgrade function", () => {
    it("should upgrade npm installation", async () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      await InstallationWithNPM.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("npm")
      expect(args).toContain("install")
      expect(args).toContain("-g")
      expect(args).toContain("@opencode/opencode@latest")
    })

    it("should upgrade pnpm installation", async () => {
      process.env.npm_config_user_agent = "pnpm/8.0.0 node/18.0.0"
      
      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithPNPM = require("../index")
      
      await InstallationWithPNPM.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("pnpm")
      expect(args).toContain("install")
      expect(args).toContain("-g")
      expect(args).toContain("@opencode/opencode@latest")
    })

    it("should upgrade yarn installation", async () => {
      process.env.npm_config_user_agent = "yarn/1.22.0 node/18.0.0"
      
      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithYarn = require("../index")
      
      await InstallationWithYarn.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("yarn")
      expect(args).toContain("global")
      expect(args).toContain("add")
      expect(args).toContain("@opencode/opencode@latest")
    })

    it("should upgrade bun installation", async () => {
      process.env.npm_config_user_agent = "bun/1.0.0 node/18.0.0"
      
      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithBun = require("../index")
      
      await InstallationWithBun.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("bun")
      expect(args).toContain("install")
      expect(args).toContain("-g")
      expect(args).toContain("@opencode/opencode@latest")
    })

    it("should upgrade brew installation", async () => {
      // Mock platform detection
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "darwin"
        }
      })()

      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithBrew = require("../index")
      
      await InstallationWithBrew.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("brew")
      expect(args).toContain("upgrade")
      expect(args).toContain("opencode")
    })

    it("should upgrade scoop installation", async () => {
      // Mock platform detection
      mock(async () => {
        const mod = await import("os")
        return {
          ...mod,
          platform: () => "win32"
        }
      })()

      let spawnCalled = false
      let command: string = ""
      let args: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (cmd: string, cmdArgs: string[]) => {
            spawnCalled = true
            command = cmd
            args = cmdArgs
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithScoop = require("../index")
      
      await InstallationWithScoop.upgrade()
      
      expect(spawnCalled).toBe(true)
      expect(command).toBe("scoop")
      expect(args).toContain("update")
      expect(args).toContain("opencode")
    })

    it("should throw UpgradeFailedError for unknown method", async () => {
      delete require.cache[require.resolve("../index")]
      const InstallationUnknown = require("../index")
      
      await expect(InstallationUnknown.upgrade()).rejects.toThrow(Installation.UpgradeFailedError)
    })

    it("should throw UpgradeFailedError on command failure", async () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(1),
            stderr: new TextEncoder().encode("Upgrade failed")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      await expect(InstallationWithNPM.upgrade()).rejects.toThrow(Installation.UpgradeFailedError)
    })
  })

  describe("UpgradeFailedError", () => {
    it("should create error with message", () => {
      const error = new Installation.UpgradeFailedError("Test error")
      expect(error.message).toBe("Test error")
      expect(error.name).toBe("UpgradeFailedError")
    })

    it("should be instanceof Error", () => {
      const error = new Installation.UpgradeFailedError("Test error")
      expect(error instanceof Error).toBe(true)
    })

    it("should be instanceof UpgradeFailedError", () => {
      const error = new Installation.UpgradeFailedError("Test error")
      expect(error instanceof Installation.UpgradeFailedError).toBe(true)
    })
  })

  describe("BusEvent", () => {
    it("should have correct event names", () => {
      expect(Installation.BusEvent.Updated).toBe("installation.updated")
      expect(Installation.BusEvent.Failed).toBe("installation.failed")
    })

    it("should be unique strings", () => {
      expect(Installation.BusEvent.Updated).not.toBe(Installation.BusEvent.Failed)
      expect(typeof Installation.BusEvent.Updated).toBe("string")
      expect(typeof Installation.BusEvent.Failed).toBe("string")
    })
  })

  describe("global exports", () => {
    it("should export version", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      expect(InstallationModule.version).toBe("2.0.0")
    })

    it("should export channel", () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          channel: "stable"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      expect(InstallationModule.channel).toBe("stable")
    })
  })

  describe("integration with Bus", () => {
    it("should publish events on successful upgrade", async () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      let publishCalled = false
      let publishedEvent: string = ""
      let publishedData: any = null
      
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          publish: (event: string, data: any) => {
            publishCalled = true
            publishedEvent = event
            publishedData = data
            return Promise.resolve()
          }
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0)
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      await InstallationWithNPM.upgrade()
      
      expect(publishCalled).toBe(true)
      expect(publishedEvent).toBe(Installation.BusEvent.Updated)
      expect(publishedData.method).toBe("npm")
    })

    it("should publish events on failed upgrade", async () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      let publishCalled = false
      let publishedEvent: string = ""
      let publishedData: any = null
      
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          publish: (event: string, data: any) => {
            publishCalled = true
            publishedEvent = event
            publishedData = data
            return Promise.resolve()
          }
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(1),
            stderr: new TextEncoder().encode("Upgrade failed")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      try {
        await InstallationWithNPM.upgrade()
      } catch (error) {
        // Expected to throw
      }
      
      expect(publishCalled).toBe(true)
      expect(publishedEvent).toBe(Installation.BusEvent.Failed)
      expect(publishedData.method).toBe("npm")
      expect(publishedData.error).toBeDefined()
    })
  })

  describe("error handling", () => {
    it("should handle missing package.json gracefully", async () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "0.0.0",
          channel: "unknown"
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      expect(InstallationModule.version).toBe("0.0.0")
      expect(InstallationModule.channel).toBe("unknown")
      expect(InstallationModule.isPreview()).toBe(false)
      expect(InstallationModule.isLocal()).toBe(false)
    })

    it("should handle spawn errors during upgrade", async () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => {
            throw new Error("Command not found")
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      await expect(InstallationWithNPM.upgrade()).rejects.toThrow(Installation.UpgradeFailedError)
    })

    it("should handle network errors during info check", async () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0",
          channel: "stable"
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => {
            throw new Error("Network error")
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      const info = await InstallationModule.info()
      expect(info.latest).toBe("unknown")
    })
  })

  describe("concurrent operations", () => {
    it("should handle concurrent method checks", () => {
      process.env.npm_config_user_agent = "npm/8.0.0 node/18.0.0"
      
      delete require.cache[require.resolve("../index")]
      const InstallationWithNPM = require("../index")
      
      const results = Array(10).fill(null).map(() => InstallationWithNPM.method())
      
      results.forEach(result => {
        expect(result).toBe("npm")
      })
    })

    it("should handle concurrent info requests", async () => {
      mock(async () => {
        const mod = await import("../../../package.json")
        return {
          version: "2.0.0",
          channel: "stable"
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0),
            stdout: new TextEncoder().encode("latest version: 2.1.0")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const InstallationModule = require("../index")
      
      const promises = Array(10).fill(null).map(() => InstallationModule.info())
      const results = await Promise.all(promises)
      
      expect(results).toHaveLength(10)
      results.forEach(info => {
        expect(info.current).toBe("2.0.0")
        expect(info.latest).toBe("2.1.0")
      })
    })
  })
})
