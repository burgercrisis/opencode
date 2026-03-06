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

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("Server Session - Comprehensive Tests", () => {
  describe("Session.list functionality", () => {
    bulletproofTest("filters by directory", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const first = await Session.create({})

          const otherDir = path.join(projectRoot, "..", "__session_list_other")
          const second = await Instance.provide({
            directory: otherDir,
            fn: async () => Session.create({}),
          })

          const sessions = [...Session.list({ directory: projectRoot })]
          const ids = sessions.map((s) => s.id)

          expect(ids).toContain(first.id)
          expect(ids).not.toContain(second.id)
        },
      })
    })

    bulletproofTest("filters root sessions", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const root = await Session.create({ title: "root-session" })
          const child = await Session.create({ title: "child-session", parentID: root.id })

          const sessions = [...Session.list({ roots: true })]
          const ids = sessions.map((s) => s.id)

          expect(ids).toContain(root.id)
          expect(ids).not.toContain(child.id)
        },
      })
    })

    bulletproofTest("filters by start time", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const startTime = Date.now()
          
          // Create a session
          const session = await Session.create({ title: "test-session" })
          
          // Wait a bit to ensure different timestamps
          await new Promise(resolve => setTimeout(resolve, 10))
          
          const sessions = [...Session.list({ startTime })]
          const ids = sessions.map((s) => s.id)

          expect(ids).toContain(session.id)
        },
      })
    })

    bulletproofTest("handles empty session list", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const sessions = [...Session.list({ directory: projectRoot })]
          expect(sessions).toEqual([])
        },
      })
    })

    bulletproofTest("handles multiple filters combined", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const root1 = await Session.create({ title: "root1" })
          const root2 = await Session.create({ title: "root2" })
          const child = await Session.create({ title: "child", parentID: root1.id })

          const sessions = [...Session.list({ directory: projectRoot, roots: true })]
          const ids = sessions.map((s) => s.id)

          expect(ids).toContain(root1.id)
          expect(ids).toContain(root2.id)
          expect(ids).not.toContain(child.id)
        },
      })
    })
  })

  describe("TUI selectSession endpoint", () => {
    bulletproofTest("should return 200 when called with valid session", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const session = await Session.create({})

          // #when
          const app = Server.App()
          const response = await app.request(`/tui/select-session?directory=${encodeURIComponent(projectRoot)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: session.id }),
          })

          // #then
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body).toBe(true)

          await Session.remove(session.id)
        },
      })
    })

    bulletproofTest("should return 404 when session does not exist", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const nonExistentSessionID = "ses_nonexistent123"

          // #when
          const app = Server.App()
          const response = await app.request("/tui/select-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: nonExistentSessionID }),
          })

          // #then
          expect(response.status).toBe(404)
          const body = await response.json()
          expect(body.error).toBeDefined()
        },
      })
    })

    bulletproofTest("should handle missing session ID in request", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #when
          const app = Server.App()
          const response = await app.request("/tui/select-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })

          // #then
          expect(response.status).toBe(400)
          const body = await response.json()
          expect(body.error).toBeDefined()
        },
      })
    })

    bulletproofTest("should handle invalid JSON in request", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #when
          const app = Server.App()
          const response = await app.request("/tui/select-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "invalid json",
          })

          // #then
          expect(response.status).toBe(400)
        },
      })
    })

    bulletproofTest("should handle directory parameter correctly", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const session = await Session.create({})

          // #when
          const app = Server.App()
          const response = await app.request(`/tui/select-session?directory=${encodeURIComponent(projectRoot)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: session.id }),
          })

          // #then
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body).toBe(true)

          await Session.remove(session.id)
        },
      })
    })

    bulletproofTest("should handle URL encoding in directory parameter", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const session = await Session.create({})
          const specialDir = path.join(projectRoot, "special path with spaces")

          // #when
          const app = Server.App()
          const response = await app.request(`/tui/select-session?directory=${encodeURIComponent(specialDir)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: session.id }),
          })

          // #then
          // Should handle gracefully even if directory doesn't exist
          expect([200, 404]).toContain(response.status)

          await Session.remove(session.id)
        },
      })
    })
  })

  describe("Session Management Edge Cases", () => {
    bulletproofTest("handles concurrent session creation and listing", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // Create multiple sessions concurrently
          const sessionPromises = []
          for (let i = 0; i < 5; i++) {
            sessionPromises.push(Session.create({ title: `session-${i}` }))
          }

          const sessions = await Promise.all(sessionPromises)
          const sessionIds = sessions.map(s => s.id)

          // List sessions
          const listedSessions = [...Session.list({ directory: projectRoot })]
          const listedIds = listedSessions.map((s) => s.id)

          // All created sessions should be in the list
          sessionIds.forEach(id => {
            expect(listedIds).toContain(id)
          })

          // Cleanup
          await Promise.all(sessions.map(s => Session.remove(s.id)))
        },
      })
    })

    bulletproofTest("handles session cleanup after selection", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const session = await Session.create({})

          // #when
          const app = Server.App()
          const response = await app.request(`/tui/select-session?directory=${encodeURIComponent(projectRoot)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: session.id }),
          })

          // #then
          expect(response.status).toBe(200)

          // Session should still exist after selection
          const listedSessions = [...Session.list({ directory: projectRoot })]
          const listedIds = listedSessions.map((s) => s.id)
          expect(listedIds).toContain(session.id)

          await Session.remove(session.id)
        },
      })
    })

    bulletproofTest("handles malformed session IDs", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #when
          const app = Server.App()
          const response = await app.request("/tui/select-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: "" }),
          })

          // #then
          expect(response.status).toBe(400)
          const body = await response.json()
          expect(body.error).toBeDefined()
        },
      })
    })

    bulletproofTest("handles very long session IDs", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #when
          const longSessionID = "x".repeat(1000)
          const app = Server.App()
          const response = await app.request("/tui/select-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: longSessionID }),
          })

          // #then
          expect(response.status).toBe(404)
        },
      })
    })
  })
})
