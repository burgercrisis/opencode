import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { SessionRoutes } from "../../routes/session"
import { Session, SessionStatus, SessionPrompt, SessionCompaction, setRevert, SessionSummary, Agent, Snapshot } from "../../../session"
import { Bus } from "../../../bus"
import { TuiEvent } from "@/cli/cmd/tui/event"

// Store original functions
const originalSessionList = Session.list
const originalSessionStatusList = SessionStatus.list
const originalSessionGet = Session.get
const originalSessionPrompt = SessionPrompt.list
const originalSessionCompaction = SessionCompaction.list
const originalSessionRevert = setRevert
const originalSessionSummary = SessionSummary.list
const originalAgentList = Agent.list
const originalSnapshotList = Snapshot.list
const originalBusEmit = Bus.emit
const originalTuiEventEmit = TuiEvent.emit

// Simple mock data
const mockSessions = [
  {
    id: "session-1",
    title: "Test Session 1",
    directory: "/path/to/project1",
    parentID: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active"
  }
]

const mockSessionStatus = {
  "session-1": {
    status: "active",
    lastActivity: new Date().toISOString(),
    messages: 10,
    tokens: 5000
  }
}

beforeAll(() => {
  // Simple generator mock for Session.list
  Session.list = async function* () {
    for (const session of mockSessions) {
      yield session
    }
  }

  SessionStatus.list = async () => mockSessionStatus
  Session.get = async (id: string) => mockSessions[0]
  SessionPrompt.list = async () => []
  SessionCompaction.list = async () => []
  SessionRevert.list = async () => []
  SessionSummary.list = async () => []
  Todo.list = async () => []
  Agent.list = async () => []
  Snapshot.list = async () => []
})

afterAll(() => {
  Session.list = originalSessionList
  SessionStatus.list = originalSessionStatusList
  Session.get = originalSessionGet
  SessionPrompt.list = originalSessionPrompt
  SessionCompaction.list = originalSessionCompaction
  SessionSummary.list = originalSessionSummary
  Agent.list = originalAgentList
  Snapshot.list = originalSnapshotList
  Bus.emit = originalBusEmit
  TuiEvent.emit = originalTuiEventEmit
})

describe("SessionRoutes - Simplified", () => {
  let app: ReturnType<typeof SessionRoutes>

  beforeEach(() => {
    globalThis.requestId = "test-request-id"
    app = SessionRoutes()
  })

  describe("GET /", () => {
    it("should return list of sessions", async () => {
      const res = await app.request("/")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json.length).toBe(1)
    })

    it("should handle empty session list", async () => {
      Session.list = async function* () {
        // Empty generator
      }

      const res = await app.request("/")
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("GET /status", () => {
    it("should return session status", async () => {
      const res = await app.request("/status")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(json).toEqual(mockSessionStatus)
    })
  })

  describe("GET /:sessionID", () => {
    it("should return session details", async () => {
      const res = await app.request("/session-1")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(json).toEqual(mockSessions[0])
    })

    it("should handle non-existent session", async () => {
      const res = await app.request("/non-existent")
      expect([404, 500]).toContain(res.status)
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const res = await app.request("/", { method: "POST" })
      expect([404, 500]).toContain(res.status)
    })
  })
})
