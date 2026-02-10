import { describe, it, expect, mock, beforeEach } from "bun:test"
import { GlobTool } from "../../src/tool/glob"
import { Instance } from "../../src/project/instance"
import { Ripgrep } from "../../src/file/ripgrep"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

mock.module("../../src/file/ripgrep", () => ({
  Ripgrep: {
    files: mock(async function* () {
      yield "file1.ts"
      yield "file2.ts"
    })
  }
}))

describe("GlobTool", () => {
  const ctx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    ask: mock(() => Promise.resolve()),
    metadata: mock(() => {}),
  } as any

  beforeEach(() => {
    mock.restore()
  })

  it("finds files using glob pattern", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({
          pattern: "*.ts"
        }, ctx)

        expect(result.output).toContain("file1.ts")
        expect(result.output).toContain("file2.ts")
        expect(ctx.ask).toHaveBeenCalled()
      }
    })
  })

  it("handles no files found", async () => {
    await using tmp = await tmpdir()
    
    // Mock files to return nothing
    const { Ripgrep } = await import("../../src/file/ripgrep")
    // @ts-ignore
    Ripgrep.files.mockImplementation(async function* () {})

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({
          pattern: "*.absent"
        }, ctx)

        expect(result.output).toBe("No files found")
      }
    })
  })

  it("handles truncation", async () => {
    await using tmp = await tmpdir()
    
    // Mock files to return many files
    const { Ripgrep } = await import("../../src/file/ripgrep")
    // @ts-ignore
    Ripgrep.files.mockImplementation(async function* () {
      for (let i = 0; i < 110; i++) {
        yield `file${i}.ts`
      }
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({
          pattern: "*.ts"
        }, ctx)

        expect(result.output).toContain("Results are truncated")
        expect(result.metadata.truncated).toBe(true)
      }
    })
  })

  it("handles absolute and relative paths", async () => {
    await using tmp = await tmpdir()
    const subDir = path.join(tmp.path, "subdir")
    
    const { Ripgrep } = await import("../../src/file/ripgrep")
    // @ts-ignore
    Ripgrep.files.mockImplementation(async function* () {
      yield "subfile.ts"
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        
        // Relative path
        await tool.execute({
          pattern: "*.ts",
          path: "subdir"
        }, ctx)
        expect(Ripgrep.files).toHaveBeenCalledWith(expect.objectContaining({
          cwd: expect.stringContaining("subdir")
        }))

        // Absolute path
        await tool.execute({
          pattern: "*.ts",
          path: subDir
        }, ctx)
        expect(Ripgrep.files).toHaveBeenCalledWith(expect.objectContaining({
          cwd: subDir
        }))
      }
    })
  })
})
