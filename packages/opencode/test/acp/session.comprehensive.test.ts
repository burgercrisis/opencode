import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { ACPSessionManager } from "../../src/acp/session"
import type { ACPSessionState } from "../../src/acp/types"
import { RequestError } from "@agentclientprotocol/sdk"

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
      expect(session.cwd).toBe("/test")
    })

    test("should load existing session", async () => {
      const session = await sessionManager.load("test-session-id", "/test", [], { providerID: "test", modelID: "test-model" })

      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.cwd).toBe("/test")
    })

    test("should try get session safely", async () => {
      // First create a session
      await sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })

      // Then try to get it
      const session = sessionManager.tryGet("test-session-id")

      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.cwd).toBe("/test")
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
      // First create a session
      await sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })

      // Then get it
      const session = await sessionManager.get("test-session-id")

      expect(session).toBeDefined()
      expect(session.id).toBe("test-session-id")
      expect(session.cwd).toBe("/test")
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
      // First create a session
      await sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })

      // Then set the model
      await sessionManager.setModel("test-session-id", {
        providerID: "openai",
        modelID: "gpt-4"
      })

      // Verify the model was set
      const session = sessionManager.get("test-session-id")
      expect(session.model?.providerID).toBe("openai")
      expect(session.model?.modelID).toBe("gpt-4")
    })

    test("should set variant configuration", async () => {
      // First create a session
      await sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })

      // Then set the variant (setVariant expects a string, not an object)
      await sessionManager.setVariant("test-session-id", "test-variant")

      // Verify the variant was set
      const session = sessionManager.get("test-session-id")
      expect(session.variant).toBe("test-variant")
    })

    test("should set mode configuration", async () => {
      // First create a session
      await sessionManager.create("/test", [], { providerID: "test", modelID: "test-model" })

      // Then set the mode
      await sessionManager.setMode("test-session-id", "edit")

      // Verify the mode was set
      const session = sessionManager.get("test-session-id")
      expect(session.modeId).toBe("edit")
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

      try {
        await manager.get("non-existent")
        fail("Expected RequestError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(RequestError)
        expect((error as RequestError).code).toBe(-32602)
      }
    })

    test("should handle malformed session data", async () => {
      const mockSDK = {
        session: {
          get: mock(() => Promise.resolve({ data: { invalid: "data" } }))
        }
      }
      const manager = new ACPSessionManager(mockSDK as any)

      try {
        await manager.get("malformed")
        fail("Expected RequestError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(RequestError)
        expect((error as RequestError).code).toBe(-32602)
      }
    })
  })

  describe("Edge Cases", () => {
    test("should handle empty session ID", async () => {
      try {
        await sessionManager.get("")
        fail("Expected RequestError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(RequestError)
        expect((error as RequestError).code).toBe(-32602)
      }
    })

    test("should handle null session ID", async () => {
      try {
        await sessionManager.get(null as any)
        fail("Expected RequestError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(RequestError)
        expect((error as RequestError).code).toBe(-32602)
      }
    })

    test("should handle undefined session ID", async () => {
      try {
        await sessionManager.get(undefined as any)
        fail("Expected RequestError to be thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(RequestError)
        expect((error as RequestError).code).toBe(-32602)
      }
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
