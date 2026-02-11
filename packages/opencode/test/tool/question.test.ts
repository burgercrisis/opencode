import { describe, expect, it, mock, spyOn } from "bun:test"
import { QuestionTool } from "../../src/tool/question"
import { Question } from "../../src/question"

describe("QuestionTool", () => {
  it("has correct id and description", () => {
    expect(QuestionTool.id).toBe("question")
  })

  it("asks questions and formats output (with callID)", async () => {
    const questions = [
      { question: "Color?", header: "Color", options: [{ label: "Red", description: "Red color" }] },
      { question: "Age?", header: "Age", options: [{ label: "25", description: "25 years" }] }
    ]
    const answers = [["Red"], ["25"]]
    const askSpy = spyOn(Question, "ask").mockResolvedValue(answers as any)

    const ctx = {
      sessionID: "s1",
      messageID: "m1",
      callID: "c1",
      agent: "a1"
    } as any

    const tool = await QuestionTool.init(ctx)
    const result = await tool.execute({ questions: questions as any }, ctx)

    expect(askSpy).toHaveBeenCalledWith({
      sessionID: "s1",
      questions: questions,
      tool: { messageID: "m1", callID: "c1" }
    })

    expect(result.title).toBe("Asked 2 questions")
    expect(result.output).toContain('"Color?"="Red"')
    expect(result.output).toContain('"Age?"="25"')
    expect(result.metadata.answers).toEqual(answers)
    
    askSpy.mockRestore()
  })

  it("asks questions and formats output (without callID)", async () => {
    const questions = [{ question: "Happy?", header: "Happy", options: [{ label: "true", description: "Yes" }] }]
    const answers = [["true"]]
    const askSpy = spyOn(Question, "ask").mockResolvedValue(answers as any)

    const ctx = {
      sessionID: "s1",
      messageID: "m1",
      agent: "a1"
    } as any

    const tool = await QuestionTool.init(ctx)
    const result = await tool.execute({ questions: questions as any }, ctx)

    expect(askSpy).toHaveBeenCalledWith({
      sessionID: "s1",
      questions: questions,
      tool: undefined
    })

    expect(result.title).toBe("Asked 1 question")
    expect(result.output).toContain('"Happy?"="true"')
    
    askSpy.mockRestore()
  })

  it("handles unanswered questions", async () => {
    const questions = [{ question: "Empty?", header: "Empty", options: [] }]
    const answers = [undefined]
    const askSpy = spyOn(Question, "ask").mockResolvedValue(answers as any)

    const ctx = { sessionID: "s1", messageID: "m1", agent: "a1" } as any
    const tool = await QuestionTool.init(ctx)
    const result = await tool.execute({ questions: questions as any }, ctx)

    expect(result.output).toContain('"Empty?"="Unanswered"')
    
    askSpy.mockRestore()
  })
})
