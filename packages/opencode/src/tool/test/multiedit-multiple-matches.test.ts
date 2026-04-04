import { describe, it, expect, mock } from "bun:test"
import { MultiEditTool } from "../multiedit"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import { FileTime } from "../../file/time"
import * as path from "path"

describe("MultiEdit Multiple Matches Handling", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  it("should handle replaceAll in multiedit", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "foo\nbar\nfoo\nbaz\nfoo")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filepath = path.join(tmp.path, "test.txt")
        await FileTime.read(mockCtx.sessionID, filepath)
        const tool = await MultiEditTool.init()
        const result = await tool.execute({
          filePath: filepath,
          edits: [
            {
              oldString: "foo",
              newString: "qux",
              replaceAll: true
            }
          ]
        }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(1)
      },
    })
  })

  it("should handle multiple edits with replaceAll", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "foo\nbar\nfoo\nbaz\nfoo\nbar\nfoo")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filepath = path.join(tmp.path, "test.txt")
        await FileTime.read(mockCtx.sessionID, filepath)
        const tool = await MultiEditTool.init()
        const result = await tool.execute({
          filePath: filepath,
          edits: [
            {
              oldString: "foo",
              newString: "qux",
              replaceAll: true
            },
            {
              oldString: "bar",
              newString: "quux",
              replaceAll: true
            }
          ]
        }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(2)
      },
    })
  })

  it("should handle mixed success and failure in multiedit", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "foo\nbar\nfoo\nbaz\nfoo")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filepath = path.join(tmp.path, "test.txt")
        await FileTime.read(mockCtx.sessionID, filepath)
        const tool = await MultiEditTool.init()
        const result = await tool.execute({
          filePath: filepath,
          edits: [
            {
              oldString: "bar",
              newString: "qux", // Will succeed
            },
            {
              oldString: "nonexistent",
              newString: "something", // Will fail
            }
          ]
        }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(1)
        expect(result.metadata.failedEdits).toBe(1)
      },
    })
  })

  it("should validate occurrence parameter in multiedit", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()

        await expect(tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          edits: [
            {
              oldString: "foo",
              newString: "bar",
              occurrence: 0 // Invalid
            }
          ]
        }, mockCtx)).rejects.toThrow("occurrence must be a positive integer")
      },
    })
  })

  it("should validate confidence parameter in multiedit", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()

        await expect(tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          edits: [
            {
              oldString: "foo",
              newString: "bar",
              confidence: 1.5 // Invalid
            }
          ]
        }, mockCtx)).rejects.toThrow("confidence must be between 0 and 1")
      },
    })
  })

  it("should handle empty edits array", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()
        const result = await tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          edits: []
        }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.output).toBe("No edits to apply")
      },
    })
  })

  it("should handle multiple matches without replaceAll", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "foo\nbar\nfoo\nbaz\nfoo")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filepath = path.join(tmp.path, "test.txt")
        await FileTime.read(mockCtx.sessionID, filepath)
        const tool = await MultiEditTool.init()
        const result = await tool.execute({
          filePath: filepath,
          edits: [
            {
              oldString: "foo",
              newString: "qux", // Will fail - multiple matches
            }
          ]
        }, mockCtx)

        // The edit should fail due to multiple matches
        expect(result.title).toBeDefined()
        expect(result.metadata.failedEdits).toBe(1)
      },
    })
  })
})