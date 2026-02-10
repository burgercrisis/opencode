import { expect, it, describe, mock, beforeEach, afterEach } from "bun:test"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { Patch } from "../../src/patch"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { Bus } from "../../src/bus"
import { FileWatcher } from "../../src/file/watcher"
import { LSP } from "../../src/lsp"
import * as fs from "fs/promises"
import * as path from "path"

mock.module("../../src/bun", () => ({
  BunProc: {
    run: mock(),
  },
}))

mock.module("../../src/patch", () => ({
  Patch: {
    safeParsePatch: mock(),
    deriveNewContentsFromChunks: mock(),
  },
}))

mock.module("../../src/project/instance", () => ({
  Instance: {
    directory: "/test",
    worktree: "/test",
    disposeAll: mock(),
    resetForTest: mock(),
    containsPath: mock().mockReturnValue(true),
  },
}))

mock.module("fs/promises", () => ({
  mkdir: mock().mockResolvedValue(undefined),
  writeFile: mock().mockResolvedValue(undefined),
  unlink: mock().mockResolvedValue(undefined),
}))

mock.module("../../src/bus", () => ({
  Bus: {
    publish: mock().mockResolvedValue(undefined),
  },
}))

mock.module("../../src/lsp", () => ({
  LSP: {
    touchFile: mock().mockResolvedValue(undefined),
    diagnostics: mock().mockResolvedValue({}),
    Diagnostic: {
      pretty: (d: any) => `Error: ${d.message}`,
    },
  },
}))

describe("ApplyPatchTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      ask: mock().mockResolvedValue(true),
      sessionID: "test-session",
    }
    mock.restore()
  })

  it("throws error if patchText is missing", async () => {
    const tool = await ApplyPatchTool.init()
    expect(tool.execute({ patchText: "" } as any, ctx)).rejects.toThrow("patchText is required")
  })

  it("throws error if patch parsing fails", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: false,
      error: { message: "Invalid patch" },
    })
    const tool = await ApplyPatchTool.init()
    expect(tool.execute({ patchText: "invalid" }, ctx)).rejects.toThrow("apply_patch verification failed: Invalid patch")
  })

  it("throws error if no hunks found", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: { hunks: [] },
    })
    const tool = await ApplyPatchTool.init()
    expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("apply_patch verification failed: no hunks found")
  })

  it("handles empty patch rejection", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: { hunks: [] },
    })
    const tool = await ApplyPatchTool.init()
    expect(tool.execute({ patchText: "*** Begin Patch\n*** End Patch" }, ctx)).rejects.toThrow("patch rejected: empty patch")
  })

  it("handles 'add' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "add", path: "new.txt", contents: "new content" }],
      },
    })
    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)

    expect(fs.mkdir).toHaveBeenCalled()
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("new.txt"), "new content\n", "utf-8")
    expect(Bus.publish).toHaveBeenCalled()
    expect(LSP.touchFile).toHaveBeenCalled()
    expect(result.output).toContain("A new.txt")
  })

  it("handles 'delete' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "delete", path: "old.txt" }],
      },
    })
    ;(Bun as any).file = (p: string) => ({
      text: () => Promise.resolve("old content"),
    })
    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining("old.txt"))
    expect(result.output).toContain("D old.txt")
  })

  it("handles 'update' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "update", path: "file.txt", chunks: [] }],
      },
    })
    ;(Bun as any).file = (p: string) => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve("old content"),
    })
    ;(Patch.deriveNewContentsFromChunks as any).mockResolvedValue({ content: "updated content" })
    
    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)

    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("file.txt"), "updated content", "utf-8")
    expect(result.output).toContain("M file.txt")
  })

  it("handles 'move' hunk (update with move_path)", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "update", path: "old.txt", move_path: "new.txt", chunks: [] }],
      },
    })
    ;(Bun as any).file = (p: string) => ({
      exists: () => Promise.resolve(true),
      text: () => Promise.resolve("old content"),
    })
    ;(Patch.deriveNewContentsFromChunks as any).mockResolvedValue({ content: "moved content" })

    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)

    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("new.txt"), "moved content", "utf-8")
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining("old.txt"))
    expect(result.output).toContain("M new.txt")
  })

  it("throws error if update file does not exist", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "update", path: "missing.txt", chunks: [] }],
      },
    })
    ;(Bun as any).file = (p: string) => ({
      exists: () => Promise.resolve(false),
    })
    const tool = await ApplyPatchTool.init()
    expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("Failed to read file to update")
  })

  it("reports LSP errors in output", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "add", path: "error.ts", contents: "let x = 1" }],
      },
    })
    ;(LSP.diagnostics as any).mockResolvedValue({
      [Filesystem.normalizePath(path.resolve("/test", "error.ts"))]: [
        { severity: 1, message: "Syntax error" },
      ],
    })

    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)
    expect(result.output).toContain("LSP errors detected in error.ts")
    expect(result.output).toContain("Error: Syntax error")
  })

  it("truncates LSP errors if too many", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "add", path: "many-errors.ts", contents: "errors" }],
      },
    })
    const errors = Array.from({ length: 25 }, (_, i) => ({ severity: 1, message: `Error ${i}` }))
    ;(LSP.diagnostics as any).mockResolvedValue({
      [Filesystem.normalizePath(path.resolve("/test", "many-errors.ts"))]: errors,
    })

    const tool = await ApplyPatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)
    expect(result.output).toContain("and 5 more")
  })
})
