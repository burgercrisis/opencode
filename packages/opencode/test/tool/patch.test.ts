import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { PatchTool } from "../../src/tool/patch"
import { Patch } from "../../src/patch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"
import * as fs from "fs/promises"
import path from "path"

describe("PatchTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      sessionID: "session-123",
      ask: vi.fn(async () => true),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws error if patchText is missing", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await PatchTool.init()
        expect(tool.execute({ patchText: "" }, ctx)).rejects.toThrow("patchText is required")
      }
    })
  })

  it("throws error if patch parsing fails", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({ success: false } as any)
        const tool = await PatchTool.init()
        expect(tool.execute({ patchText: "invalid" }, ctx)).rejects.toThrow("Failed to parse patch")
      }
    })
  })

  it("throws error if no hunks found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: { hunks: [] },
        } as any)
        const tool = await PatchTool.init()
        expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("No file changes found in patch")
      }
    })
  })

  it("handles 'add' hunk", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: {
            hunks: [{ type: "add", path: "new.txt", contents: "new content" }],
          },
        } as any)
        const tool = await PatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("Patch applied successfully")
        expect(result.output).toContain("new.txt")
        
        const newFile = path.join(tmp.path, "new.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        expect(await Bun.file(newFile).text()).toBe("new content")
      }
    })
  })

  it("handles 'delete' hunk", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "old.txt")
        await fs.writeFile(file, "old content")
        FileTime.read(ctx.sessionID, file) // Mark as read

        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: {
            hunks: [{ type: "delete", path: "old.txt" }],
          },
        } as any)
        const tool = await PatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("old.txt")
        expect(await Bun.file(file).exists()).toBe(false)
      }
    })
  })

  it("handles 'update' hunk", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "original content")
        FileTime.read(ctx.sessionID, file) // Mark as read

        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: {
            hunks: [{ type: "update", path: "file.txt", chunks: [] }],
          },
        } as any)
        vi.spyOn(Patch, "deriveNewContentsFromChunks").mockResolvedValue({ content: "modified content", diff: "some diff" } as any)

        const tool = await PatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("file.txt")
        expect(await Bun.file(file).text()).toBe("modified content")
      }
    })
  })
})
