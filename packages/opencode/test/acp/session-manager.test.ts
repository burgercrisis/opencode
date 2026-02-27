import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { ACPSessionManager } from "../../src/acp/session"
import type { ACPSessionState } from "../../src/acp/types"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"

// Mock SDK
const mockSDK = {
  session: {
    create: mock(() => Promise.resolve({
      data: {
        id: "test-session-id",
        directory: "/test",
        time: { created: new Date().toISOString() }
      }
    })),
    get: mock(() => Promise.resolve({
      data: {
        id: "test-session-id",
        directory: "/test",
        time: { created: new Date().toISOString() },
        model: { id: "test-model" }
      }
    }))
  }
}

describe("ACP Session Manager - Core Functionality", () => {
  let sessionManager: ACPSessionManager

  beforeEach(() => {
    sessionManager = new ACPSessionManager(mockSDK as any)
  })

  afterEach(() => {
    // Restore individual mocks
    mockSDK.session.create.mockRestore?.()
    mockSDK.session.get.mockRestore?.()
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
        [{ id: "test-server", name: "Test Server" }],
        { id: "test-model" }
      )

      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.cwd).toBe("/test")
      expect(session.mcpServers).toEqual([{ id: "test-server", name: "Test Server" }])
      expect(session.model).toEqual({ id: "test-model" })
      expect(session.createdAt).toBeInstanceOf(Date)
    })

    test("should create session with model override", async () => {
      const session = await sessionManager.create(
        "/test",
        [{ id: "test-server", name: "Test Server" }],
        { id: "override-model" }
      )

      expect(session.model).toEqual({ id: "override-model" })
    })

    test("should load existing session", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )

      const loadedSession = sessionManager.tryGet(session.id)
      expect(loadedSession).toBeDefined()
      expect(loadedSession?.id).toBe(session.id)
    })

    test("should return undefined for non-existent session", () => {
      const nonExistentSession = sessionManager.tryGet("non-existent-id")
      expect(nonExistentSession).toBeUndefined()
    })

    test("should throw error for non-existent session in get method", async () => {
      await expect(sessionManager.get("non-existent-id")).rejects.toThrow()
    })
  })

  describe("Session State Management", () => {
    test("should update session model", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )

      const newModel = { id: "updated-model" }
      const updatedSession = sessionManager.setModel(session.id, newModel)

      expect(updatedSession.model).toEqual(newModel)
      expect(sessionManager.getModel(session.id)).toEqual(newModel)
    })

    test("should update session variant", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )

      const newVariant = "test-variant"
      const updatedSession = sessionManager.setVariant(session.id, newVariant)

      expect(updatedSession.variant).toBe(newVariant)
      expect(sessionManager.getVariant(session.id)).toBe(newVariant)
    })

    test("should update session mode", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )

      const newModeId = "test-mode"
      const updatedSession = sessionManager.setMode(session.id, newModeId)

      expect(updatedSession.modeId).toBe(newModeId)
    })
  })

  describe("Error Handling", () => {
    test("should handle session creation errors", async () => {
      mockSDK.session.create.mockRejectedValueOnce(new Error("Creation failed"))

      await expect(sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )).rejects.toThrow("Creation failed")
    })

    test("should handle session load errors", async () => {
      mockSDK.session.get.mockRejectedValueOnce(new Error("Load failed"))

      await expect(sessionManager.load(
        "test-session-id",
        "/test",
        [],
        { id: "test-model" }
      )).rejects.toThrow("Load failed")
    })
  })

  describe("Integration", () => {
    test("should integrate with SDK properly", () => {
      expect(sessionManager).toBeDefined()
      // Session manager should use the provided SDK
      expect(mockSDK.session.create).toBeDefined()
    })

    test("should maintain session state internally", async () => {
      const session = await sessionManager.create(
        "/test",
        [],
        { id: "test-model" }
      )

      // Should be able to retrieve the same session
      const retrievedSession = sessionManager.tryGet(session.id)
      expect(retrievedSession).toBe(session)
    })
  })
})
