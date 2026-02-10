import { describe, it, expect, mock, beforeEach } from "bun:test"
import { TaskTool } from "../../src/tool/task"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import { Bus } from "../../src/bus"
import { Identifier } from "../../src/id/id"

mock.module("../../src/agent/agent", () => ({
  Agent: {
    list: mock(async () => []),
    get: mock(async () => null),
  }
}))

mock.module("../../src/config/config", () => ({
  Config: {
    get: mock(async () => ({})),
  }
}))

mock.module("../../src/session/index", () => ({
  Session: {
    create: mock(async () => ({ id: "new-session" })),
    get: mock(async () => ({ id: "existing-session" })),
    messages: mock(async () => []),
  }
}))

mock.module("../../src/session/message-v2", () => ({
  MessageV2: {
    get: mock(async () => ({ info: { role: "assistant", modelID: "m1", providerID: "p1" } })),
    Event: {
      PartUpdated: "PartUpdated",
    }
  }
}))

mock.module("../../src/session/prompt", () => ({
  SessionPrompt: {
    prompt: mock(async () => ({ parts: [{ type: "text", text: "Task result" }] })),
    resolvePromptParts: mock(async () => []),
    cancel: mock(() => {}),
  }
}))

mock.module("../../src/bus/index", () => ({
  Bus: {
    subscribe: mock(() => () => {}),
  }
}))

mock.module("../../src/id/id", () => ({
  Identifier: {
    ascending: mock(() => "msg-1"),
  }
}))

