import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test"
import { GlobTool } from "../../src/tool/glob"
import { Instance } from "../../src/project/instance"
import { Ripgrep } from "../../src/file/ripgrep"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

describe("GlobTool", () => {
  let mocks: {
    ripgrepFiles: any
  }

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
    mocks = {
      ripgrepFiles: vi.spyOn(Ripgrep, "files").mockImplementation(async function* () {
        yield "file1.ts"
        yield "file2.ts"
      } as any),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    mocks.ripgrepFiles.mockImplementation(async function* () {} as any)

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
    mocks.ripgrepFiles.mockImplementation(async function* () {
      for (let i = 0; i < 110; i++) {
        yield `file${i}.ts`
      }
    } as any)

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

  it("handles file stats error gracefully", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Mock Bun.file().stat() to fail
        vi.spyOn(Bun, "file").mockReturnValue({
          stat: () => Promise.reject(new Error("stat failed"))
        } as any)

        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx)

        expect(result.output).toContain("file1.ts")
        expect(result.metadata.count).toBe(2)
      }
    })
  })

  it("sorts files by mtime", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const now = Date.now()
        vi.spyOn(Bun, "file").mockImplementation(((path: string) => {
          const mtime = path.includes("file1.ts") ? now : now + 1000
          return {
            stat: () => Promise.resolve({ mtime: new Date(mtime) })
          } as any
        }) as any)

        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx)

        const lines = result.output.split("\n")
        // file2 should be first because it's newer (mtime + 1000)
        expect(lines[0]).toContain("file2.ts")
        expect(lines[1]).toContain("file1.ts")
      }
    })
  })
})
