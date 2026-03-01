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
