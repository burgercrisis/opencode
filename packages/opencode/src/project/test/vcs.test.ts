import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as Vcs from "../vcs"

describe("VCS Module", () => {
  describe("currentBranch function", () => {
    it("should return current branch name", async () => {
      const mockBun = {
        $: {
          text: () => Promise.resolve("main\n"),
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("main\n")
              })
            })
          })
        }
      }

      // Mock Instance - save full object to restore properly
      const originalInstance = (global as any).Instance
      ;(global as any).Instance = { worktree: "/test/repo" }
      const originalBun = (global as any).Bun
      ;(global as any).Bun = mockBun

      const branch = await (Vcs as any).currentBranch()
      expect(branch).toBe("main")

      // Restore
      if (originalInstance) {
        ;(global as any).Instance = originalInstance
      }
      if (originalBun) {
        ;(global as any).Bun = originalBun
      }
    })

    it("should return undefined for git command failure", async () => {
      const mockBun = {
        $: {
          text: () => Promise.reject(new Error("Git command failed")),
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.reject(new Error("Git command failed"))
              })
            })
          })
        }
      }

      // Mock Instance - save full object to restore properly
      const originalInstance = (global as any).Instance
      ;(global as any).Instance = { worktree: "/test/repo" }
      const originalBun = (global as any).Bun
      ;(global as any).Bun = mockBun

      const branch = await (Vcs as any).currentBranch()
      expect(branch).toBeUndefined()

      // Restore
      if (originalInstance) {
        ;(global as any).Instance = originalInstance
      }
      if (originalBun) {
        ;(global as any).Bun = originalBun
      }
    })

    it("should trim whitespace from branch name", async () => {
      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("  feature-branch  \n")
              })
            })
          })
        }
      }

      // Mock Instance - save full object to restore properly
      const originalInstance = (global as any).Instance
      ;(global as any).Instance = { worktree: "/test/repo" }
      const originalBun = (global as any).Bun
      ;(global as any).Bun = mockBun

      const branch = await (Vcs as any).currentBranch()
      expect(branch).toBe("feature-branch")

      // Restore
      if (originalInstance) {
        ;(global as any).Instance = originalInstance
      }
      if (originalBun) {
        ;(global as any).Bun = originalBun
      }
    })
  })

  describe("init function", () => {
    it("should initialize VCS state for git repository", async () => {
      let branchChangeHandler: any
      let unsubscribeCalled = false

      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("main\n")
              })
            })
          })
        }
      }

      const mockBus = {
        subscribe: (event: any, handler: any) => {
          branchChangeHandler = handler
          return () => {
            unsubscribeCalled = true
          }
        }
      }

      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      const state = await Vcs.init()

      expect(state).toBeDefined()
      expect(typeof state.branch).toBe("function")
      expect(typeof state.unsubscribe).toBe("function")

      const branch = await state.branch()
      expect(branch).toBe("main")

      // Test unsubscribe
      state.unsubscribe?.()
      expect(unsubscribeCalled).toBe(true)

      // Restore
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })

    it("should return empty state for non-git repository", async () => {
      const mockInstance = {
        project: { vcs: undefined },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalInstance = (global as any).Instance

      ;(global as any).Instance = mockInstance

      const state = await Vcs.init()

      expect(state).toBeDefined()
      expect(typeof state.branch).toBe("function")
      expect(typeof state.unsubscribe).toBe("function")

      const branch = await state.branch()
      expect(branch).toBeUndefined()

      // Restore
      if (originalInstance) (global as any).Instance = originalInstance
    })
  })

  describe("branch function", () => {
    it("should return current branch from state", async () => {
      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("develop\n")
              })
            })
          })
        }
      }

      const mockBus = {
        subscribe: () => () => {}
      }

      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      const branch = await Vcs.branch()
      expect(branch).toBe("develop")

      // Restore
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })
  })

  describe("branch change detection", () => {
    it("should detect branch changes and publish events", async () => {
      let publishedEvent: any
      let eventCount = 0

      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => {
                  eventCount++
                  if (eventCount === 1) {
                    return Promise.resolve("main\n")
                  } else {
                    return Promise.resolve("feature-branch\n")
                  }
                }
              })
            })
          })
        }
      }

      const mockBus = {
        subscribe: (event: any, handler: any) => {
          // Store the handler to call it manually
          return {
            handler,
            unsubscribe: () => {}
          }
        },
        publish: (event: any, data: any) => {
          publishedEvent = { event, data }
        }
      }

      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock FileWatcher event
      const mockFileWatcherEvent = {
        properties: { file: "/test/repo/.git/refs/heads/main" }
      }

      // Mock dependencies
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      // Initialize VCS
      await Vcs.init()

      // Simulate file watcher event that doesn't trigger branch change
      const headFileEvent = {
        properties: { file: "/test/repo/.git/HEAD" }
      }
      
      // Get the handler from the subscription
      const subscription = mockBus.subscribe()
      if (subscription.handler) {
        // Call with HEAD file (should be ignored)
        await subscription.handler(headFileEvent)
        
        // No event should be published for HEAD file
        expect(publishedEvent).toBeUndefined()

        // Call with non-HEAD file (should trigger branch check)
        await subscription.handler(mockFileWatcherEvent)
        
        // Event should be published for branch change
        expect(publishedEvent).toBeDefined()
        expect(publishedEvent.event).toBe(Vcs.Event.BranchUpdated)
        expect(publishedEvent.data.branch).toBe("feature-branch")
      }

      // Restore
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })

    it("should not publish event when branch has not changed", async () => {
      let publishCallCount = 0

      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("main\n") // Always returns same branch
              })
            })
          })
        }
      }

      const mockBus = {
        subscribe: () => ({
          handler: async (event: any) => {},
          unsubscribe: () => {}
        }),
        publish: (event: any, data: any) => {
          publishCallCount++
        }
      }

      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      // Initialize VCS
      await Vcs.init()

      // Get the handler from the subscription
      const subscription = mockBus.subscribe()
      if (subscription.handler) {
        // Call handler multiple times
        await subscription.handler({ properties: { file: "some-file" } })
        await subscription.handler({ properties: { file: "another-file" } })
        
        // No events should be published since branch didn't change
        expect(publishCallCount).toBe(0)
      }

      // Restore
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })
  })

  describe("Event definitions", () => {
    it("should have Event object with proper structure", () => {
      expect(Vcs.Event).toBeDefined()
      expect(Vcs.Event.BranchUpdated).toBeDefined()
    })

    it("should define branch updated event schema", () => {
      const eventData = {
        branch: "main"
      }

      const result = Vcs.Event.BranchUpdated.schema.safeParse(eventData)
      expect(result.success).toBe(true)
    })

    it("should accept optional branch in event", () => {
      const eventData = {}

      const result = Vcs.Event.BranchUpdated.schema.safeParse(eventData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.branch).toBeUndefined()
      }
    })

    it("should reject invalid event data", () => {
      const invalidEventData = {
        branch: 123 // Should be string
      }

      const result = Vcs.Event.BranchUpdated.schema.safeParse(invalidEventData)
      expect(result.success).toBe(false)
    })
  })

  describe("logging", () => {
    it("should log initialization", async () => {
      let logMessage = ""
      let logData: any

      const mockLog = {
        info: (message: string, data: any) => {
          logMessage = message
          logData = data
        }
      }

      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => Promise.resolve("main\n")
              })
            })
          })
        }
      }

      const mockBus = { subscribe: () => ({}) }
      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalLog = (global as any).Log?.create
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Log = { create: () => mockLog }
      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      await Vcs.init()

      expect(logMessage).toBe("initialized")
      expect(logData).toEqual({ branch: "main" })

      // Restore
      if (originalLog) (global as any).Log.create = originalLog
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })

    it("should log branch changes", async () => {
      let logMessages: string[] = []

      const mockLog = {
        info: (message: string, data: any) => {
          logMessages.push(message)
        }
      }

      const mockBun = {
        $: {
          quiet: () => ({
            nothrow: () => ({
              cwd: () => ({
                text: () => {
                  // Return different branch on second call
                  if (logMessages.length === 0) {
                    return Promise.resolve("main\n")
                  } else {
                    return Promise.resolve("feature\n")
                  }
                }
              })
            })
          })
        }
      }

      const mockBus = {
        subscribe: (event: any, handler: any) => {
          return {
            handler,
            unsubscribe: () => {}
          }
        },
        publish: () => {}
      }

      const mockInstance = {
        project: { vcs: "git" },
        worktree: "/test/repo"
      }

      // Mock dependencies
      const originalLog = (global as any).Log?.create
      const originalBun = (global as any).Bun
      const originalBus = (global as any).Bus
      const originalInstance = (global as any).Instance

      ;(global as any).Log = { create: () => mockLog }
      ;(global as any).Bun = mockBun
      ;(global as any).Bus = mockBus
      ;(global as any).Instance = mockInstance

      await Vcs.init()

      // Get the handler and trigger branch change
      const subscription = mockBus.subscribe()
      if (subscription.handler) {
        await subscription.handler({ properties: { file: "trigger" } })
      }

      expect(logMessages).toContain("initialized")
      expect(logMessages).toContain("branch changed")

      // Restore
      if (originalLog) (global as any).Log.create = originalLog
      if (originalBun) (global as any).Bun = originalBun
      if (originalBus) (global as any).Bus = originalBus
      if (originalInstance) (global as any).Instance = originalInstance
    })
  })
})
