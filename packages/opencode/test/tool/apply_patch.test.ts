import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { Patch } from "../../src/patch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as fs from "fs/promises"
import path from "path"

describe("ApplyPatchTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      ask: vi.fn(async () => true),
      sessionID: "test-session",
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
        const tool = await ApplyPatchTool.init()
        expect(tool.execute({ patchText: "" } as any, ctx)).rejects.toThrow("patchText is required")
      }
    })
  })

  it("throws error if patch parsing fails", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: false,
          error: { message: "Invalid patch" },
        } as any)
        const tool = await ApplyPatchTool.init()
        expect(tool.execute({ patchText: "invalid" }, ctx)).rejects.toThrow("apply_patch verification failed: Invalid patch")
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
        const tool = await ApplyPatchTool.init()
        expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("apply_patch verification failed: no hunks found")
      }
    })
  })

  it("handles empty patch rejection", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: { hunks: [] },
        } as any)
        const tool = await ApplyPatchTool.init()
        expect(tool.execute({ patchText: "*** Begin Patch\n*** End Patch" }, ctx)).rejects.toThrow("patch rejected: empty patch")
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
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("Success. Updated the following files")
        expect(result.output).toContain("A new.txt")
        
        const newFile = path.join(tmp.path, "new.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        // ApplyPatchTool adds a newline if it's missing
        expect(await Bun.file(newFile).text()).toBe("new content\n")
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

        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: {
            hunks: [{ type: "delete", path: "old.txt" }],
          },
        } as any)
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("D old.txt")
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
        await fs.writeFile(file, "original content\n")

        vi.spyOn(Patch, "safeParsePatch").mockReturnValue({
          success: true,
          data: {
            hunks: [{ type: "update", path: "file.txt", chunks: [] }],
          },
        } as any)
        vi.spyOn(Patch, "deriveNewContentsFromChunks").mockResolvedValue({ content: "modified content\n", diff: "some diff" } as any)

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText: "some patch" }, ctx)

        expect(result.output).toContain("M file.txt")
        expect(await Bun.file(file).text()).toBe("modified content\n")
      }
    })
  })
})
