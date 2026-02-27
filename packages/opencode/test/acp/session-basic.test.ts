import { describe, test, expect, mock } from "bun:test"
import { ACPSessionManager } from "../../src/acp/session"
import type { ACPSessionState } from "../../src/acp/types"

describe("ACP Session Manager - Basic Tests", () => {
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
            id: "test-session-id",
            directory: "/test",
            time: { created: new Date().toISOString() }
          }
        }))
      }
    }

    const sessionManager = new ACPSessionManager(mockSDK as any)
    const session = await sessionManager.create("/test", [], { id: "test-model" })

    expect(session.id).toBe("test-session-id")
    expect(session.cwd).toBe("/test")
    expect(session.model).toEqual({ id: "test-model" })
    expect(session.createdAt).toBeInstanceOf(Date)
  })

  test("should handle session retrieval", async () => {
    let storedSession: ACPSessionState | undefined
    
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

    const sessionManager = new ACPSessionManager(mockSDK as any)
    
    // Create a session first
    storedSession = await sessionManager.create("/test", [], { id: "test-model" })
    
    // Try to get it
    const retrievedSession = sessionManager.tryGet(storedSession.id)
    expect(retrievedSession).toBeDefined()
    expect(retrievedSession?.id).toBe(storedSession.id)
  })

  test("should return undefined for non-existent session", () => {
    const mockSDK = { session: { get: mock(() => Promise.resolve({ data: null })) } }
    const sessionManager = new ACPSessionManager(mockSDK as any)
    
    const nonExistentSession = sessionManager.tryGet("non-existent-id")
    expect(nonExistentSession).toBeUndefined()
  })
})
