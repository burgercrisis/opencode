import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"
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
        const modifyPath = path.join(fixture.path, "modify.txt")
        const deletePath = path.join(fixture.path, "delete.txt")
        await fs.writeFile(modifyPath, "line1\nline2\n", "utf-8")
        await fs.writeFile(deletePath, "obsolete\n", "utf-8")

        const patchText =
          "*** Begin Patch\n*** Add File: nested/new.txt\n+created\n*** Delete File: delete.txt\n*** Update File: modify.txt\n@@\n-line2\n+changed\n*** End Patch"

        const result = await execute({ patchText }, ctx)

        expect(result.title).toContain("Success. Updated the following files")
        expect(result.output).toContain("Success. Updated the following files")
        expect(result.metadata.diff).toContain("Index:")
        expect(calls.length).toBe(1)

        // Verify permission metadata includes files array for UI rendering
        const permissionCall = calls[0]
        expect(permissionCall.metadata.files).toHaveLength(3)
        expect(permissionCall.metadata.files.map((f) => f.type).sort()).toEqual(["add", "delete", "update"])

        const addFile = permissionCall.metadata.files.find((f) => f.type === "add")
        expect(addFile).toBeDefined()
        expect(addFile!.relativePath).toBe("nested/new.txt")
        expect(addFile!.after).toBe("created\n")

        const updateFile = permissionCall.metadata.files.find((f) => f.type === "update")
        expect(updateFile).toBeDefined()
        expect(updateFile!.before).toContain("line2")
        expect(updateFile!.after).toContain("changed")

        const added = await fs.readFile(path.join(fixture.path, "nested", "new.txt"), "utf-8")
        expect(added).toBe("created\n")
        expect(await fs.readFile(modifyPath, "utf-8")).toBe("line1\nchanged\n")
        await expect(fs.readFile(deletePath, "utf-8")).rejects.toThrow()
      },
    })
  })

  test("permission metadata includes move file info", async () => {
    await using fixture = await tmpdir({ git: true })
    const { ctx, calls } = makeCtx()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ApplyPatchTool.init()
        // Invalid patch format
        expect(tool.execute({ patchText: "not a valid patch" }, ctx)).rejects.toThrow()
      }
    })
  })

  it("handles 'add' hunk - creates new file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Add File content lines must start with +
        const patchText = `*** Begin Patch
*** Add File: new.txt
+new content
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("Success. Updated the following files")
        expect(result.output).toContain("A new.txt")

        const newFile = path.join(tmp.path, "new.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        expect(await Bun.file(newFile).text()).toBe("new content\n")
      }
    })
  })

  it("handles 'delete' hunk - removes existing file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "old.txt")
        await fs.writeFile(file, "old content")
        FileTime.read(ctx.sessionID, file) // Mark file as read before deletion

        const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("D old.txt")
        expect(await Bun.file(file).exists()).toBe(false)
      }
    })
  })

  it("handles file update with real patch", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "original content\n")
        FileTime.read(ctx.sessionID, file) // Mark file as read before update

        // Update uses @@ context markers with - and + prefixes
        const patchText = `*** Begin Patch
*** Update File: file.txt
@@
-original content
+modified content
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("M file.txt")
        expect(await Bun.file(file).text()).toBe("modified content\n")
      }
    })
  })

  it("handles multiple hunks in single patch", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file1 = path.join(tmp.path, "file1.txt")
        const file2 = path.join(tmp.path, "file2.txt")
        await fs.writeFile(file1, "content1\n")
        await fs.writeFile(file2, "content2\n")
        FileTime.read(ctx.sessionID, file1)
        FileTime.read(ctx.sessionID, file2)

        const patchText = `*** Begin Patch
*** Update File: file1.txt
@@
-content1
+updated1
*** Update File: file2.txt
@@
-content2
+updated2
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("M file1.txt")
        expect(result.output).toContain("M file2.txt")
        expect(await Bun.file(file1).text()).toBe("updated1\n")
        expect(await Bun.file(file2).text()).toBe("updated2\n")
      }
    })
  })

  it("handles adding file in subdirectory", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: src/components/Button.tsx
+export function Button() {
+  return <button>Click</button>
+}
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        // Windows uses backslashes
        expect(result.output).toContain("Button.tsx")
        const newFile = path.join(tmp.path, "src", "components", "Button.tsx")
        expect(await Bun.file(newFile).exists()).toBe(true)
        expect(await Bun.file(newFile).text()).toContain("export function Button")
      }
    })
  })

  it("validates file must be read before modification", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const file = path.join(tmp.path, "file.txt")
        await fs.writeFile(file, "original content\n")
        // Don't call FileTime.read - should fail

        const patchText = `*** Begin Patch
*** Update File: file.txt
@@
-original content
+modified content
*** End Patch`

        const tool = await ApplyPatchTool.init()
        // Should throw because file wasn't read first
        expect(tool.execute({ patchText }, ctx)).rejects.toThrow()
      }
    })
  })

  it("handles multiline content in add file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: multi.txt
+line 1
+line 2
+line 3
*** End Patch`

        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, ctx)

        expect(result.output).toContain("A multi.txt")
        const newFile = path.join(tmp.path, "multi.txt")
        expect(await Bun.file(newFile).exists()).toBe(true)
        const content = await Bun.file(newFile).text()
        expect(content).toContain("line 1")
        expect(content).toContain("line 2")
        expect(content).toContain("line 3")
      }
    })
  })
})
