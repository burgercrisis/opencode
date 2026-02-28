import { describe, test, expect, beforeEach } from "bun:test"
import { ACPSessionManager } from "../../src/acp/session"
import type { ACPSessionState } from "../../src/acp/types"

// Mock SDK - using plain functions instead of bun:test mock
const createSessionMock = async () => ({
  data: {
    id: "test-session-id",
    directory: "/test",
    time: { created: new Date().toISOString() }
  }
})

const getSessionMock = async () => ({
  data: {
    id: "test-session-id",
    directory: "/test",
    time: { created: new Date().toISOString() },
    model: { providerID: "test", modelID: "test-model" }
  }
})

const mockSDK = {
  session: {
    create: createSessionMock,
    get: getSessionMock
  }
}

describe("ACP Session Manager - Core Functionality", () => {
  let sessionManager: ACPSessionManager

  beforeEach(() => {
    sessionManager = new ACPSessionManager(mockSDK as any)
  })

  describe("Constructor", () => {
    test("should initialize with SDK", () => {
      expect(sessionManager).toBeDefined()
      expect(sessionManager).toBeInstanceOf(ACPSessionManager)
    })
  })

  describe("Session Management", () => {
    test("should create session with basic parameters", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.cwd).toBe("/test")
      expect(session.mcpServers).toEqual([])
      expect(session.model).toEqual({ providerID: "test", modelID: "test-model" })
      expect(session.createdAt).toBeInstanceOf(Date)
    })

    test("should create session with model override", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "override-model" }
      )

      expect(session.model).toEqual({ providerID: "test", modelID: "override-model" })
    })

    test("should load existing session", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      const loadedSession = sessionManager.tryGet(session.id)
      expect(loadedSession).toBeDefined()
      expect(loadedSession?.id).toBe(session.id)
    })

    test("should return undefined for non-existent session", () => {
      const session = sessionManager.tryGet("non-existent-id")
      expect(session).toBeUndefined()
    })
  })

  describe("Session State Management", () => {
    test("should update session model", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      const newModel = { providerID: "test", modelID: "new-model" }
      const updatedSession = sessionManager.setModel(session.id, newModel)

      expect(updatedSession).toBeDefined()
      expect(updatedSession.model).toEqual(newModel)
      expect(sessionManager.getModel(session.id)).toEqual(newModel)
    })

    test("should update session variant", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      sessionManager.setVariant(session.id, "xhigh")
      expect(sessionManager.getVariant(session.id)).toBe("xhigh")
    })

    test("should update session mode", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      sessionManager.setMode(session.id, "plan")
      const stored = sessionManager.get(session.id)
      expect(stored.modeId).toBe("plan")
    })
  })

  describe("Error Handling", () => {
    test("should handle session creation errors", async () => {
      // Temporarily replace the create method to throw
      const originalCreate = mockSDK.session.create
      mockSDK.session.create = async () => { throw new Error("Creation failed") }

      await expect(
        sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })
      ).rejects.toThrow("Creation failed")

      // Restore
      mockSDK.session.create = originalCreate
    })

    test("should handle session load errors", async () => {
      // Temporarily replace the get method to throw
      const originalGet = mockSDK.session.get
      mockSDK.session.get = async () => { throw new Error("Load failed") }

      await expect(
        sessionManager.load("test-id", "/test", [], { providerID: "test", modelID: "test-model" })
      ).rejects.toThrow("Load failed")

      // Restore
      mockSDK.session.get = originalGet
    })
  })

  describe("Integration", () => {
    test("should integrate with SDK properly", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      expect(session.id).toBeDefined()
      expect(session.cwd).toBe("/test")
    })

    test("should maintain session state internally", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { providerID: "test", modelID: "test-model" }
      )

      // Verify internal state
      const stored = sessionManager.tryGet(session.id)
      expect(stored).toBe(session)
    })
  })
})
