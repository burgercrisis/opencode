import { describe, it, expect, mock, vi } from "bun:test"
import { GlobTool } from "../../src/tool/glob"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"
import * as fs from "fs/promises"

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

  it("finds files using glob pattern", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create actual files
        await fs.writeFile(path.join(tmp.path, "file1.ts"), "content1")
        await fs.writeFile(path.join(tmp.path, "file2.ts"), "content2")
        await fs.writeFile(path.join(tmp.path, "file3.js"), "content3")

        const tool = await GlobTool.init()
        const result = await tool.execute({
          pattern: "*.ts"
        }, ctx)

        expect(result.output).toContain("file1.ts")
        expect(result.output).toContain("file2.ts")
        expect(result.output).not.toContain("file3.js")
        expect(ctx.ask).toHaveBeenCalled()
      }
    })
  })

  it("handles no files found", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create files that don't match the pattern
        await fs.writeFile(path.join(tmp.path, "file1.txt"), "content")

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
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create more than 100 files to trigger truncation
        for (let i = 0; i < 110; i++) {
          await fs.writeFile(path.join(tmp.path, `file${i}.ts`), `content${i}`)
        }

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
    await fs.mkdir(subDir)
    await fs.writeFile(path.join(subDir, "subfile.ts"), "content")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()

        // Relative path
        const resultRelative = await tool.execute({
          pattern: "*.ts",
          path: "subdir"
        }, ctx)
        expect(resultRelative.output).toContain("subfile.ts")

        // Absolute path
        const resultAbsolute = await tool.execute({
          pattern: "*.ts",
          path: subDir
        }, ctx)
        expect(resultAbsolute.output).toContain("subfile.ts")
      }
    })
  })

  it("sorts files by mtime", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create files with different mtimes
        await fs.writeFile(path.join(tmp.path, "file1.ts"), "content1")
        await new Promise(r => setTimeout(r, 100))
        await fs.writeFile(path.join(tmp.path, "file2.ts"), "content2")

        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx)

        const lines = result.output.split("\n")
        // file2 should be first because it's newer
        expect(lines[0]).toContain("file2.ts")
        expect(lines[1]).toContain("file1.ts")
      }
    })
  })

  it("finds files in nested directories", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create nested directory structure
        const nestedDir = path.join(tmp.path, "src", "components")
        await fs.mkdir(nestedDir, { recursive: true })
        await fs.writeFile(path.join(nestedDir, "Button.tsx"), "component")
        await fs.writeFile(path.join(tmp.path, "index.ts"), "entry")

        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "**/*.tsx" }, ctx)

        expect(result.output).toContain("Button.tsx")
        expect(result.output).not.toContain("index.ts")
      }
    })
  })

  it("handles multiple file extensions", async () => {
    await using tmp = await tmpdir()
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "file.ts"), "ts content")
        await fs.writeFile(path.join(tmp.path, "file.tsx"), "tsx content")
        await fs.writeFile(path.join(tmp.path, "file.js"), "js content")

        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.{ts,tsx}" }, ctx)

        expect(result.output).toContain("file.ts")
        expect(result.output).toContain("file.tsx")
        expect(result.output).not.toContain("file.js")
      }
    })
  })
})
