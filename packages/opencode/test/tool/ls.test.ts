import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { ListTool } from "../../src/tool/ls"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"
import * as path from "path"

describe("ListTool", () => {
  let mocks: {
    ripgrepFiles: any
  }

  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }

  beforeEach(() => {
    mocks = {
      ripgrepFiles: vi.spyOn(Ripgrep, "files").mockImplementation(async function* () {
        yield "file1.txt"
        yield "dir1/file2.txt"
      } as any),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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
        expect(mocks.ripgrepFiles).toHaveBeenCalled()
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

        const calls = mocks.ripgrepFiles.mock.calls
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
        mocks.ripgrepFiles.mockImplementationOnce(async function* () {
          for (let i = 0; i < 150; i++) {
            yield `file${i}.txt`
          }
        } as any)

        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        const lines = result.output.split("\n").filter(l => l.trim().startsWith("file"))
        expect(lines.length).toBe(100)
      },
    })
  })

  test("handles empty file list", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.ripgrepFiles.mockImplementation(async function* () {} as any)

        const tool = await ListTool.init()
        const result = await tool.execute({ path: tmp.path }, ctx)

        expect(result.output).toBe("")
      },
    })
  })

  test("handles deep directory structure", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.ripgrepFiles.mockImplementationOnce(async function* () {
          yield "level1/level2/level3/file.txt"
        } as any)

        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        expect(result.output).toContain("level1/")
        expect(result.output).toContain("  level2/")
        expect(result.output).toContain("    level3/")
        expect(result.output).toContain("      file.txt")
      },
    })
  })

  test("normalizes backslashes to forward slashes", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.ripgrepFiles.mockImplementationOnce(async function* () {
          yield "win\\path\\file.txt"
        } as any)

        const tool = await ListTool.init()
        const result = await tool.execute({}, ctx)

        expect(result.output).toContain("win/")
        expect(result.output).toContain("  path/")
        expect(result.output).toContain("    file.txt")
      },
    })
  })
})
