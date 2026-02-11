import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
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

  beforeEach(() => {
    vi.spyOn(Session, "get").mockResolvedValue({ id: "session-123" } as any)
    vi.spyOn(Session, "plan").mockReturnValue("/project/PLAN.md")
    vi.spyOn(Session, "updateMessage").mockResolvedValue(undefined)
    vi.spyOn(Session, "updatePart").mockResolvedValue(undefined)
    
    vi.spyOn(Question, "ask").mockResolvedValue([["Yes"]])
    
    vi.spyOn(Provider, "defaultModel").mockReturnValue("default-model")
    vi.spyOn(Identifier, "ascending").mockImplementation((type: string) => `${type}-id`)

    // Mock MessageV2.stream for getLastModel
    const mockIterator = {
      next: mock()
        .mockResolvedValueOnce({ value: { info: { role: "user", model: "last-model" } }, done: false })
        .mockResolvedValueOnce({ done: true }),
    }
    vi.spyOn(MessageV2, "stream").mockReturnValue({
      [Symbol.asyncIterator]: () => mockIterator,
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
      vi.spyOn(Question, "ask").mockResolvedValue([["No"]])
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
      const mockIterator = {
        next: mock().mockResolvedValue({ done: true }),
      }
      vi.spyOn(MessageV2, "stream").mockReturnValue({
        [Symbol.asyncIterator]: () => mockIterator,
      } as any)

      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanExitTool.init()
          await tool.execute({}, ctx)

          expect(Session.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
            model: "default-model",
          }))
        }
      })
    })
  })

  describe("PlanEnterTool", () => {
    it("switches to plan agent", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await PlanEnterTool.init()
          const result = await tool.execute({}, ctx)

          expect(Session.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
            agent: "plan",
            model: "last-model",
          }))
          expect(result.title).toBe("Switching to plan agent")
        }
      })
    })
  })
})
