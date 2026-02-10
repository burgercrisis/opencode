import { expect, it, describe, mock, beforeEach } from "bun:test"
import { PlanExitTool, PlanEnterTool } from "../../src/tool/plan"
import { Session } from "../../src/session"
import { Question } from "../../src/question"
import { MessageV2 } from "../../src/session/message-v2"
import { Provider } from "../../src/provider/provider"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"

// Mock dependencies
mock.module("../../src/session", () => ({
  Session: {
    get: mock(),
    plan: mock(() => "/project/PLAN.md"),
    updateMessage: mock(),
    updatePart: mock(),
  },
}))

mock.module("../../src/question", () => ({
  Question: {
    ask: mock(),
    RejectedError: class extends Error {
      constructor() {
        super("Question rejected")
        this.name = "QuestionRejectedError"
      }
    },
  },
}))

mock.module("../../src/session/message-v2", () => ({
  MessageV2: {
    stream: mock(),
  },
}))

mock.module("../../src/provider/provider", () => ({
  Provider: {
    defaultModel: mock(() => "default-model"),
  },
}))

mock.module("../../src/project/instance", () => ({
  Instance: {
    worktree: "/project",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined),
  },
}))

mock.module("../../src/id/id", () => ({
  Identifier: {
    ascending: mock((type: string) => `${type}-id`),
  },
}))

describe("Plan Tools", () => {
  const ctx: any = {
    sessionID: "session-123",
    messageID: "msg-123",
    callID: "call-123",
    metadata: mock(),
  }

  beforeEach(() => {
    mock.restore()
    ;(Session.get as any).mockResolvedValue({ id: "session-123" })
    ;(Question.ask as any).mockResolvedValue([["Yes"]])
    
    // Mock MessageV2.stream for getLastModel
    const mockIterator = {
      next: mock()
        .mockResolvedValueOnce({ value: { info: { role: "user", model: "last-model" } }, done: false })
        .mockResolvedValueOnce({ done: true }),
    }
    ;(MessageV2.stream as any).mockReturnValue({
      [Symbol.asyncIterator]: () => mockIterator,
    })
  })

  describe("PlanExitTool", () => {
    it("switches to build agent when approved", async () => {
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
    })

    it("throws RejectedError when user says No", async () => {
      ;(Question.ask as any).mockResolvedValue([["No"]])
      const tool = await PlanExitTool.init()
      
      expect(tool.execute({}, ctx)).rejects.toThrow("Question rejected")
    })

    it("uses default model if no last model found", async () => {
      const mockIterator = {
        next: mock().mockResolvedValue({ done: true }),
      }
      ;(MessageV2.stream as any).mockReturnValue({
        [Symbol.asyncIterator]: () => mockIterator,
      })

      const tool = await PlanExitTool.init()
      await tool.execute({}, ctx)

      expect(Session.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
        model: "default-model",
      }))
    })
  })

  describe("PlanEnterTool", () => {
    it("switches to plan agent when approved", async () => {
      const tool = await PlanEnterTool.init()
      const result = await tool.execute({}, ctx)

      expect(Question.ask).toHaveBeenCalled()
      expect(Session.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
        agent: "plan",
        model: "last-model",
      }))
      expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
        type: "text",
        text: expect.stringContaining("requested to enter plan mode"),
      }))
      expect(result.title).toBe("Switching to plan agent")
    })

    it("throws RejectedError when user says No", async () => {
      ;(Question.ask as any).mockResolvedValue([["No"]])
      const tool = await PlanEnterTool.init()
      
      expect(tool.execute({}, ctx)).rejects.toThrow("Question rejected")
    })
  })
})
