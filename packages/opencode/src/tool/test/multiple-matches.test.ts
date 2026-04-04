import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { EditTool, replace } from "../edit"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("Multiple Matches Handling", () => {
  let tmp: any

  beforeEach(async () => {
    tmp = { path: await mkdtemp(path.join(os.tmpdir(), "opencode-test-")) }
  })

  afterEach(async () => {
    if (tmp?.path) {
      await rm(tmp.path, { recursive: true, force: true })
    }
  })

  it("should handle occurrence selection correctly", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await EditTool.init()
    const result = await tool.execute({
      filePath,
      oldString: "foo",
      newString: "qux",
      occurrence: 2 // Replace second occurrence
    }, {} as any)

    expect(result.output).toContain("Edit applied successfully")
    const content = await Bun.file(filePath).text()
    expect(content).toBe("foo\nbar\nqux\nbaz\nfoo")
  })

  it("should throw error when occurrence is out of range", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo")

    const tool = await EditTool.init()

    await expect(tool.execute({
      filePath,
      oldString: "foo",
      newString: "bar",
      occurrence: 5 // Out of range
    }, {} as any)).rejects.toThrow("occurrence 5 is out of range. Found 2 matches.")
  })

  it("should provide enhanced error message with match information", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await EditTool.init()

    try {
      await tool.execute({
        filePath,
        oldString: "foo",
        newString: "bar"
      }, {} as any)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toContain("Found 3 matches for oldString")
      expect(e.message).toContain("Match 1 (line 1)")
      expect(e.message).toContain("Match 2 (line 3)")
      expect(e.message).toContain("Match 3 (line 5)")
      expect(e.message).toContain("Use occurrence: N to specify which match to replace")
    }
  })

  it("should handle replaceAll with multiple matches", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await EditTool.init()
    const result = await tool.execute({
      filePath,
      oldString: "foo",
      newString: "qux",
      replaceAll: true
    }, {} as any)

    expect(result.output).toContain("Edit applied successfully")
    const content = await Bun.file(filePath).text()
    expect(content).toBe("qux\nbar\nqux\nbaz\nqux")
  })

  it("should validate occurrence parameter", async () => {
    const tool = await EditTool.init()

    await expect(tool.execute({
      filePath: "/tmp/test.txt",
      oldString: "foo",
      newString: "bar",
      occurrence: 0 // Invalid
    }, {} as any)).rejects.toThrow("occurrence must be a positive integer")
  })

  it("should validate confidence parameter", async () => {
    const tool = await EditTool.init()

    await expect(tool.execute({
      filePath: "/tmp/test.txt",
      oldString: "foo",
      newString: "bar",
      confidence: 1.5 // Invalid
    }, {} as any)).rejects.toThrow("confidence must be between 0 and 1")
  })

  it("should handle autoContext parameter", async () => {
    const filePath = `${tmp.path}/test.txt`
    await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

    const tool = await EditTool.init()

    // With autoContext disabled, should throw enhanced error
    await expect(tool.execute({
      filePath,
      oldString: "foo",
      newString: "bar",
      autoContext: false
    }, {} as any)).rejects.toThrow("Found 3 matches for oldString")
  })
})

describe("Replace Function with Options", () => {
  it("should handle occurrence selection in replace function", () => {
    const content = "foo\nbar\nfoo\nbaz\nfoo"
    const result = replace(content, "foo", "qux", false, { occurrence: 2 })
    expect(result).toBe("foo\nbar\nqux\nbaz\nfoo")
  })

  it("should handle replaceAll with options", () => {
    const content = "foo\nbar\nfoo\nbaz\nfoo"
    const result = replace(content, "foo", "qux", true, { confidence: 0.9 })
    expect(result).toBe("qux\nbar\nqux\nbaz\nqux")
  })

  it("should handle single match without options", () => {
    const content = "foo\nbar\nbaz"
    const result = replace(content, "bar", "qux", false)
    expect(result).toBe("foo\nqux\nbaz")
  })

  it("should throw enhanced error for multiple matches", () => {
    const content = "foo\nbar\nfoo\nbaz\nfoo"

    try {
      replace(content, "foo", "qux", false)
      throw new Error("Should have thrown")
    } catch (e: any) {
      expect(e.message).toContain("Found 3 matches for oldString")
      expect(e.message).toContain("Suggested solutions:")
    }
  })
})
