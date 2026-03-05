import { describe, it, expect, beforeEach, mock } from "bun:test"
import * as Ide from "../index"
import { Bus } from "../../bus/bus"

describe("Ide", () => {
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
    delete process.env.VSCODE_IPC_HOOK
    delete process.env.VSCODE_PORTABLE
    delete process.env.CURSOR_IPC_HOOK
    delete process.env.WINDSURF_IPC_HOOK
  })

  describe("ide function", () => {
    it("should detect VS Code", () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      expect(IdeWithVSCode.ide()).toBe("vscode")
    })

    it("should detect Cursor", () => {
      process.env.CURSOR_IPC_HOOK = "/tmp/cursor-ipc"
      
      delete require.cache[require.resolve("../index")]
      const IdeWithCursor = require("../index")
      
      expect(IdeWithCursor.ide()).toBe("cursor")
    })

    it("should detect Windsurf", () => {
      process.env.WINDSURF_IPC_HOOK = "/tmp/windsurf-ipc"
      
      delete require.cache[require.resolve("../index")]
      const IdeWithWindsurf = require("../index")
      
      expect(IdeWithWindsurf.ide()).toBe("windsurf")
    })

    it("should detect VSCodium", () => {
      process.env.VSCODE_PORTABLE = "/path/to/vscodium"
      
      delete require.cache[require.resolve("../index")]
      const IdeWithVSCodium = require("../index")
      
      expect(IdeWithVSCodium.ide()).toBe("vscodium")
    })

    it("should return unknown when no IDE detected", () => {
      // Ensure no IDE environment variables are set
      delete process.env.VSCODE_IPC_HOOK
      delete process.env.VSCODE_PORTABLE
      delete process.env.CURSOR_IPC_HOOK
      delete process.env.WINDSURF_IPC_HOOK
      
      delete require.cache[require.resolve("../index")]
      const IdeUnknown = require("../index")
      
      expect(IdeUnknown.ide()).toBe("unknown")
    })

    it("should prioritize VS Code over others", () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      process.env.CURSOR_IPC_HOOK = "/tmp/cursor-ipc"
      process.env.WINDSURF_IPC_HOOK = "/tmp/windsurf-ipc"
      
      delete require.cache[require.resolve("../index")]
      const IdeWithMultiple = require("../index")
      
      expect(IdeWithMultiple.ide()).toBe("vscode")
    })
  })

  describe("alreadyInstalled function", () => {
    it("should check VS Code extension installation", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0),
            stdout: new TextEncoder().encode("opencode.opencode")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      const installed = await IdeWithVSCode.alreadyInstalled()
      expect(installed).toBe(true)
    })

    it("should return false when extension not found", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0),
            stdout: new TextEncoder().encode("")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      const installed = await IdeWithVSCode.alreadyInstalled()
      expect(installed).toBe(false)
    })

    it("should handle command errors gracefully", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(1),
            stderr: new TextEncoder().encode("Command failed")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      const installed = await IdeWithVSCode.alreadyInstalled()
      expect(installed).toBe(false)
    })

    it("should return false for unknown IDE", async () => {
      delete require.cache[require.resolve("../index")]
      const IdeUnknown = require("../index")
      
      const installed = await IdeUnknown.alreadyInstalled()
      expect(installed).toBe(false)
    })
  })

  describe("install function", () => {
    it("should install VS Code extension", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      let spawnCalled = false
      let commandArgs: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (command: string, args: string[]) => {
            spawnCalled = true
            commandArgs = args
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      await IdeWithVSCode.install()
      
      expect(spawnCalled).toBe(true)
      expect(commandArgs).toContain("--install-extension")
      expect(commandArgs).toContain("opencode.opencode")
    })

    it("should install Cursor extension", async () => {
      process.env.CURSOR_IPC_HOOK = "/tmp/cursor-ipc"
      
      let spawnCalled = false
      let commandArgs: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (command: string, args: string[]) => {
            spawnCalled = true
            commandArgs = args
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithCursor = require("../index")
      
      await IdeWithCursor.install()
      
      expect(spawnCalled).toBe(true)
      expect(commandArgs).toContain("--install-extension")
      expect(commandArgs).toContain("opencode.opencode")
    })

    it("should install Windsurf extension", async () => {
      process.env.WINDSURF_IPC_HOOK = "/tmp/windsurf-ipc"
      
      let spawnCalled = false
      let commandArgs: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (command: string, args: string[]) => {
            spawnCalled = true
            commandArgs = args
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithWindsurf = require("../index")
      
      await IdeWithWindsurf.install()
      
      expect(spawnCalled).toBe(true)
      expect(commandArgs).toContain("--install-extension")
      expect(commandArgs).toContain("opencode.opencode")
    })

    it("should install VSCodium extension", async () => {
      process.env.VSCODE_PORTABLE = "/path/to/vscodium"
      
      let spawnCalled = false
      let commandArgs: string[] = []
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (command: string, args: string[]) => {
            spawnCalled = true
            commandArgs = args
            return {
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCodium = require("../index")
      
      await IdeWithVSCodium.install()
      
      expect(spawnCalled).toBe(true)
      expect(commandArgs).toContain("--install-extension")
      expect(commandArgs).toContain("opencode.opencode")
    })

    it("should throw InstallationFailedError for unknown IDE", async () => {
      delete require.cache[require.resolve("../index")]
      const IdeUnknown = require("../index")
      
      await expect(IdeUnknown.install()).rejects.toThrow(Ide.InstallationFailedError)
    })

    it("should handle installation errors", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(1),
            stderr: new TextEncoder().encode("Installation failed")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      await expect(IdeWithVSCode.install()).rejects.toThrow(Ide.InstallationFailedError)
    })

    it("should handle spawn errors", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => {
            throw new Error("Spawn failed")
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      await expect(IdeWithVSCode.install()).rejects.toThrow(Ide.InstallationFailedError)
    })
  })

  describe("InstallationFailedError", () => {
    it("should create error with message", () => {
      const error = new Ide.InstallationFailedError("Test error")
      expect(error.message).toBe("Test error")
      expect(error.name).toBe("InstallationFailedError")
    })

    it("should be instanceof Error", () => {
      const error = new Ide.InstallationFailedError("Test error")
      expect(error instanceof Error).toBe(true)
    })

    it("should be instanceof InstallationFailedError", () => {
      const error = new Ide.InstallationFailedError("Test error")
      expect(error instanceof Ide.InstallationFailedError).toBe(true)
    })
  })

  describe("BusEvent", () => {
    it("should have correct event names", () => {
      expect(Ide.BusEvent.Installed).toBe("ide.installed")
      expect(Ide.BusEvent.Failed).toBe("ide.failed")
    })

    it("should be unique strings", () => {
      expect(Ide.BusEvent.Installed).not.toBe(Ide.BusEvent.Failed)
      expect(typeof Ide.BusEvent.Installed).toBe("string")
      expect(typeof Ide.BusEvent.Failed).toBe("string")
    })
  })

  describe("supported IDEs", () => {
    it("should support all major IDEs", () => {
      const supportedIdes = ["vscode", "cursor", "windsurf", "vscodium"]
      
      supportedIdes.forEach(ideName => {
        // Set environment variable for each IDE
        switch (ideName) {
          case "vscode":
            process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
            break
          case "cursor":
            process.env.CURSOR_IPC_HOOK = "/tmp/cursor-ipc"
            break
          case "windsurf":
            process.env.WINDSURF_IPC_HOOK = "/tmp/windsurf-ipc"
            break
          case "vscodium":
            process.env.VSCODE_PORTABLE = "/path/to/vscodium"
            break
        }
        
        delete require.cache[require.resolve("../index")]
        const IdeModule = require("../index")
        
        expect(IdeModule.ide()).toBe(ideName)
        
        // Clean up
        delete process.env.VSCODE_IPC_HOOK
        delete process.env.VSCODE_PORTABLE
        delete process.env.CURSOR_IPC_HOOK
        delete process.env.WINDSURF_IPC_HOOK
      })
    })
  })

  describe("integration with Bus", () => {
    it("should publish events on successful installation", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
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
      const IdeWithVSCode = require("../index")
      
      await IdeWithVSCode.install()
      
      expect(publishCalled).toBe(true)
      expect(publishedEvent).toBe(Ide.BusEvent.Installed)
      expect(publishedData.ide).toBe("vscode")
    })

    it("should publish events on failed installation", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
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
            stderr: new TextEncoder().encode("Installation failed")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      try {
        await IdeWithVSCode.install()
      } catch (error) {
        // Expected to throw
      }
      
      expect(publishCalled).toBe(true)
      expect(publishedEvent).toBe(Ide.BusEvent.Failed)
      expect(publishedData.ide).toBe("vscode")
      expect(publishedData.error).toBeDefined()
    })
  })

  describe("error handling", () => {
    it("should handle missing IDE gracefully", async () => {
      delete require.cache[require.resolve("../index")]
      const IdeUnknown = require("../index")
      
      expect(IdeUnknown.ide()).toBe("unknown")
      expect(await IdeUnknown.alreadyInstalled()).toBe(false)
      await expect(IdeUnknown.install()).rejects.toThrow(Ide.InstallationFailedError)
    })

    it("should handle malformed environment variables", () => {
      process.env.VSCODE_IPC_HOOK = ""
      
      delete require.cache[require.resolve("../index")]
      const IdeWithEmpty = require("../index")
      
      expect(IdeWithEmpty.ide()).toBe("vscode")
    })

    it("should handle permission errors during installation", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => {
            throw new Error("Permission denied")
          }
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      await expect(IdeWithVSCode.install()).rejects.toThrow(Ide.InstallationFailedError)
    })
  })

  describe("concurrent operations", () => {
    it("should handle concurrent installation checks", async () => {
      process.env.VSCODE_IPC_HOOK = "/tmp/vscode-ipc"
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            exited: Promise.resolve(0),
            stdout: new TextEncoder().encode("opencode.opencode")
          })
        }
      })()

      delete require.cache[require.resolve("../index")]
      const IdeWithVSCode = require("../index")
      
      const promises = Array(10).fill(null).map(() => IdeWithVSCode.alreadyInstalled())
      const results = await Promise.all(promises)
      
      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result).toBe(true)
      })
    })
  })
})
