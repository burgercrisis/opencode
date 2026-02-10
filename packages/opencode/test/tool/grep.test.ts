import { describe, expect, test, mock } from "bun:test"
import { GrepTool } from "../../src/tool/grep"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"
import * as fs from "fs/promises"
import * as path from "path"

mock.module("../../src/file/ripgrep", () => ({
  Ripgrep: {
    filepath: mock(() => Promise.resolve("rg")),
  },
}))

const originalSpawn = Bun.spawn

describe("GrepTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }

  function mockSpawn(stdout: string, exitCode = 0) {
    return mock((args: string[]) => {
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
    }) as any
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
        globalThis.Bun.spawn = mockSpawn(rgOutput)

        try {
          const tool = await GrepTool.init()
          const result = await tool.execute({ pattern: "target" }, ctx)

          expect(result.output).toContain("Found 2 matches")
          const lines = result.output.split("\n")
          const file2Index = lines.findIndex(l => l.includes("file2.txt"))
          const file1Index = lines.findIndex(l => l.includes("file1.txt"))
          expect(file2Index).toBeLessThan(file1Index)
        } finally {
          globalThis.Bun.spawn = originalSpawn
        }
      },
    })
  })

  test("handles match limit and truncation", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "match")

        const manyMatches = Array.from({ length: 300 }, (_, i) => `${file}|${i}|match ${i}`).join("\n")
        globalThis.Bun.spawn = mockSpawn(manyMatches)

        try {
          const tool = await GrepTool.init()
          const result = await tool.execute({ pattern: "match" }, ctx)

          expect(result.metadata.matches).toBe(250)
          expect(result.metadata.truncated).toBe(true)
          expect(result.output).toContain("Results are truncated")
        } finally {
          globalThis.Bun.spawn = originalSpawn
        }
      },
    })
  })

  test("handles no matches", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        globalThis.Bun.spawn = mockSpawn("", 1)

        try {
          const tool = await GrepTool.init()
          const result = await tool.execute({ pattern: "nothing" }, ctx)

          expect(result.output).toBe("No files found")
        } finally {
          globalThis.Bun.spawn = originalSpawn
        }
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
        globalThis.Bun.spawn = mockSpawn(`${file}|1|${longLine}`)

        try {
          const tool = await GrepTool.init()
          const result = await tool.execute({ pattern: "A" }, ctx)

          expect(result.output).toContain("A".repeat(2000) + "...")
        } finally {
          globalThis.Bun.spawn = originalSpawn
        }
      },
    })
  })
})
