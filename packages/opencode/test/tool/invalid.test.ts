import { InvalidTool } from "../../src/tool/invalid"
import { it, expect, describe } from "bun:test"

describe("InvalidTool", () => {
  it("returns error message in output", async () => {
    const tool = await InvalidTool.init({})
    const result = await tool.execute({ tool: "grep", error: "missing pattern" }, {} as any)
    expect(result.output).toContain("missing pattern")
    expect(result.title).toBe("Invalid Tool")
  })
})