import { describe, expect, test, mock, vi, afterEach, beforeEach } from "bun:test"
import { GrepTool } from "../../src/tool/grep"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as fs from "fs/promises"
import * as path from "path"

describe("GrepTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn(),
  }

  test("greps files and sorts by modification time", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file1 = path.join(tmp.path, "file1.txt")
        const file2 = path.join(tmp.path, "file2.txt")
        
        // Create files with actual content
        await fs.writeFile(file1, "target match 1")
        await new Promise(r => setTimeout(r, 100))
        await fs.writeFile(file2, "target match 2")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "target" }, ctx)

        expect(result.output).toContain("Found 2 matches")
        // file2 was modified last, should appear first
        const lines = result.output.split("\n")
        const file2Index = lines.findIndex(l => l.includes("file2.txt"))
        const file1Index = lines.findIndex(l => l.includes("file1.txt"))
        expect(file2Index).toBeLessThan(file1Index)
      },
    })
  })

  test("handles empty results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a file without the search pattern
        await fs.writeFile(path.join(tmp.path, "file.txt"), "no match here")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No files found")
        expect(result.metadata.matches).toBe(0)
      },
    })
  })

  test("handles long lines in results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "long.txt")
        const longLine = "a".repeat(3000)
        await fs.writeFile(file, longLine)

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "a" }, ctx)

        expect(result.output).toContain("a".repeat(2000) + "...")
        expect(result.output).not.toContain("a".repeat(2001))
      },
    })
  })

  test("passes include pattern to ripgrep", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create files with different extensions
        await fs.writeFile(path.join(tmp.path, "file.ts"), "foo content")
        await fs.writeFile(path.join(tmp.path, "file.js"), "foo content")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo", include: "*.ts" }, ctx)

        // Should only find the .ts file
        expect(result.output).toContain("file.ts")
        expect(result.output).not.toContain("file.js")
      },
    })
  })

  test("handles no matches", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "some content")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No files found")
      },
    })
  })

  test("searches with regex pattern", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "foo123 bar456 baz")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo\\d+" }, ctx)

        expect(result.output).toContain("Found 1 matches")
        expect(result.output).toContain("foo123")
      },
    })
  })

  test("finds multiple matches in same file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.txt"), "foo line1\nbar line2\nfoo line3")

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo" }, ctx)

        expect(result.output).toContain("Found 2 matches")
        expect(result.output).toContain("foo line1")
        expect(result.output).toContain("foo line3")
      },
    })
  })

  test("truncates long lines", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "long.txt")
        const longLine = "A".repeat(3000)
        await fs.writeFile(file, longLine)

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "A" }, ctx)

        expect(result.output).toContain("A".repeat(2000) + "...")
      },
    })
  })
})
