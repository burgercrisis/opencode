import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { MultiEditTool } from "../multiedit"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("MultiEdit Multiple Matches Handling", () => {
  let tmp: any

  beforeEach(async () => {
    tmp = { path: await mkdtemp(path.join(os.tmpdir(), "opencode-test-")) }
  })

  afterEach(async () => {
    if (tmp?.path) {
      await rm(tmp.path, { recursive: true, force: true })
    }
  })

  it("should handle occurrence selection in multiedit", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "foo",
          newString: "qux",
          occurrence: 2 // Replace second occurrence only
        }
      ]
    }, {} as any)

    expect(result.output).toContain("Successfully applied 1 edit(s)")
    expect(result.metadata.appliedEdits).toBe(1)
    expect(result.metadata.failedEdits).toBe(0)

    const content = await Bun.file(filePath).text()
    expect(content).toBe("foo\nbar\nqux\nbaz\nfoo")
  })

  it("should handle multiple edits with occurrence selection", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo\nbar\nfoo")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "foo",
          newString: "qux",
          occurrence: 2 // Replace second foo
        },
        {
          oldString: "bar",
          newString: "quux",
          occurrence: 2 // Replace second bar
        }
      ]
    }, {} as any)

    expect(result.output).toContain("Successfully applied 2 edit(s)")
    expect(result.metadata.appliedEdits).toBe(2)
    expect(result.metadata.failedEdits).toBe(0)

    const content = await Bun.file(filePath).text()
    expect(content).toBe("foo\nbar\nqux\nbaz\nfoo\nquux\nfoo")
  })

  it("should handle mixed success and failure in multiedit", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "foo",
          newString: "qux",
          occurrence: 2 // Valid
        },
        {
          oldString: "nonexistent",
          newString: "something",
          occurrence: 1 // Will fail
        }
      ]
    }, {} as any)

    expect(result.output).toContain("Successfully applied 1 edit(s) (1 failed)")
    expect(result.metadata.appliedEdits).toBe(1)
    expect(result.metadata.failedEdits).toBe(1)
  })

  it("should validate occurrence parameter in multiedit", async () => {
    const tool = await MultiEditTool.init()

    await expect(tool.execute({
      filePath: "/tmp/test.txt",
      edits: [
        {
          oldString: "foo",
          newString: "bar",
          occurrence: 0 // Invalid
        }
      ]
    }, {} as any)).rejects.toThrow("occurrence must be a positive integer")
  })

  it("should validate confidence parameter in multiedit", async () => {
    const tool = await MultiEditTool.init()

    await expect(tool.execute({
      filePath: "/tmp/test.txt",
      edits: [
        {
          oldString: "foo",
          newString: "bar",
          confidence: 1.5 // Invalid
        }
      ]
    }, {} as any)).rejects.toThrow("confidence must be between 0 and 1")
  })

  it("should handle autoContext parameter in multiedit", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await MultiEditTool.init()

    // With autoContext disabled, should fail
    await expect(tool.execute({
      filePath,
      edits: [
        {
          oldString: "foo",
          newString: "bar",
          autoContext: false
        }
      ]
    }, {} as any)).rejects.toThrow("Found 3 matches for oldString")
  })

  it("should handle replaceAll in multiedit", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath,
      edits: [
        {
          oldString: "foo",
          newString: "qux",
          replaceAll: true
        }
      ]
    }, {} as any)

    expect(result.output).toContain("Successfully applied 1 edit(s)")
    expect(result.metadata.appliedEdits).toBe(1)

    const content = await Bun.file(filePath).text()
    expect(content).toBe("qux\nbar\nqux\nbaz\nqux")
  })

  it("should handle empty edits array", async () => {
    const tool = await MultiEditTool.init()
    const result = await tool.execute({
      filePath: "/tmp/test.txt",
      edits: []
    }, {} as any)

    expect(result.output).toBe("No edits to apply")
    expect(result.metadata.editCount).toBe(0)
  })
})
