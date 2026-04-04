import { describe, test, expect, mock, beforeEach } from "bun:test"
import { TodoWriteTool, TodoReadTool } from "../todo"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"

describe("TodoWriteTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mock.restore()
  })

  test("should define tool with correct id", () => {
    expect(TodoWriteTool.id).toBe("todowrite")
  })

  test("should have description", async () => {
    const init = await TodoWriteTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await TodoWriteTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should require todos parameter", async () => {
    const init = await TodoWriteTool.init()
    const parsed = init.parameters.safeParse({})
    expect(parsed.success).toBe(false)
  })

  test("should accept valid todos parameter", async () => {
    const init = await TodoWriteTool.init()
    const parsed = init.parameters.safeParse({
      todos: [
        {
          content: "Test task",
          status: "pending",
          priority: "high",
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  test("should request permission and call ask", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TodoReadTool.init()
        
        await init.execute({}, mockCtx)

        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })
})

describe("TodoReadTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mock.restore()
  })

  test("should define tool with correct id", () => {
    expect(TodoReadTool.id).toBe("todoread")
  })

  test("should have description", async () => {
    const init = await TodoReadTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await TodoReadTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should accept empty parameters", async () => {
    const init = await TodoReadTool.init()
    const parsed = init.parameters.safeParse({})
    expect(parsed.success).toBe(true)
  })

  test("should request permission and call ask", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TodoReadTool.init()
        
        await init.execute({}, mockCtx)

        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })

  test("should return empty todos when none exist", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await TodoReadTool.init()
        
        const result = await init.execute({}, mockCtx)

        expect(result.title).toBe("0 todos")
        expect(result.metadata.todos).toEqual([])
      },
    })
  })
})
