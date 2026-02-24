import { expect, it, describe } from "bun:test"
import { MultiEditTool } from "../../src/tool/multiedit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"
import path from "path"

describe("MultiEditTool", () => {
  const ctx: any = {
    sessionID: "test-session",
    messageID: "test-message",
    ask: async () => {},
  }

  it("executes multiple edits sequentially", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()
        const file = path.join(tmp.path, "file.ts")

        // Create initial file content
        await Bun.write(file, "old1 line\nold2 line\nother content")

        // Mark file as read (required before editing)
        FileTime.read(ctx.sessionID, file)

        const params = {
          filePath: file,
          edits: [
            { filePath: file, oldString: "old1", newString: "new1" },
            { filePath: file, oldString: "old2", newString: "new2" },
          ],
        }

        const result = await tool.execute(params, ctx)

        expect(result.title).toBe("file.ts")
        expect(result.metadata.results).toHaveLength(2)

        // Verify the actual file content was changed
        const content = await Bun.file(file).text()
        expect(content).toContain("new1 line")
        expect(content).toContain("new2 line")
        expect(content).toContain("other content")
        expect(content).not.toContain("old1")
        expect(content).not.toContain("old2")
      },
    })
  })

  it("handles empty edits array", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()
        const file = path.join(tmp.path, "file.ts")

        await Bun.write(file, "unchanged content")

        const params = {
          filePath: file,
          edits: [],
        }

        const result = await tool.execute(params, ctx)

        expect(result.metadata.results).toHaveLength(0)

        // Verify file was not changed
        const content = await Bun.file(file).text()
        expect(content).toBe("unchanged content")
      },
    })
  })

  it("handles replaceAll option", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()
        const file = path.join(tmp.path, "file.ts")

        await Bun.write(file, "foo bar foo baz foo")

        FileTime.read(ctx.sessionID, file)

        const params = {
          filePath: file,
          edits: [
            { filePath: file, oldString: "foo", newString: "qux", replaceAll: true },
          ],
        }

        const result = await tool.execute(params, ctx)

        expect(result.metadata.results).toHaveLength(1)

        const content = await Bun.file(file).text()
        expect(content).toBe("qux bar qux baz qux")
      },
    })
  })
})
