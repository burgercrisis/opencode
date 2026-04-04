import { describe, it, expect } from "bun:test"
import path from "path"
import { TodoWriteTool, TodoReadTool } from "../../src/tool/todo"
import { Todo } from "../../src/session/todo"
import { Session } from "../../src/session"
import { Instance } from "../../src/project/instance"

const projectRoot = path.join(__dirname, "../..")

describe("TodoTools", () => {
  describe("TodoWriteTool", () => {
    it("updates todos successfully", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Test Session" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          const tool = await TodoWriteTool.init()
          const todos = [
            { content: "Task 1", status: "pending", priority: "high" },
            { content: "Task 2", status: "completed", priority: "medium" },
          ]

          const result = await tool.execute({ todos: todos as any }, ctx as any)

          // Title shows only non-completed todos count
          expect(result.title).toBe("1 todos")
          expect(result.metadata.todos).toHaveLength(2)
          expect(result.metadata.todos[0].content).toBe("Task 1")
          expect(result.metadata.todos[1].content).toBe("Task 2")

          // Verify the todos were actually stored
          const stored = Todo.get(session.id)
          expect(stored).toHaveLength(2)
          expect(stored[0]!.content).toBe("Task 1")
          expect(stored[1]!.content).toBe("Task 2")

          await Session.remove(session.id)
        },
      })
    })

    it("clears todos when empty array provided", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Clear Test" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          const tool = await TodoWriteTool.init()

          // First add some todos
          Todo.update({
            sessionID: session.id,
            todos: [{ content: "Existing", status: "pending", priority: "high" }],
          })

          // Then clear them
          const result = await tool.execute({ todos: [] }, ctx as any)

          expect(result.title).toBe("0 todos")
          expect(result.metadata.todos).toHaveLength(0)

          // Verify todos were cleared
          const stored = Todo.get(session.id)
          expect(stored).toHaveLength(0)

          await Session.remove(session.id)
        },
      })
    })

    it("overwrites existing todos", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Overwrite Test" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          const tool = await TodoWriteTool.init()

          // Add initial todos
          Todo.update({
            sessionID: session.id,
            todos: [
              { content: "Old Task", status: "pending", priority: "low" },
            ],
          })

          // Overwrite with new todos
          const newTodos = [
            { content: "New Task 1", status: "in_progress", priority: "high" },
            { content: "New Task 2", status: "pending", priority: "medium" },
          ]

          const result = await tool.execute({ todos: newTodos as any }, ctx as any)

          expect(result.metadata.todos).toHaveLength(2)

          // Verify only new todos exist
          const stored = Todo.get(session.id)
          expect(stored).toHaveLength(2)
          expect(stored.every(t => t.content.startsWith("New Task"))).toBe(true)

          await Session.remove(session.id)
        },
      })
    })
  })

  describe("TodoReadTool", () => {
    it("reads todos successfully", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Read Test" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          // Setup: Add some todos directly
          Todo.update({
            sessionID: session.id,
            todos: [
              { content: "Read Task 1", status: "pending", priority: "high" },
              { content: "Read Task 2", status: "completed", priority: "low" },
            ],
          })

          const tool = await TodoReadTool.init()
          const result = await tool.execute({}, ctx as any)

          // Title shows only non-completed todos count
          expect(result.title).toBe("1 todos")
          expect(result.metadata.todos).toHaveLength(2)
          expect(result.metadata.todos[0].content).toBe("Read Task 1")
          expect(result.metadata.todos[1].content).toBe("Read Task 2")

          await Session.remove(session.id)
        },
      })
    })

    it("returns empty array when no todos exist", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Empty Test" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          const tool = await TodoReadTool.init()
          const result = await tool.execute({}, ctx as any)

          expect(result.title).toBe("0 todos")
          expect(result.metadata.todos).toHaveLength(0)

          await Session.remove(session.id)
        },
      })
    })

    it("returns todos in correct order", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "Todo Order Test" })
          const ctx = {
            sessionID: session.id,
            ask: async () => {},
          }

          // Add todos in specific order
          Todo.update({
            sessionID: session.id,
            todos: [
              { content: "First", status: "pending", priority: "high" },
              { content: "Second", status: "pending", priority: "medium" },
              { content: "Third", status: "pending", priority: "low" },
            ],
          })

          const tool = await TodoReadTool.init()
          const result = await tool.execute({}, ctx as any)

          expect(result.metadata.todos[0].content).toBe("First")
          expect(result.metadata.todos[1].content).toBe("Second")
          expect(result.metadata.todos[2].content).toBe("Third")

          await Session.remove(session.id)
        },
      })
    })
  })
})
