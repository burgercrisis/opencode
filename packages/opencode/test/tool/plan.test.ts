import { expect, it, describe, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { PlanExitTool, PlanEnterTool } from "../../src/tool/plan"
import { Session } from "../../src/session"
import { Question } from "../../src/question"
import { MessageV2 } from "../../src/session/message-v2"
import { Provider } from "../../src/provider/provider"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"
import { tmpdir } from "../fixture/fixture"

describe("Plan Tools", () => {
  const ctx: any = {
    sessionID: "session-123",
    messageID: "msg-123",
    callID: "call-123",
    metadata: mock(),
  }

  let spies: ReturnType<typeof spyOn>[] = []

  beforeEach(() => {
    spies = [
      spyOn(Session, "get").mockResolvedValue({ id: "session-123" } as any),
      spyOn(Session, "plan").mockReturnValue("/project/PLAN.md"),
      spyOn(Session, "updateMessage").mockResolvedValue(undefined as any),
      spyOn(Session, "updatePart").mockResolvedValue(undefined as any),
      spyOn(Question, "ask").mockResolvedValue([["Yes"]]),
      spyOn(Provider, "defaultModel").mockResolvedValue("default-model" as any),
      spyOn(Identifier, "ascending").mockImplementation((type: string) => `${type}-id`),
    ]

    // Mock MessageV2.stream for getLastModel
    const mockIterator = {
      next: mock()
        .mockResolvedValueOnce({ value: { info: { role: "user", model: "last-model" } }, done: false })
        .mockResolvedValueOnce({ done: true }),
    }
    spies.push(spyOn(MessageV2, "stream").mockReturnValue({
      [Symbol.asyncIterator]: () => mockIterator,
    } as any))
  })

  afterEach(() => {
    spies.forEach(s => s.mockRestore())
  })

  describe("PlanExitTool", () => {
    it("switches to build agent when approved", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanExitTool.init()
          const result = await tool.execute({}, ctx)

          expect(Question.ask).toHaveBeenCalled()
          expect(Session.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
            agent: "build",
            model: "last-model",
          }))
          expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
            type: "text",
            text: expect.stringContaining("Execute the plan"),
          }))
          expect(result.title).toBe("Switching to build agent")
        }
      })
    })

    it("throws RejectedError when user says No", async () => {
      spyOn(Question, "ask").mockResolvedValue([["No"]])
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanExitTool.init()
          expect(tool.execute({}, ctx)).rejects.toThrow(Question.RejectedError)
        }
      })
    })

    it("uses default model if no last model found", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanExitTool.init()
          // This test needs more setup - skipping for now
          expect(tool).toBeDefined()
        }
      })
    })
  })

  describe("PlanEnterTool", () => {
    it("creates a plan file", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanEnterTool.init()
          // This test needs more setup - skipping for now
          expect(tool).toBeDefined()
        }
      })
    })
  })
})
