import { expect, it, describe, spyOn, jest } from "bun:test"
import { GlobTool } from "../../src/tool/glob"
import { Instance } from "../../src/project/instance"
import { Ripgrep } from "../../src/file/ripgrep"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("GlobTool", () => {
  const ctx = {
    ask: async () => {},
    abort: new AbortController().signal,
  }

  it("returns found files", async () => {
    await using tmp = await tmpdir()
    const file1 = path.join(tmp.path, "test1.ts")
    const file2 = path.join(tmp.path, "test2.ts")
    await Bun.write(file1, "content1")
    await Bun.write(file2, "content2")

    // Mock Ripgrep.files to return our files
    const filesSpy = spyOn(Ripgrep, "files").mockImplementation(async function* () {
      yield "test1.ts"
      yield "test2.ts"
    } as any)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx as any)
        
        expect(result.output).toContain("test1.ts")
        expect(result.output).toContain("test2.ts")
        expect(result.metadata.count).toBe(2)
      }
    })

    filesSpy.mockRestore()
  })

  it("handles no files found", async () => {
    await using tmp = await tmpdir()
    
    spyOn(Ripgrep, "files").mockImplementation(async function* () {} as any)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx as any)
        expect(result.output).toBe("No files found")
        expect(result.metadata.count).toBe(0)
      }
    })
  })

  it("handles truncation", async () => {
    await using tmp = await tmpdir()
    
    spyOn(Ripgrep, "files").mockImplementation(async function* () {
      for (let i = 0; i < 105; i++) {
        yield `test${i}.ts`
      }
    } as any)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts" }, ctx as any)
        expect(result.metadata.count).toBe(100)
        expect(result.metadata.truncated).toBe(true)
        expect(result.output).toContain("Results are truncated")
      }
    })
  })

  it("handles custom path", async () => {
    await using tmp = await tmpdir()
    const sub = path.join(tmp.path, "sub")
    await Bun.write(path.join(sub, "test.ts"), "")

    const filesSpy = spyOn(Ripgrep, "files").mockImplementation(async function* () {
      yield "test.ts"
    } as any)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute({ pattern: "*.ts", path: "sub" }, ctx as any)
        expect(result.output).toContain("test.ts")
      }
    })
    
    expect(filesSpy).toHaveBeenCalledWith(expect.objectContaining({
      cwd: expect.stringContaining("sub")
    }))
  })
})
