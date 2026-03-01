import { describe, test, expect, mock, beforeEach } from "bun:test"
import { QuestionTool } from "../question"

describe("QuestionTool", () => {
  beforeEach(() => {
    mock.restore()
  })

  test("should define tool with correct id", () => {
    expect(QuestionTool.id).toBe("question")
  })

  test("should have description", async () => {
    const init = await QuestionTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await QuestionTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should require questions parameter", async () => {
    const init = await QuestionTool.init()
    const parsed = init.parameters.safeParse({})
    expect(parsed.success).toBe(false)
  })

  test("should accept valid questions parameter", async () => {
    const init = await QuestionTool.init()
    const parsed = init.parameters.safeParse({
      questions: [
        {
          question: "What is your name?",
          header: "Name",
          options: [
            { label: "Alice", description: "The first option" },
            { label: "Bob", description: "The second option" },
          ],
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })
})
