import { describe, test, expect, mock } from "bun:test"

// Test that imports the actual agent implementation
describe("ACP Agent - Import Test", () => {
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
