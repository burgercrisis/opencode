import { expect, it, describe, mock, spyOn } from "bun:test"
import { BatchTool } from "../../src/tool/batch"
import { ToolRegistry } from "../../src/tool/registry"
import { Session } from "../../src/session"
import { Identifier } from "../../src/id/id"

// Mock the modules that BatchTool imports dynamically
mock.module("../../src/session", () => ({
  Session: {
    updatePart: mock(() => Promise.resolve()),
  },
}))

mock.module("../../src/id/id", () => ({
  Identifier: {
    ascending: mock(() => "test-id"),
  },
}))

mock.module("../../src/tool/registry", () => ({
  ToolRegistry: {
    tools: mock(() => Promise.resolve([])),
  },
}))

describe("BatchTool", () => {
  const ctx = {
    messageID: "msg-1",
    sessionID: "sess-1",
    abort: new AbortController().signal,
  }

  it("executes tool calls in parallel", async () => {
    const mockTool = {
      id: "test-tool",
      parameters: {
        parse: (p: any) => p,
      },
      execute: mock(() => Promise.resolve({ title: "Result", output: "Success" })),
    }

    // @ts-ignore
    ToolRegistry.tools.mockResolvedValue([mockTool])

    const tool = await BatchTool.init()
    const result = await tool.execute({
      tool_calls: [
        { tool: "test-tool", parameters: { foo: "bar" } },
        { tool: "test-tool", parameters: { baz: "qux" } },
      ]
    }, ctx as any)

    expect(result.output).toContain("All 2 tools executed successfully")
    expect(mockTool.execute).toHaveBeenCalledTimes(2)
    // @ts-ignore
    expect(Session.updatePart).toHaveBeenCalled()
  })

  it("handles disallowed tools", async () => {
    const tool = await BatchTool.init()
    const result = await tool.execute({
      tool_calls: [
        { tool: "batch", parameters: {} }
      ]
    }, ctx as any)

    expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
    // @ts-ignore
    expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        status: "error",
        error: expect.stringContaining("not allowed in batch")
      })
    }))
  })

  it("handles missing tools", async () => {
    // @ts-ignore
    ToolRegistry.tools.mockResolvedValue([])

    const tool = await BatchTool.init()
    const result = await tool.execute({
      tool_calls: [
        { tool: "unknown-tool", parameters: {} }
      ]
    }, ctx as any)

    expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
    // @ts-ignore
    expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        status: "error",
        error: expect.stringContaining("not in registry")
      })
    }))
  })

  it("handles tool limit", async () => {
    const mockTool = {
      id: "test-tool",
      parameters: {
        parse: (p: any) => p,
      },
      execute: mock(() => Promise.resolve({ title: "Result", output: "Success" })),
    }
    // @ts-ignore
    ToolRegistry.tools.mockResolvedValue([mockTool])

    const tool = await BatchTool.init()
    const tool_calls = Array(30).fill({ tool: "test-tool", parameters: {} })
    const result = await tool.execute({ tool_calls }, ctx as any)

    expect(result.metadata.totalCalls).toBe(30)
    expect(result.metadata.successful).toBe(25)
    expect(result.metadata.failed).toBe(5)
    expect(result.output).toContain("Executed 25/30 tools successfully. 5 failed.")
  })

  it("formats validation errors", async () => {
    const tool = await BatchTool.init()
    const error = {
      issues: [
        { path: ["tool_calls", 0, "tool"], message: "Required" }
      ]
    }
    const formatted = (tool as any).formatValidationError(error)
    expect(formatted).toContain("Invalid parameters for tool 'batch'")
    expect(formatted).toContain("tool_calls.0.tool: Required")
  })
})