describe("TaskTool", () => {
  const ctx = {
    sessionID: "parent-session",
    messageID: "msg-0",
    ask: mock(async () => {}),
    metadata: mock(() => {}),
    abort: new EventTarget(),
  }

  beforeEach(() => {
    ;(ctx.ask as any).mockClear()
    ;(ctx.metadata as any).mockClear()
    ;(Agent.list as any).mockClear()
    ;(Agent.get as any).mockClear()
    ;(Config.get as any).mockClear()
    ;(Session.create as any).mockClear()
    ;(Session.get as any).mockClear()
    ;(Session.messages as any).mockClear()
    ;(SessionPrompt.prompt as any).mockClear()
    ;(SessionPrompt.cancel as any).mockClear()
    ;(SessionPrompt.resolvePromptParts as any).mockResolvedValue([])
    ;(MessageV2.get as any).mockResolvedValue({ info: { role: "assistant", modelID: "m1", providerID: "p1" } })

    ;(Agent.list as any).mockResolvedValue([
      { name: "sub-agent", mode: "subagent", description: "A sub-agent", permission: [] }
    ])
    ;(Agent.get as any).mockResolvedValue({
      name: "sub-agent",
      permission: [],
    })
    ;(Config.get as any).mockResolvedValue({
      experimental: {
        primary_tools: ["tool1"]
      }
    })
  })

  it("executes a task successfully", async () => {
    const tool = await TaskTool.init()
    const params = {
      description: "Test task",
      prompt: "Do something",
      subagent_type: "sub-agent",
    }

    const result = await tool.execute(params, ctx as any)

    expect(Session.create).toHaveBeenCalled()
    expect(SessionPrompt.prompt).toHaveBeenCalled()
    expect(result.title).toBe("Test task")
    expect(result.output).toContain("Task result")
    expect(result.output).toContain("task_id: new-session")
  })

  it("resumes an existing task", async () => {
    const tool = await TaskTool.init()
    const params = {
      description: "Resume task",
      prompt: "Continue",
      subagent_type: "sub-agent",
      task_id: "existing-session",
    }

    await tool.execute(params, ctx as any)

    expect(Session.get).toHaveBeenCalledWith("existing-session")
    expect(Session.create).not.toHaveBeenCalled()
  })

  it("throws error if agent not found", async () => {
    const tool = await TaskTool.init()
    ;(Agent.get as any).mockResolvedValue(null)
    const params = {
      description: "Invalid agent",
      prompt: "Fail",
      subagent_type: "non-existent",
    }

    try {
      await tool.execute(params, ctx as any)
      throw new Error("Should have failed")
    } catch (e: any) {
      expect(e.message).toContain("Unknown agent type")
    }
  })

  it("handles abort", async () => {
    const tool = await TaskTool.init()
    const params = {
      description: "Aborted task",
      prompt: "Wait",
      subagent_type: "sub-agent",
    }

    const abortController = new AbortController()
    const ctxWithAbort = { ...ctx, abort: abortController.signal }

    // Mock prompt to wait a bit so we can abort while it's running
    ;(SessionPrompt.prompt as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return { parts: [{ type: "text", text: "Done" }] }
    })

    const promise = tool.execute(params, ctxWithAbort as any)
    
    // Give it a small delay to reach the prompt
    await new Promise(resolve => setTimeout(resolve, 50))
    
    abortController.abort()
    await promise

    expect(SessionPrompt.cancel).toHaveBeenCalled()
  })

  it("throws error if message role is not assistant", async () => {
    const tool = await TaskTool.init()
    ;(MessageV2.get as any).mockResolvedValue({ info: { role: "user" } })
    const params = {
      description: "Invalid role",
      prompt: "Fail",
      subagent_type: "sub-agent",
    }

    try {
      await tool.execute(params, ctx as any)
      throw new Error("Should have failed")
    } catch (e: any) {
      expect(e.message).toBe("Not an assistant message")
    }
  })

  it("handles tool part updates via Bus", async () => {
    const tool = await TaskTool.init()
    let busCallback: any
    ;(Bus.subscribe as any).mockImplementation((event: string, cb: any) => {
      busCallback = cb
      return () => {}
    })

    const params = {
      description: "Bus test",
      prompt: "Watch bus",
      subagent_type: "sub-agent",
    }

    // Mock prompt to trigger the bus callback before finishing
    ;(SessionPrompt.prompt as any).mockImplementation(async () => {
      if (busCallback) {
        busCallback({
          properties: {
            part: {
              sessionID: "new-session",
              messageID: "other-msg",
              type: "tool",
              id: "tool-part-1",
              tool: "test-tool",
              state: { status: "completed", title: "Finished tool" }
            }
          }
        })
      }
      return { parts: [{ type: "text", text: "Bus result" }] }
    })

    await tool.execute(params, ctx as any)
    expect(ctx.metadata).toHaveBeenCalledTimes(2) // Initial + after bus update
  })

  it("generates summary from session messages", async () => {
    const tool = await TaskTool.init()
    ;(Session.messages as any).mockResolvedValue([
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            id: "part-1",
            tool: "tool-1",
            state: { status: "completed", title: "Done 1" }
          },
          {
            type: "text",
            text: "Intermediary text"
          }
        ]
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "User message" }]
      },
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            id: "part-2",
            tool: "tool-2",
            state: { status: "running" }
          }
        ]
      }
    ])

    const params = {
      description: "Summary test",
      prompt: "Do summary",
      subagent_type: "sub-agent",
    }

    const result = await tool.execute(params, ctx as any)

    expect(result.metadata.summary).toHaveLength(2)
    expect(result.metadata.summary[0].id).toBe("part-1")
    expect(result.metadata.summary[1].id).toBe("part-2")
  })

  it("filters accessible agents based on permissions", async () => {
    // This tests the TaskTool.define initialization logic
    ;(Agent.list as any).mockResolvedValue([
      { name: "allowed-agent", mode: "subagent", description: "Allowed", permission: [] },
      { name: "denied-agent", mode: "subagent", description: "Denied", permission: [] },
    ])

    // TaskTool.define is executed when we call TaskTool.init()
    // However, the accessibleAgents filtering happens inside the define callback.
    // To test this, we need to provide a ctx.agent to the define callback.
    // But Tool.init() doesn't take a ctx.
    
    // Wait, let's look at TaskTool.define:
    // export const TaskTool = Tool.define("task", async (ctx) => { ... })
    // The ctx passed to define is the ToolContext during initialization.
    
    const tool = await TaskTool.init({
      agent: {
        name: "test-agent",
        permission: [
          { permission: "task", pattern: "allowed-agent", action: "allow" },
          { permission: "task", pattern: "denied-agent", action: "deny" },
        ]
      }
    } as any)

    expect(tool.description).toContain("allowed-agent")
    expect(tool.description).not.toContain("denied-agent")
  })
})
