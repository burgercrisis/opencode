import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("Server Session - Comprehensive Tests", () => {
  describe("Session.list functionality", () => {
    test("filters by directory", async () => {
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

    test("filters root sessions", async () => {
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

    test("filters by start time", async () => {
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

    test("handles empty session list", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const sessions = [...Session.list({ directory: projectRoot })]
          expect(sessions).toEqual([])
        },
      })
    })

    test("handles multiple filters combined", async () => {
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
    test("should return 200 when called with valid session", async () => {
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

    test("should return 404 when session does not exist", async () => {
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

    test("should handle missing session ID in request", async () => {
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

    test("should handle invalid JSON in request", async () => {
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

    test("should handle directory parameter correctly", async () => {
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

    test("should handle URL encoding in directory parameter", async () => {
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
    test("handles concurrent session creation and listing", async () => {
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

    test("handles session cleanup after selection", async () => {
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

    test("handles malformed session IDs", async () => {
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

    test("handles very long session IDs", async () => {
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
