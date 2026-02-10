import { expect, it, describe, mock, beforeEach } from "bun:test"
import { PatchTool } from "../../src/tool/patch"
import { Patch } from "../../src/patch"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { FileTime } from "../../src/file/time"
import { assertExternalDirectory } from "../../src/tool/external-directory"
import { FileWatcher } from "../../src/file/watcher"
import { Bus } from "../../src/bus"
import * as fs from "fs/promises"
import path from "path"

// Mock dependencies
mock.module("../../src/patch", () => ({
  Patch: {
    safeParsePatch: mock(),
    deriveNewContentsFromChunks: mock(),
  },
}))

mock.module("../../src/project/instance", () => ({
  Instance: {
    directory: "/project",
    worktree: "/project",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined),
  },
}))

mock.module("../../src/file/time", () => ({
  FileTime: {
    assert: mock(),
    update: mock(),
    read: mock(),
  },
}))

mock.module("../../src/tool/external-directory", () => ({
  assertExternalDirectory: mock().mockResolvedValue(undefined),
}))

mock.module("../../src/file/watcher", () => ({
  FileWatcher: {
    touch: mock().mockResolvedValue(undefined),
    Event: {
      Updated: "updated",
    },
  },
}))

mock.module("../../src/bus", () => ({
  Bus: {
    publish: mock().mockResolvedValue(undefined),
  },
}))

mock.module("fs/promises", () => ({
  mkdir: mock().mockResolvedValue(undefined),
  unlink: mock().mockResolvedValue(undefined),
}))

describe("PatchTool", () => {
  const ctx: any = {
    sessionID: "session-123",
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mock.restore()
    ;(ctx.ask as any).mockClear()
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: { hunks: [] },
    })
    
    // Mock Bun.file
    const originalBunFile = Bun.file
    ;(Bun as any).file = (p: string) => ({
      text: () => Promise.resolve("original content"),
      exists: () => Promise.resolve(true),
    })
    
    // Mock Bun.write
    ;(Bun as any).write = mock().mockResolvedValue(10)
  })

  it("throws error if patchText is missing", async () => {
    const tool = await PatchTool.init()
    expect(tool.execute({ patchText: "" }, ctx)).rejects.toThrow("patchText is required")
  })

  it("throws error if patch parsing fails", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({ success: false })
    const tool = await PatchTool.init()
    expect(tool.execute({ patchText: "invalid" }, ctx)).rejects.toThrow("Failed to parse patch")
  })

  it("throws error if no hunks found", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: { hunks: [] },
    })
    const tool = await PatchTool.init()
    expect(tool.execute({ patchText: "valid but empty" }, ctx)).rejects.toThrow("No file changes found")
  })

  it("handles 'add' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "add", path: "new.txt", contents: "new content" }],
      },
    })
    const tool = await PatchTool.init()
    const result = await tool.execute({ patchText: "some patch" }, ctx)

    expect(fs.mkdir).toHaveBeenCalled()
    expect(Bun.write).toHaveBeenCalledWith(expect.stringContaining("new.txt"), "new content")
    expect(FileTime.read).toHaveBeenCalled()
    expect(Bus.publish).toHaveBeenCalled()
  })

  it("handles 'delete' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "delete", path: "old.txt" }],
      },
    })
    const tool = await PatchTool.init()
    await tool.execute({ patchText: "some patch" }, ctx)

    expect(FileTime.assert).toHaveBeenCalled()
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining("old.txt"))
    expect(FileTime.read).toHaveBeenCalled()
    expect(Bus.publish).toHaveBeenCalled()
  })

  it("handles 'update' hunk", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "update", path: "existing.txt", chunks: [] }],
      },
    })
    ;(Patch.deriveNewContentsFromChunks as any).mockResolvedValue({
      content: "updated content",
    })
    const tool = await PatchTool.init()
    await tool.execute({ patchText: "some patch" }, ctx)

    expect(FileTime.assert).toHaveBeenCalled()
    expect(Bun.write).toHaveBeenCalledWith(expect.stringContaining("existing.txt"), "updated content")
  })

  it("handles 'move' hunk (update with move_path)", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "update", path: "old.txt", move_path: "new.txt", chunks: [] }],
      },
    })
    ;(Patch.deriveNewContentsFromChunks as any).mockResolvedValue({
      content: "moved content",
    })
    const tool = await PatchTool.init()
    await tool.execute({ patchText: "some patch" }, ctx)

    expect(Bun.write).toHaveBeenCalledWith(expect.stringContaining("new.txt"), "moved content")
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining("old.txt"))
  })

  it("throws error for unknown hunk type", async () => {
    ;(Patch.safeParsePatch as any).mockReturnValue({
      success: true,
      data: {
        hunks: [{ type: "invalid", path: "test.txt" }],
      },
    })
    const tool = await PatchTool.init()
    expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("Unknown hunk type")
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
      text: () => Promise.resolve("old content"),
    })
    const tool = await PatchTool.init()
    expect(tool.execute({ patchText: "some patch" }, ctx)).rejects.toThrow("File not found")
  })
})
