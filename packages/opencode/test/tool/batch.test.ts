import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { BatchTool } from "../../src/tool/batch"
import { ToolRegistry } from "../../src/tool/registry"
import { Session } from "../../src/session"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("BatchTool", () => {
  const ctx = {
    messageID: "msg-1",
    sessionID: "sess-1",
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    vi.spyOn(Session, "updatePart").mockResolvedValue(undefined as any)
    vi.spyOn(Identifier, "ascending").mockReturnValue("test-id")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("executes tool calls in parallel", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockTool = {
          id: "test-tool",
          parameters: {
            parse: (p: any) => p,
          },
          execute: vi.fn(async () => ({ title: "Result", output: "Success" })),
        }

        vi.spyOn(ToolRegistry, "tools").mockResolvedValue([mockTool as any])

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "test-tool", parameters: { foo: "bar" } },
            { tool: "test-tool", parameters: { baz: "qux" } },
          ]
        }, ctx as any)

        expect(result.output).toContain("All 2 tools executed successfully")
        expect(mockTool.execute).toHaveBeenCalledTimes(2)
        expect(Session.updatePart).toHaveBeenCalled()
      }
    })
  })

  it("handles disallowed tools", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "batch", parameters: {} }
          ]
        }, ctx as any)

        expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
        expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
          state: expect.objectContaining({
            status: "error",
            error: expect.stringContaining("not allowed in batch")
          })
        }))
      }
    })
  })

  it("handles missing tools", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(ToolRegistry, "tools").mockResolvedValue([])

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "unknown-tool", parameters: {} }
          ]
        }, ctx as any)

        expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
        expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
          state: expect.objectContaining({
            status: "error",
            error: expect.stringContaining("not in registry")
          })
        }))
      }
    })
  })

  it("handles tool limit", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockTool = {
          id: "test-tool",
          parameters: {
            parse: (p: any) => p,
          },
          execute: vi.fn(async () => ({ title: "Result", output: "Success" })),
        }
        vi.spyOn(ToolRegistry, "tools").mockResolvedValue([mockTool as any])

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: Array(26).fill({ tool: "test-tool", parameters: {} })
        }, ctx as any)

        expect(result.output).toContain("Executed 25/26 tools successfully. 1 failed.")
        expect(mockTool.execute).toHaveBeenCalledTimes(25)
      }
    })
  })

  it("formats validation errors", async () => {
    const tool = await BatchTool.init()
    const error = {
      issues: [
        { path: ["tool_calls", 0, "tool"], message: "Required" },
        { path: [], message: "Invalid" }
      ]
    }
    const formatted = tool.formatValidationError!(error as any)
    expect(formatted).toContain("Invalid parameters for tool 'batch'")
    expect(formatted).toContain("tool_calls.0.tool: Required")
    expect(formatted).toContain("root: Invalid")
  })

  it("handles tool execution errors", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockTool = {
          id: "fail-tool",
          parameters: {
            parse: (p: any) => p,
          },
          execute: vi.fn(async () => { throw new Error("execution failed") }),
        }
        vi.spyOn(ToolRegistry, "tools").mockResolvedValue([mockTool as any])

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [{ tool: "fail-tool", parameters: {} }]
        }, ctx as any)

        expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
        expect(Session.updatePart).toHaveBeenCalledWith(expect.objectContaining({
          state: expect.objectContaining({
            status: "error",
            error: "execution failed"
          })
        }))
      }
    })
  })
})
