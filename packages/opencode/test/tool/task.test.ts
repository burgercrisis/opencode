import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test"
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
    ask: vi.fn(async () => {}),
    metadata: vi.fn(() => {}),
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    vi.spyOn(Agent, "list").mockResolvedValue([
      { name: "sub-agent", mode: "subagent", description: "A sub-agent", permission: [] }
    ] as any)
    vi.spyOn(Agent, "get").mockResolvedValue({
      name: "sub-agent",
      permission: [],
    } as any)
    vi.spyOn(Config, "get").mockResolvedValue({
      experimental: {
        primary_tools: ["tool1"]
      }
    } as any)
    vi.spyOn(Session, "create").mockResolvedValue({ id: "new-session" } as any)
    vi.spyOn(Session, "get").mockResolvedValue({ id: "existing-session" } as any)
    vi.spyOn(Session, "messages").mockResolvedValue([])
    vi.spyOn(MessageV2, "get").mockResolvedValue({ info: { role: "assistant", modelID: "m1", providerID: "p1" } } as any)
    vi.spyOn(SessionPrompt, "prompt").mockResolvedValue({ parts: [{ type: "text", text: "Task result" }] } as any)
    vi.spyOn(SessionPrompt, "resolvePromptParts").mockResolvedValue([])
    vi.spyOn(SessionPrompt, "cancel").mockImplementation(() => {})
    vi.spyOn(Bus, "subscribe").mockReturnValue(() => undefined as any)
    vi.spyOn(Identifier, "ascending").mockReturnValue("msg-1")
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

        const result = await tool.execute(params, ctx as any)

        expect(Session.create).toHaveBeenCalled()
        expect(SessionPrompt.prompt).toHaveBeenCalled()
        expect(result.title).toBe("Test task")
        expect(result.output).toContain("Task result")
        expect(result.output).toContain("task_id: new-session")
        expect(result.metadata.sessionId).toBe("new-session")
      }
    })
  })

  it("resumes an existing task", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
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
      }
    })
  })

  it("throws error if agent not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        vi.spyOn(Agent, "get").mockResolvedValue(null as any)
        const params = {
          description: "Invalid agent",
          prompt: "Fail",
          subagent_type: "non-existent",
        }

        await expect(tool.execute(params, ctx as any)).rejects.toThrow("Unknown agent type")
      }
    })
  })

  it("handles abort", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        const params = {
          description: "Aborted task",
          prompt: "Wait",
          subagent_type: "sub-agent",
        }

        const abortController = new AbortController()
        const ctxWithAbort = { ...ctx, abort: abortController.signal }

        vi.spyOn(SessionPrompt, "prompt").mockImplementation((async () => {
          await new Promise(resolve => setTimeout(resolve, 100))
          return { parts: [{ type: "text", text: "Done" }] }
        }) as any)

        const promise = tool.execute(params, ctxWithAbort as any)
        
        await new Promise(resolve => setTimeout(resolve, 20))
        abortController.abort()
        await promise

        expect(SessionPrompt.cancel).toHaveBeenCalled()
      }
    })
  })

  it("throws error if message role is not assistant", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        vi.spyOn(MessageV2, "get").mockResolvedValue({ info: { role: "user" } } as any)
        const params = {
          description: "Invalid role",
          prompt: "Fail",
          subagent_type: "sub-agent",
        }

        await expect(tool.execute(params, ctx as any)).rejects.toThrow("Not an assistant message")
      }
    })
  })

  it("handles tool part updates via Bus", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        let busCallback: any
        vi.spyOn(Bus, "subscribe").mockImplementation(((event: any, cb: any) => {
      if (event === MessageV2.Event.PartUpdated) {
        busCallback = cb
      }
      return () => undefined as any
    }) as any)

        const params = {
          description: "Bus test",
          prompt: "Watch bus",
          subagent_type: "sub-agent",
        }

        vi.spyOn(SessionPrompt, "prompt").mockImplementation((async () => {
          if (busCallback) {
            busCallback({
              properties: {
                part: {
                  sessionID: "new-session",
                  messageID: "other-msg",
                  type: "tool",
                  id: "tool-part-1",
                  tool: "test-tool",
                  state: { status: "completed", title: "Success" }
                }
              }
            })
          }
          return { parts: [{ type: "text", text: "Done" }] }
        }) as any)

        await tool.execute(params, ctx as any)
        expect(ctx.metadata).toHaveBeenCalledWith(expect.objectContaining({
          title: "Bus test"
        }))
      }
    })
  })
})
