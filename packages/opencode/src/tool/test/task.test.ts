import { describe, test, expect, mock } from "bun:test"
import { TaskTool } from "../task"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"

describe("TaskTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should define tool with correct id", () => {
    expect(TaskTool.id).toBe("task")
  })

  test("should have description", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        expect(init.description).toBeDefined()
        expect(init.description.length).toBeGreaterThan(0)
      },
    })
  })

  test("should have parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        expect(init.parameters).toBeDefined()
      },
    })
  })

  test("should validate parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should require description parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          prompt: "Do something",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  test("should require prompt parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          subagent_type: "general",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  test("should require subagent_type parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
        })
        
        expect(parsed.success).toBe(false)
      },
    })
  })

  test("should accept optional task_id parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
          task_id: "task-123",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should accept optional command parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TaskTool.init()
        
        const parsed = init.parameters.safeParse({
          description: "Test task",
          prompt: "Do something",
          subagent_type: "general",
          command: "npm test",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })
})