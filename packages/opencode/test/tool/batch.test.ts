import { expect, it, describe, spyOn, beforeEach, afterEach } from "bun:test"
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

  let updatePartSpy: ReturnType<typeof spyOn>
  let ascendingSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    updatePartSpy = spyOn(Session, "updatePart").mockResolvedValue(undefined as any)
    ascendingSpy = spyOn(Identifier, "ascending").mockReturnValue("test-id")
  })

  afterEach(() => {
    updatePartSpy.mockRestore()
    ascendingSpy.mockRestore()
  })

  it("executes tool calls in parallel", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockExecute = async () => ({ title: "Result", output: "Success", metadata: {} })
        
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
        
        expect(result.output).toContain("Result")
      },
    })
  })
})
