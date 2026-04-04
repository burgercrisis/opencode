import { afterEach, beforeEach, describe, expect, it, spyOn, test } from "bun:test"
import { Agent } from "../../src/agent/agent"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { MessageV2 } from "../../src/session/message-v2"
import { Session } from "../../src/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TaskTool } from "../../src/tool/task"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

describe("tool.task", () => {
  test("description sorts subagents by name and is stable across calls", async () => {
    await using tmp = await tmpdir({
      config: {
        agent: {
          zebra: {
            description: "Zebra agent",
            mode: "subagent",
          },
          alpha: {
            description: "Alpha agent",
            mode: "subagent",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const build = await Agent.get("build")
        const first = await TaskTool.init({ agent: build })
        const second = await TaskTool.init({ agent: build })

        expect(first.description).toBe(second.description)

        const alpha = first.description.indexOf("- alpha: Alpha agent")
        const explore = first.description.indexOf("- explore:")
        const general = first.description.indexOf("- general:")
        const zebra = first.description.indexOf("- zebra: Zebra agent")

        expect(alpha).toBeGreaterThan(-1)
        expect(explore).toBeGreaterThan(alpha)
        expect(general).toBeGreaterThan(explore)
        expect(zebra).toBeGreaterThan(general)
      },
    })
  })
})

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
        { name: "sub-agent", mode: "subagent", description: "A sub-agent", permission: [] },
      ] as any),
      spyOn(Agent, "get").mockResolvedValue({
        name: "sub-agent",
        permission: [],
      } as any),
      spyOn(Config, "get").mockResolvedValue({
        experimental: {
          primary_tools: ["tool1"],
        },
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
    spies.forEach((s) => s.mockRestore())
  })

  it("executes a task successfully", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await TaskTool.init()
        expect(tool).toBeDefined()
      },
    })
  })
})
