import { describe, test, expect, mock } from "bun:test"

// Test that imports the actual agent implementation
describe("ACP Agent - Import Test", () => {
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
  test("should be able to import agent module", async () => {
    const { ACP } = await import("../../src/acp/agent")
    expect(ACP.Agent).toBeDefined()
    expect(typeof ACP.Agent).toBe("function")
  })

  test("should have Agent class with expected properties", async () => {
    const { ACP } = await import("../../src/acp/agent")
    
    // Check that Agent class exists and has expected methods
    expect(ACP.Agent.prototype).toBeDefined()
    
    // Check for key methods that should exist
    const agentMethods = Object.getOwnPropertyNames(ACP.Agent.prototype)
    const expectedMethods = [
      "constructor",
      "initialize",
      "newSession", 
      "prompt",
      "cancel"
    ]
    
    for (const method of expectedMethods) {
      expect(agentMethods.includes(method)).toBe(true)
    }
  })
})
