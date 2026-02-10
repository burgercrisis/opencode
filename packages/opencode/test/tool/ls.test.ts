import { describe, expect, test, mock } from "bun:test"
import { ListTool } from "../../src/tool/ls"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"
import * as path from "path"

mock.module("../../src/file/ripgrep", () => ({
  Ripgrep: {
    files: mock(async function* () {
      yield "file1.txt"
      yield "dir1/file2.txt"
    }),
  },
}))

describe("ListTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }

  test("lists files in a directory", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        const result = await tool.execute({ path: tmp.path }, ctx)

        expect(result.output).toContain("file1.txt")
        expect(result.output).toContain("dir1/")
        expect(result.output).toContain("file2.txt")
        expect(Ripgrep.files).toHaveBeenCalled()
      },
    })
  })

  test("applies custom ignore patterns", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ListTool.init()
        await tool.execute({ ignore: ["*.log"] }, ctx)

        const calls = (Ripgrep.files as any).mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[0].glob).toContain("!*.log")
      },
    })
  })

  test("limits the number of files", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockRipgrepFiles = Ripgrep.files as any
        mockRipgrepFiles.mockImplementationOnce(async function* () {
          for (let i = 0; i < 150; i++) {
            yield `file${i}.txt`
          }
        })

        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        const lines = result.output.split("\n").filter(l => l.trim().startsWith("file"))
        expect(lines.length).toBe(100)
      },
    })
  })

  test("renders tree structure correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockRipgrepFiles = Ripgrep.files as any
        mockRipgrepFiles.mockImplementationOnce(async function* () {
          yield "a.txt"
          yield "b/c.txt"
          yield "b/d/e.txt"
        })

        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        expect(result.output.replace(/\\/g, "/")).toContain("a.txt")
        expect(result.output.replace(/\\/g, "/")).toContain("b/")
        expect(result.output.replace(/\\/g, "/")).toContain("  c.txt")
        expect(result.output.replace(/\\/g, "/")).toContain("  d/")
        expect(result.output.replace(/\\/g, "/")).toContain("    e.txt")
      },
    })
  })
})
