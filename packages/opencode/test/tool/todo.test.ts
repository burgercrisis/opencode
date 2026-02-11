import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test"
import { TodoWriteTool, TodoReadTool } from "../../src/tool/todo"
import { Todo } from "../../src/session/todo"

describe("TodoTools", () => {
  let mocks: {
    todoUpdate: any
    todoGet: any
  }

  const ctx = {
    sessionID: "test-session",
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mocks = {
      todoUpdate: vi.spyOn(Todo, "update").mockResolvedValue(undefined),
      todoGet: vi.spyOn(Todo, "get").mockResolvedValue([]),
    }
    ctx.ask = mock(async () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("TodoWriteTool", () => {
    it("updates todos successfully", async () => {
      const tool = await TodoWriteTool.init()
      const todos = [
        { id: "1", content: "Task 1", status: "pending", priority: "high" },
        { id: "2", content: "Task 2", status: "completed", priority: "medium" },
      ]

      const result = await tool.execute({ todos: todos as any }, ctx as any)

      expect(mocks.todoUpdate).toHaveBeenCalledWith({
        sessionID: ctx.sessionID,
        todos: todos as any,
      })
      expect(result.title).toBe("1 todos")
      expect(result.metadata.todos).toEqual(todos)
      expect(ctx.ask).toHaveBeenCalled()
    })
  })

  describe("TodoReadTool", () => {
    it("reads todos successfully", async () => {
      const tool = await TodoReadTool.init()
      const todos = [
        { id: "1", content: "Task 1", status: "pending", priority: "high" },
      ]
      mocks.todoGet.mockResolvedValue(todos as any)

      const result = await tool.execute({}, ctx as any)

      expect(mocks.todoGet).toHaveBeenCalledWith(ctx.sessionID)
      expect(result.title).toBe("1 todos")
      expect(result.metadata.todos).toEqual(todos)
      expect(ctx.ask).toHaveBeenCalled()
    })
  })
})
