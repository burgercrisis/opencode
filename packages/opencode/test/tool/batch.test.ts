import { expect, it, describe, vi, beforeEach, afterEach } from "bun:test"
import { BatchTool } from "../../src/tool/batch"
import { ToolRegistry } from "../../src/tool/registry"
import { Session } from "../../src/session"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import z from "zod"

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
        const mockExecute = vi.fn(async () => ({ title: "Result", output: "Success", metadata: {} }))
        
        // Register a mock tool
        await ToolRegistry.register({
          id: "test-tool",
          init: async () => ({
            description: "Test tool",
            parameters: z.object({}).loose(),
            execute: mockExecute,
          }),
        })

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "test-tool", parameters: { foo: "bar" } },
            { tool: "test-tool", parameters: { baz: "qux" } },
          ]
        }, ctx as any)

        expect(result.output).toContain("All 2 tools executed successfully")
        expect(mockExecute).toHaveBeenCalledTimes(2)
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
        expect(Session.updatePart).toHaveBeenCalledWith(
          expect.objectContaining({
            tool: "batch",
            state: expect.objectContaining({
              status: "error",
              error: expect.stringContaining("not allowed in batch"),
            }),
          })
        )
      }
    })
  })

  it("handles missing tools", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "unknown-tool", parameters: {} }
          ]
        }, ctx as any)

        expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
        expect(Session.updatePart).toHaveBeenCalledWith(
          expect.objectContaining({
            tool: "unknown-tool",
            state: expect.objectContaining({
              status: "error",
              error: expect.stringContaining("not in registry"),
            }),
          })
        )
      }
    })
  })

  it("handles tool limit", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockExecute = vi.fn(async () => ({ title: "Result", output: "Success", metadata: {} }))
        
        await ToolRegistry.register({
          id: "limit-test-tool",
          init: async () => ({
            description: "Test tool for limit",
            parameters: z.object({}).loose(),
            execute: mockExecute,
          }),
        })

        const tool = await BatchTool.init()

        // Test that exactly 25 tools work fine
        const result = await tool.execute({
          tool_calls: Array(25).fill({ tool: "limit-test-tool", parameters: {} })
        }, ctx as any)

        expect(result.output).toContain("tools executed successfully")
        expect(mockExecute).toHaveBeenCalledTimes(25)
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
        await ToolRegistry.register({
          id: "fail-tool",
          init: async () => ({
            description: "Failing tool",
            parameters: z.object({}).loose(),
            execute: vi.fn(async () => { throw new Error("execution failed") }),
          }),
        })

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [{ tool: "fail-tool", parameters: {} }]
        }, ctx as any)

        expect(result.output).toContain("Executed 0/1 tools successfully. 1 failed.")
        expect(Session.updatePart).toHaveBeenCalledWith(
          expect.objectContaining({
            tool: "fail-tool",
            state: expect.objectContaining({
              status: "error",
              error: "execution failed",
            }),
          })
        )
      }
    })
  })
})
