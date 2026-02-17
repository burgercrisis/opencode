import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { MultiEditTool } from "../multiedit"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("MultiEdit Error Handling", () => {
  let tmp: any

  beforeEach(async () => {
    tmp = { path: await mkdtemp(path.join(os.tmpdir(), "opencode-test-")) }
  })

  afterEach(async () => {
    if (tmp?.path) {
      await rm(tmp.path, { recursive: true, force: true })
    }
  })

  it("should correctly track successful and failed edits", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "Hello world\nThis is a test\nAnother line\nFinal line")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "Hello world",
          newString: "Hello universe", // This should succeed
        },
        {
          oldString: "Non-existent text",
          newString: "This will fail", // This should fail
        },
        {
          oldString: "Another line",
          newString: "Modified line", // This should succeed
        }
      ]
    }, {} as any)

    // Verify metadata reflects actual results
    expect(result.metadata.editCount).toBe(3)
    expect(result.metadata.appliedEdits).toBe(2)
    expect(result.metadata.failedEdits).toBe(1)

    // Verify individual edit results
    const results = result.metadata.results
    expect(results).toHaveLength(3)

    // First edit should succeed
    expect(results[0]).toEqual({
      index: 0,
      success: true,
      applied: true
    })

    // Second edit should fail
    expect(results[1]).toEqual({
      index: 1,
      success: false,
      applied: false,
      error: expect.stringContaining("not found")
    })

    // Third edit should succeed
    expect(results[2]).toEqual({
      index: 2,
      success: true,
      applied: true
    })

    // Verify output message
    expect(result.output).toBe("Successfully applied 2 edit(s) (1 failed)")
  })

  it("should handle no-op edits correctly", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "Hello world\nThis is a test\nAnother line\nFinal line")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "Hello world",
          newString: "Hello universe", // This should succeed
        },
        {
          oldString: "Hello universe",
          newString: "Hello universe", // This is a no-op
        }
      ]
    }, {} as any)

    // Verify metadata reflects actual results
    expect(result.metadata.editCount).toBe(2)
    expect(result.metadata.appliedEdits).toBe(1)
    expect(result.metadata.failedEdits).toBe(0)

    // Verify individual edit results
    const results = result.metadata.results
    expect(results).toHaveLength(2)

    // First edit should succeed
    expect(results[0]).toEqual({
      index: 0,
      success: true,
      applied: true
    })

    // Second edit should be a no-op
    expect(results[1]).toEqual({
      index: 1,
      success: true,
      applied: false
    })

    // Verify output message
    expect(result.output).toBe("Successfully applied 1 edit(s)")
  })

  it("should handle all edits failing", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "Hello world\nThis is a test\nAnother line\nFinal line")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "Non-existent text 1",
          newString: "This will fail 1",
        },
        {
          oldString: "Non-existent text 2",
          newString: "This will fail 2",
        }
      ]
    }, {} as any)

    // Verify metadata reflects actual results
    expect(result.metadata.editCount).toBe(2)
    expect(result.metadata.appliedEdits).toBe(0)
    expect(result.metadata.failedEdits).toBe(2)

    // Verify individual edit results
    const results = result.metadata.results
    expect(results).toHaveLength(2)

    // Both edits should fail
    expect(results[0]).toEqual({
      index: 0,
      success: false,
      applied: false,
      error: expect.stringContaining("not found")
    })

    expect(results[1]).toEqual({
      index: 1,
      success: false,
      applied: false,
      error: expect.stringContaining("not found")
    })

    // Verify output message
    expect(result.output).toBe("Successfully applied 0 edit(s) (2 failed)")
  })
})
