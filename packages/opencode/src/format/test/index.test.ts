import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import * as Format from "../index"
import { Instance } from "../../project/instance"
import { Config } from "../../config/config"
import { Bus } from "../../bus/bus"
import { File } from "../../file"
import * as Formatter from "../formatter"
import { Flag } from "../../flag/flag"

describe("Format", () => {
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
  let originalInstance: any

  beforeEach(() => {
    // Save original Instance before mocking
    originalInstance = (globalThis as any).Instance
    // Mock Instance
    globalThis.Instance = {
      directory: "/test/project",
      worktree: "/test/project",
      provide: async () => ({}) as any
    } as any

    // Reset Format state
    Format.resetForTest?.()
  })

  afterEach(() => {
    // Restore original Instance instead of deleting
    if (originalInstance !== undefined) {
      (globalThis as any).Instance = originalInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
  })

  describe("state management", () => {
    it("should initialize with empty state", () => {
      expect(Format.state.enabled).toBe(false)
      expect(Format.state.cache).toEqual(new Map())
    })

    it("should reset state correctly", () => {
      // Set some state
      Format.state.enabled = true
      Format.state.cache.set("test", true)

      // Reset
      Format.resetForTest?.()

      expect(Format.state.enabled).toBe(false)
      expect(Format.state.cache.size).toBe(0)
    })
  })

  describe("enabled function", () => {
    it("should return false when disabled", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: false } })
        }
      })()

      const enabled = await Format.enabled()
      expect(enabled).toBe(false)
    })

    it("should return true when enabled", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      const enabled = await Format.enabled()
      expect(enabled).toBe(true)
    })

    it("should cache enabled status", async () => {
      let callCount = 0
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => {
            callCount++
            return Promise.resolve({ format: { enabled: true } })
          }
        }
      })()

      // First call should query config
      await Format.enabled()
      expect(callCount).toBe(1)

      // Second call should use cache
      await Format.enabled()
      expect(callCount).toBe(1)
    })

    it("should invalidate cache when disabled", async () => {
      let callCount = 0
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => {
            callCount++
            return Promise.resolve({ format: { enabled: true } })
          }
        }
      })()

      // Enable and cache
      await Format.enabled()
      expect(callCount).toBe(1)

      // Disable (should invalidate cache)
      Format.state.enabled = false
      await Format.enabled()
      expect(callCount).toBe(2)
    })
  })

  describe("get function", () => {
    it("should return formatter for known extension", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt"
        }
      })()

      const formatter = await Format.get("test.go")
      expect(formatter).toBe(Formatter.gofmt)
    })

    it("should return null for unknown extension", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      const formatter = await Format.get("test.unknown")
      expect(formatter).toBe(null)
    })

    it("should return null when format is disabled", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: false } })
        }
      })()

      const formatter = await Format.get("test.go")
      expect(formatter).toBe(null)
    })

    it("should cache formatter results", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt"
        }
      })()

      // First call should check formatter availability
      const formatter1 = await Format.get("test.go")
      expect(formatter1).toBe(Formatter.gofmt)

      // Second call should use cache
      const formatter2 = await Format.get("test.go")
      expect(formatter2).toBe(Formatter.gofmt)
    })

    it("should handle multiple formatters for same extension", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      // Mock multiple formatters for .py extension
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/ruff"
        }
      })()

      const formatter = await Format.get("test.py")
      expect(formatter).toBe(Formatter.ruff)
    })
  })

  describe("status function", () => {
    it("should return status for enabled formatters", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt"
        }
      })()

      const status = await Format.status()
      expect(status).toContain("gofmt")
      expect(status).toContain("✓")
    })

    it("should return status for disabled formatters", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => null
        }
      })()

      const status = await Format.status()
      expect(status).toContain("✗")
    })

    it("should return empty status when format is disabled", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: false } })
        }
      })()

      const status = await Format.status()
      expect(status).toBe("")
    })
  })

  describe("init function", () => {
    it("should initialize and subscribe to file events", async () => {
      let subscribeCalled = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: () => {
            subscribeCalled = true
            return () => { } // unsubscribe function
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      await Format.init()
      expect(subscribeCalled).toBe(true)
    })

    it("should not initialize when format is disabled", async () => {
      let subscribeCalled = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: () => {
            subscribeCalled = true
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: false } })
        }
      })()

      await Format.init()
      expect(subscribeCalled).toBe(false)
    })

    it("should handle file edited events", async () => {
      let formatterCalled = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string, callback: any) => {
            if (event === "file.edited") {
              // Simulate file edited event
              callback({
                path: "/test/project/test.go",
                content: "package main\n\nfunc main() {\n}"
              })
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt",
          spawn: () => ({
            exited: Promise.resolve(0)
          })
        }
      })()

      mock(async () => {
        const mod = await import("../../file")
        return {
          ...mod.File,
          write: () => {
            formatterCalled = true
            return Promise.resolve()
          }
        }
      })()

      await Format.init()
      expect(formatterCalled).toBe(true)
    })

    it("should ignore files without formatters", async () => {
      let formatterCalled = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string, callback: any) => {
            if (event === "file.edited") {
              callback({
                path: "/test/project/test.unknown",
                content: "some content"
              })
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const mod = await import("../../file")
        return {
          ...mod.File,
          write: () => {
            formatterCalled = true
            return Promise.resolve()
          }
        }
      })()

      await Format.init()
      expect(formatterCalled).toBe(false)
    })

    it("should handle formatter errors gracefully", async () => {
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string, callback: any) => {
            if (event === "file.edited") {
              callback({
                path: "/test/project/test.go",
                content: "package main\n\nfunc main() {\n}"
              })
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt",
          spawn: () => ({
            exited: Promise.resolve(1) // Error exit code
          })
        }
      })()

      // Should not throw
      await expect(Format.init()).resolves.toBeUndefined()
    })

    it("should respect ignore patterns", async () => {
      let formatterCalled = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string, callback: any) => {
            if (event === "file.edited") {
              callback({
                path: "/test/project/node_modules/test.go",
                content: "package main\n\nfunc main() {\n}"
              })
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({
            format: { enabled: true },
            ignore: ["node_modules"]
          })
        }
      })()

      mock(async () => {
        const mod = await import("../../file")
        return {
          ...mod.File,
          write: () => {
            formatterCalled = true
            return Promise.resolve()
          }
        }
      })()

      await Format.init()
      expect(formatterCalled).toBe(false)
    })
  })

  describe("cache management", () => {
    it("should cache formatter availability", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      let gofmtCallCount = 0
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => {
            gofmtCallCount++
            return "/usr/local/bin/gofmt"
          }
        }
      })()

      // First call
      await Format.get("test.go")
      expect(gofmtCallCount).toBe(1)

      // Second call should use cache
      await Format.get("test.go")
      expect(gofmtCallCount).toBe(1)
    })

    it("should invalidate cache when formatter becomes unavailable", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      let gofmtCallCount = 0
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => {
            gofmtCallCount++
            return gofmtCallCount === 1 ? "/usr/local/bin/gofmt" : null
          }
        }
      })()

      // First call - formatter available
      const formatter1 = await Format.get("test.go")
      expect(formatter1).toBe(Formatter.gofmt)
      expect(gofmtCallCount).toBe(1)

      // Invalidate cache by setting formatter as unavailable
      Format.state.cache.set("gofmt", false)

      // Second call should check again
      const formatter2 = await Format.get("test.go")
      expect(formatter2).toBe(null)
      expect(gofmtCallCount).toBe(2)
    })
  })

  describe("error handling", () => {
    it("should handle config errors gracefully", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.reject(new Error("Config error"))
        }
      })()

      const enabled = await Format.enabled()
      expect(enabled).toBe(false)
    })

    it("should handle bus subscription errors gracefully", async () => {
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: () => {
            throw new Error("Bus error")
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      // Should not throw
      await expect(Format.init()).resolves.toBeUndefined()
    })

    it("should handle file write errors gracefully", async () => {
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string, callback: any) => {
            if (event === "file.edited") {
              callback({
                path: "/test/project/test.go",
                content: "package main\n\nfunc main() {\n}"
              })
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt",
          spawn: () => ({
            exited: Promise.resolve(0)
          })
        }
      })()

      mock(async () => {
        const mod = await import("../../file")
        return {
          ...mod.File,
          write: () => Promise.reject(new Error("Write error"))
        }
      })()

      // Should not throw
      await expect(Format.init()).resolves.toBeUndefined()
    })
  })

  describe("integration with other modules", () => {
    it("should work with Instance module", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt"
        }
      })()

      const formatter = await Format.get("test.go")
      expect(formatter).toBe(Formatter.gofmt)
    })

    it("should work with Config module", async () => {
      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({
            format: { enabled: true },
            ignore: ["test"]
          })
        }
      })()

      const enabled = await Format.enabled()
      expect(enabled).toBe(true)
    })

    it("should work with Bus module", async () => {
      let eventReceived = false
      mock(async () => {
        const mod = await import("../../bus/bus")
        return {
          ...mod.Bus,
          subscribe: (event: string) => {
            if (event === "file.edited") {
              eventReceived = true
            }
            return () => { }
          }
        }
      })()

      mock(async () => {
        const mod = await import("../../config/config")
        return {
          ...mod.Config,
          get: () => Promise.resolve({ format: { enabled: true } })
        }
      })()

      await Format.init()
      expect(eventReceived).toBe(true)
    })
  })
})
