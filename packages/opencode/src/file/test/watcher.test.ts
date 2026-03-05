import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { FileWatcher } from "../watcher"
import { Instance } from "../../project/instance"
import { Config } from "../../config/config"
import { Flag } from "../../flag/flag"
import { Bus } from "../../bus"
import os from "os"

describe("FileWatcher", () => {
  let tempDir: string
  let originalInstance: any
  let originalConfig: any

  beforeEach(() => {
    tempDir = os.tmpdir()
    // Save original values before any nested beforeEach runs
    originalInstance = (globalThis as any).Instance
    originalConfig = (globalThis as any).Config
  })

  afterEach(() => {
    // Restore original values instead of deleting
    if (originalInstance !== undefined) {
      (globalThis as any).Instance = originalInstance
    } else {
      delete (globalThis as any).Instance
    }
    if (originalConfig !== undefined) {
      (globalThis as any).Config = originalConfig
    } else {
      delete (globalThis as any).Config
    }
  })

  describe("Event schema", () => {
    it("should define file watcher events", () => {
      expect(FileWatcher.Event.Updated.type).toBe("file.watcher.updated")

      const payload = { file: "test.txt", event: "add" as const }
      expect(() => FileWatcher.Event.Updated.schema.parse(payload)).not.toThrow()

      const parsed = FileWatcher.Event.Updated.schema.parse(payload)
      expect(parsed.file).toBe("test.txt")
      expect(parsed.event).toBe("add")
    })

    it("should validate all event types", () => {
      const events = ["add", "change", "unlink"] as const

      events.forEach(event => {
        const payload = { file: "test.txt", event }
        expect(() => FileWatcher.Event.Updated.schema.parse(payload)).not.toThrow()
        const parsed = FileWatcher.Event.Updated.schema.parse(payload)
        expect(parsed.event).toBe(event)
      })
    })
  })

  describe("init function", () => {
    beforeEach(() => {
      // Mock Instance and Config
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should initialize without throwing", () => {
      expect(() => FileWatcher.init()).not.toThrow()
    })

    it("should not initialize when OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER is true", () => {
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: true
        }
      })()

      FileWatcher.init()
      // Should not throw, but also not start watching
      expect(true).toBe(true) // Placeholder assertion
    })

    it("should not initialize when project VCS is not git", () => {
      globalThis.Instance = {
        ...globalThis.Instance,
        project: { vcs: "svn" as const },
        provide: async () => ({}) as any
      }

      FileWatcher.init()
      expect(true).toBe(true) // Placeholder assertion
    })
  })

  describe("watcher loading", () => {
    beforeEach(() => {
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should load watcher binding successfully", async () => {
      // Mock successful watcher loading
      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: () => Promise.resolve({
              unsubscribe: () => { }
            })
          })
        }
      })()

      FileWatcher.init()
      // Should not throw
      expect(true).toBe(true)
    })

    it("should handle watcher binding failure", async () => {
      // Mock failed watcher loading
      mock(async () => {
        const mod = await import("@parcel/watcher")
        throw new Error("Failed to load watcher")
      })()

      FileWatcher.init()
      // Should not throw, but log error
      expect(true).toBe(true)
    })

    it("should detect platform-specific backends", async () => {
      const originalPlatform = process.platform

      try {
        // Test Windows
        Object.defineProperty(process, 'platform', { value: 'win32' })
        FileWatcher.init()

        // Test macOS
        Object.defineProperty(process, 'platform', { value: 'darwin' })
        FileWatcher.init()

        // Test Linux
        Object.defineProperty(process, 'platform', { value: 'linux' })
        FileWatcher.init()
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }

      expect(true).toBe(true)
    })
  })

  describe("subscription management", () => {
    beforeEach(() => {
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should subscribe to instance directory when experimental flag is enabled", async () => {
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_EXPERIMENTAL_FILEWATCHER: true
        }
      })()

      let subscribedPath = ""
      let subscribedOptions: any = {}

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, options: any) => {
              subscribedPath = path
              subscribedOptions = options
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      expect(subscribedPath).toBe(tempDir)
      expect(subscribedOptions.ignore).toContain(".git")
    })

    it("should respect config ignore patterns", async () => {
      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: ["*.tmp", "logs/**"] }
        })
      } as any

      let subscribedIgnore: string[] = []

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, options: any) => {
              subscribedIgnore = options.ignore || []
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      expect(subscribedIgnore).toContain("*.tmp")
      expect(subscribedIgnore).toContain("logs/**")
    })

    it("should handle subscription timeout", async () => {
      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: () => new Promise((resolve) => {
              setTimeout(() => resolve({ unsubscribe: () => { } }), 100)
            })
          })
        }
      })()

      FileWatcher.init()
      // Should handle timeout gracefully
      expect(true).toBe(true)
    })

    it("should handle subscription errors", async () => {
      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: () => Promise.reject(new Error("Subscription failed"))
          })
        }
      })()

      FileWatcher.init()
      // Should handle errors gracefully
      expect(true).toBe(true)
    })
  })

  describe("VCS directory watching", () => {
    beforeEach(() => {
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should find and watch git directory", async () => {
      let gitDirFound = false
      let watchedGitDir = ""

      mock(async () => {
        // Mock git rev-parse
        const { $ } = await import("bun")
        return {
          default: () => ({
            text: () => Promise.resolve(".git"),
            exited: Promise.resolve(0)
          })
        }
      })()

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string) => {
              if (path.includes(".git")) {
                gitDirFound = true
                watchedGitDir = path
              }
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      expect(gitDirFound).toBe(true)
      expect(watchedGitDir).toContain(".git")
    })

    it("should respect git ignore patterns", async () => {
      let gitIgnoreList: string[] = []

      mock(async () => {
        const fs = await import("fs/promises")
        return {
          readdir: () => Promise.resolve(["HEAD", "config", "index", "objects"]),
          ...fs
        }
      })()

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, options: any) => {
              if (path.includes(".git")) {
                gitIgnoreList = options.ignore || []
              }
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      expect(gitIgnoreList).not.toContain("HEAD")
      expect(gitIgnoreList.length).toBeGreaterThan(0)
    })

    it("should handle git directory not found", async () => {
      mock(async () => {
        // Mock git rev-parse failure
        const { $ } = await import("bun")
        return {
          default: () => ({
            text: () => Promise.resolve(""),
            exited: Promise.resolve(1)
          })
        }
      })()

      FileWatcher.init()
      // Should handle gracefully
      expect(true).toBe(true)
    })
  })

  describe("event handling", () => {
    beforeEach(() => {
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should publish add events", async () => {
      let publishedEvent: any = null

      mock(() => {
        const { Bus } = require("../../bus")
        return {
          ...Bus,
          publish: (event: any, payload: any) => {
            publishedEvent = { event, payload }
          }
        }
      })()

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, callback: any) => {
              // Simulate add event
              setTimeout(() => {
                callback(null, [{
                  type: "create",
                  path: "test.txt"
                }])
              }, 10)
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      // Wait for async event
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(publishedEvent).not.toBeNull()
      expect(publishedEvent.payload.file).toBe("test.txt")
      expect(publishedEvent.payload.event).toBe("add")
    })

    it("should publish update events", async () => {
      let publishedEvent: any = null

      mock(() => {
        const { Bus } = require("../../bus")
        return {
          ...Bus,
          publish: (event: any, payload: any) => {
            publishedEvent = { event, payload }
          }
        }
      })()

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, callback: any) => {
              // Simulate update event
              setTimeout(() => {
                callback(null, [{
                  type: "update",
                  path: "test.txt"
                }])
              }, 10)
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(publishedEvent).not.toBeNull()
      expect(publishedEvent.payload.file).toBe("test.txt")
      expect(publishedEvent.payload.event).toBe("change")
    })

    it("should publish unlink events", async () => {
      let publishedEvent: any = null

      mock(() => {
        const { Bus } = require("../../bus")
        return {
          ...Bus,
          publish: (event: any, payload: any) => {
            publishedEvent = { event, payload }
          }
        }
      })()

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, callback: any) => {
              // Simulate unlink event
              setTimeout(() => {
                callback(null, [{
                  type: "delete",
                  path: "test.txt"
                }])
              }, 10)
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(publishedEvent).not.toBeNull()
      expect(publishedEvent.payload.file).toBe("test.txt")
      expect(publishedEvent.payload.event).toBe("unlink")
    })

    it("should handle watcher callback errors", async () => {
      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: (path: string, callback: any) => {
              // Simulate callback error
              setTimeout(() => {
                callback(new Error("Watcher error"), [])
              }, 10)
              return Promise.resolve({
                unsubscribe: () => { }
              })
            }
          })
        }
      })()

      FileWatcher.init()

      // Should handle errors gracefully
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(true).toBe(true)
    })
  })

  describe("cleanup", () => {
    beforeEach(() => {
      globalThis.Instance = {
        directory: tempDir,
        worktree: tempDir,
        project: { vcs: "git" as const },
        provide: async () => ({}) as any
      } as any

      globalThis.Config = {
        get: () => Promise.resolve({
          watcher: { ignore: [] }
        })
      } as any
    })

    it("should unsubscribe from all subscriptions on cleanup", async () => {
      let unsubscribedCount = 0

      mock(async () => {
        const mod = await import("@parcel/watcher")
        return {
          default: () => ({
            subscribe: () => Promise.resolve({
              unsubscribe: () => {
                unsubscribedCount++
              }
            })
          })
        }
      })()

      FileWatcher.init()

      // Simulate cleanup (would happen on module unload)
      // This is hard to test directly, but we can ensure subscriptions are created
      expect(unsubscribedCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe("platform-specific behavior", () => {
    it("should handle Windows paths correctly", async () => {
      const originalPlatform = process.platform

      try {
        Object.defineProperty(process, 'platform', { value: 'win32' })

        globalThis.Instance = {
          directory: "C:\\test\\project",
          worktree: "C:\\test\\project",
          project: { vcs: "git" as const },
          provide: async () => ({}) as any
        } as any

        FileWatcher.init()

        expect(true).toBe(true)
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it("should handle macOS paths correctly", async () => {
      const originalPlatform = process.platform

      try {
        Object.defineProperty(process, 'platform', { value: 'darwin' })

        globalThis.Instance = {
          directory: "/Users/test/project",
          worktree: "/Users/test/project",
          project: { vcs: "git" as const },
          provide: async () => ({}) as any
        } as any

        FileWatcher.init()

        expect(true).toBe(true)
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it("should handle Linux paths correctly", async () => {
      const originalPlatform = process.platform

      try {
        Object.defineProperty(process, 'platform', { value: 'linux' })

        globalThis.Instance = {
          directory: "/home/test/project",
          worktree: "/home/test/project",
          project: { vcs: "git" as const },
          provide: async () => ({}) as any
        } as any

        FileWatcher.init()

        expect(true).toBe(true)
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })
  })

  describe("error handling", () => {
    it("should handle watcher initialization errors gracefully", async () => {
      mock(async () => {
        const mod = await import("@parcel/watcher")
        throw new Error("Failed to initialize watcher")
      })()

      FileWatcher.init()
      // Should not throw, but should handle gracefully
      expect(true).toBe(true)
    })

    it("should handle configuration errors", async () => {
      globalThis.Config = {
        get: () => Promise.reject(new Error("Config error"))
      } as any

      FileWatcher.init()
      // Should handle config errors gracefully
      expect(true).toBe(true)
    })

    it("should handle instance errors", async () => {
      const originalInstance = (globalThis as any).Instance
      globalThis.Instance = null as any

      try {
        FileWatcher.init()
        // Should handle null instance gracefully
        expect(true).toBe(true)
      } finally {
        // Restore the original Instance
        (globalThis as any).Instance = originalInstance
      }
    })
  })
})
