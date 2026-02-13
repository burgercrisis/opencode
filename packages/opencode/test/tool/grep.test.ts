import { describe, expect, test, mock, vi, afterEach, beforeEach } from "bun:test"
import { GrepTool } from "../../src/tool/grep"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"
import * as fs from "fs/promises"
import * as path from "path"

describe("GrepTool", () => {
  let mocks: {
    ripgrepFilepath: any
    bunSpawn: any
  }

  beforeEach(() => {
    mocks = {
      ripgrepFilepath: vi.spyOn(Ripgrep, "filepath").mockResolvedValue("rg"),
      bunSpawn: vi.spyOn(Bun, "spawn"),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn(),
  }

  function mockSpawn(stdout: string, exitCode = 0) {
    return (args: string[]) => {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(stdout))
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
        exited: Promise.resolve(exitCode),
        kill: () => {},
      }
    }
  }

  test("greps files and sorts by modification time", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file1 = path.join(tmp.path, "file1.txt")
        const file2 = path.join(tmp.path, "file2.txt")
        
        await fs.writeFile(file1, "target match 1")
        await new Promise(r => setTimeout(r, 100))
        await fs.writeFile(file2, "target match 2")

        const rgOutput = `${file1}|1|target match 1\n${file2}|1|target match 2\n`
        mocks.bunSpawn.mockImplementation(mockSpawn(rgOutput))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "target" }, ctx)

        expect(result.output).toContain("Found 2 matches")
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
        // Return done: true immediately for an empty result
        mocks.bunSpawn.mockImplementation(() => ({
          stdout: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true, value: undefined })
            })
          },
          stderr: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true, value: undefined })
            })
          },
          exited: Promise.resolve(0),
          kill: () => {}
        } as any))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No matches found")
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
        const rgOutput = `${file}|1|${longLine}\n`
        mocks.bunSpawn.mockImplementation(mockSpawn(rgOutput))

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
        mocks.bunSpawn.mockImplementation(mockSpawn(""))

        const tool = await GrepTool.init()
        await tool.execute({ pattern: "foo", include: "*.ts" }, ctx)

        const calls = mocks.bunSpawn.mock.calls
        const lastCallArgs = calls[calls.length - 1][0] as string[]
        expect(lastCallArgs).toContain("--glob")
        expect(lastCallArgs).toContain("*.ts")
      },
    })
  })

  test("handles no matches", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.bunSpawn.mockImplementation(mockSpawn("", 1))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "nothing" }, ctx)

        expect(result.output).toBe("No matches found")
      },
    })
  })

  test("handles malformed output lines", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const rgOutput = "malformed-line\nfile.txt|1|good-match\n"
        mocks.bunSpawn.mockImplementation(mockSpawn(rgOutput))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "foo" }, ctx)

        expect(result.output).toContain("Found 1 matches")
        expect(result.output).toContain("good-match")
      },
    })
  })

  test("truncates results at MATCH_LIMIT", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // MATCH_LIMIT is 250. Create 251 matches.
        const matches = Array.from({ length: 251 }, (_, i) => `file.txt|${i + 1}|match ${i + 1}`).join("\n")
        const killSpy = vi.fn()
        mocks.bunSpawn.mockImplementation(() => ({
          stdout: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(matches))
              controller.close()
            },
          }),
          stderr: new ReadableStream({ start(c) { c.close() } }),
          exited: Promise.resolve(0),
          kill: killSpy,
        } as any))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "match" }, ctx)

        expect(result.metadata.matches).toBe(250)
        expect(result.metadata.truncated).toBe(true)
        expect(killSpy).toHaveBeenCalled()
      },
    })
  })

  test("truncates long lines", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "long.txt")
        await fs.writeFile(file, "match")
        const longLine = "A".repeat(3000)
        mocks.bunSpawn.mockImplementation(mockSpawn(`${file}|1|${longLine}`))

        const tool = await GrepTool.init()
        const result = await tool.execute({ pattern: "A" }, ctx)

        expect(result.output).toContain("A".repeat(2000) + "...")
      },
    })
  })
})
