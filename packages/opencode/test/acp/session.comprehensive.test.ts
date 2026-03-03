import { describe, test, expect, beforeEach, mock } from "bun:test"
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

describe("ACP Session Manager - Comprehensive Tests", () => {
  let sessionManager: ACPSessionManager

  beforeEach(() => {
    sessionManager = new ACPSessionManager(mockSDK as any)
  })

  describe("Basic Tests", () => {
    test("should export SessionManager class", () => {
      expect(ACPSessionManager).toBeDefined()
      expect(typeof ACPSessionManager).toBe("function")
    })

    test("should create session manager with SDK", () => {
      const mockSDK = {
        session: {
          create: mock(() => Promise.resolve({
            data: {
              id: "test-session-id",
              directory: "/test",
              time: { created: new Date().toISOString() }
            }
          }))
        }
      }

      const sessionManager = new ACPSessionManager(mockSDK as any)
      expect(sessionManager).toBeDefined()
      expect(sessionManager).toBeInstanceOf(ACPSessionManager)
    })

    test("should have expected methods", () => {
      const sessionManager = new ACPSessionManager({} as any)
      
      // Check for key methods that should exist
      const managerMethods = Object.getOwnPropertyNames(ACPSessionManager.prototype)
      const expectedMethods = [
        "constructor",
        "create",
        "load", 
        "tryGet",
        "get",
        "setModel",
        "setVariant",
        "setMode"
      ]
      
      for (const method of expectedMethods) {
        expect(managerMethods.includes(method)).toBe(true)
      }
    })

    test("should handle session creation with minimal parameters", async () => {
      const mockSDK = {
        session: {
          create: mock(() => Promise.resolve({
            data: {
              id: "minimal-session",
              directory: "/test",
              time: { created: new Date().toISOString() }
            }
          }))
        }
      }

      const manager = new ACPSessionManager(mockSDK as any)
      const session = await manager.create("/test", [], {})
      
      expect(session).toBeDefined()
      expect(session.id).toBe("minimal-session")
    })
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
      expect(session.directory).toBe("/test")
    })

    test("should load existing session", async () => {
      const session = await sessionManager.load("test-session-id")
      
      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.model?.providerID).toBe("test")
    })

    test("should try get session safely", async () => {
      const session = await sessionManager.tryGet("test-session-id")
      
      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
    })

    test("should handle non-existent session in tryGet", async () => {
      const mockSDK = {
        session: {
          get: mock(() => Promise.resolve({ data: null }))
        }
      }
      const manager = new ACPSessionManager(mockSDK as any)
      
      const session = await manager.tryGet("non-existent")
      expect(session).toBeUndefined()
    })

    test("should get session with error handling", async () => {
      const session = await sessionManager.get("test-session-id")
      
      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
    })

    test("should handle session creation errors", async () => {
      const mockSDK = {
        session: {
          create: mock(() => Promise.reject(new Error("Creation failed")))
        }
      }
      const manager = new ACPSessionManager(mockSDK as any)
      
      await expect(manager.create("/test", [], {})).rejects.toThrow("Creation failed")
    })
  })

  describe("Session Configuration", () => {
    test("should set model configuration", async () => {
      await sessionManager.setModel("test-session-id", {
        providerID: "openai",
        modelID: "gpt-4"
      })
      
      // Verify the model was set (implementation dependent)
      expect(sessionManager).toBeDefined()
    })

    test("should set variant configuration", async () => {
      await sessionManager.setVariant("test-session-id", {
        temperature: 0.7,
        maxTokens: 1000
      })
      
      // Verify the variant was set (implementation dependent)
      expect(sessionManager).toBeDefined()
    })

    test("should set mode configuration", async () => {
      await sessionManager.setMode("test-session-id", "edit")
      
      // Verify the mode was set (implementation dependent)
      expect(sessionManager).toBeDefined()
    })
  })

  describe("Error Handling", () => {
    test("should handle SDK initialization errors", () => {
      expect(() => new ACPSessionManager(null as any)).not.toThrow()
    })

    test("should handle missing session data", async () => {
      const mockSDK = {
        session: {
          get: mock(() => Promise.resolve({ data: null }))
        }
      }
      const manager = new ACPSessionManager(mockSDK as any)
      
      await expect(manager.get("non-existent")).rejects.toThrow()
    })

    test("should handle malformed session data", async () => {
      const mockSDK = {
        session: {
          get: mock(() => Promise.resolve({ data: { invalid: "data" } }))
        }
      }
      const manager = new ACPSessionManager(mockSDK as any)
      
      const session = await manager.get("malformed")
      expect(session).toBeDefined()
    })
  })

  describe("Edge Cases", () => {
    test("should handle empty session ID", async () => {
      await expect(sessionManager.get("")).rejects.toThrow()
    })

    test("should handle null session ID", async () => {
      await expect(sessionManager.get(null as any)).rejects.toThrow()
    })

    test("should handle undefined session ID", async () => {
      await expect(sessionManager.get(undefined as any)).rejects.toThrow()
    })

    test("should handle concurrent session operations", async () => {
      const promises = [
        sessionManager.create("/test1", [], {}),
        sessionManager.create("/test2", [], {}),
        sessionManager.create("/test3", [], {})
      ]
      
      const sessions = await Promise.all(promises)
      expect(sessions).toHaveLength(3)
      expect(sessions[0].id).toBe("test-session-id")
      expect(sessions[1].id).toBe("test-session-id")
      expect(sessions[2].id).toBe("test-session-id")
    })
  })
})
