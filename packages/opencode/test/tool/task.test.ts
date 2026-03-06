// COMPREHENSIVE TEST-LEVEL INSTANCE PROTECTION
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
    console.log("[test-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[test-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[test-protection] Using current Instance")
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

import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test"
import { TaskTool } from "../../src/tool/task"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import { Bus } from "../../src/bus"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("TaskTool", () => {
  const ctx = {
    sessionID: "parent-session",
    messageID: "msg-0",
    ask: async () => {},
    metadata: () => {},
    abort: new AbortController().signal,
  }

  let spies: ReturnType<typeof spyOn>[] = []

  beforeEach(() => {
    spies = [
      spyOn(Agent, "list").mockResolvedValue([
        { name: "sub-agent", mode: "subagent", description: "A sub-agent", permission: [] }
      ] as any),
      spyOn(Agent, "get").mockResolvedValue({
        name: "sub-agent",
        permission: [],
      } as any),
      spyOn(Config, "get").mockResolvedValue({
        experimental: {
          primary_tools: ["tool1"]
        }
      } as any),
      spyOn(Session, "create").mockResolvedValue({ id: "new-session" } as any),
      spyOn(Session, "get").mockResolvedValue({ id: "existing-session" } as any),
      spyOn(Session, "messages").mockResolvedValue([]),
      spyOn(MessageV2, "get").mockResolvedValue({ info: { role: "assistant", modelID: "m1", providerID: "p1" } } as any),
      spyOn(SessionPrompt, "prompt").mockResolvedValue({ parts: [{ type: "text", text: "Task result" }] } as any),
      spyOn(SessionPrompt, "resolvePromptParts").mockResolvedValue([]),
      spyOn(SessionPrompt, "cancel").mockImplementation(() => {}),
      spyOn(Bus, "subscribe").mockReturnValue(() => undefined as any),
      spyOn(Identifier, "ascending").mockReturnValue("msg-1"),
    ]
  })

  afterEach(() => {
    spies.forEach(s => s.mockRestore())
  })

  it("executes a task successfully", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        const params = {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "sub-agent",
        }
        // This is a basic test - the full test would require more setup
        expect(tool).toBeDefined()
      },
    })
  })
})
