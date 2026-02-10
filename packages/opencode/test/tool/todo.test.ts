import { describe, it, expect, mock, beforeEach } from "bun:test"
import { TodoWriteTool, TodoReadTool } from "../../src/tool/todo"
import { Todo } from "../../src/session/todo"

mock.module("../../src/session/todo", () => ({
  Todo: {
    update: mock(async () => {}),
    get: mock(async () => []),
  }
}))

describe("TodoTools", () => {
  const ctx = {
    sessionID: "test-session",
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mock.restore()
    ctx.ask = mock(async () => {})
    ;(Todo.update as any).mockClear()
    ;(Todo.get as any).mockClear()
  })

  describe("TodoWriteTool", () => {
    it("updates todos successfully", async () => {
      const tool = await TodoWriteTool.init()
      const todos = [
        { id: "1", content: "Task 1", status: "pending", priority: "high" },
        { id: "2", content: "Task 2", status: "completed", priority: "medium" },
      ]

      const result = await tool.execute({ todos: todos as any }, ctx as any)

      expect(Todo.update).toHaveBeenCalledWith({
        sessionID: ctx.sessionID,
        todos: todos,
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
      ;(Todo.get as any).mockResolvedValue(todos)

      const result = await tool.execute({}, ctx as any)

      expect(Todo.get).toHaveBeenCalledWith(ctx.sessionID)
      expect(result.title).toBe("1 todos")
      expect(result.metadata.todos).toEqual(todos)
      expect(ctx.ask).toHaveBeenCalled()
    })
  })
})
