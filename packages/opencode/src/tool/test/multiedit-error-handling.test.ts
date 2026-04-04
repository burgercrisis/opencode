import { describe, it, expect, mock } from "bun:test"
import { MultiEditTool } from "../multiedit"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import { FileTime } from "../../file/time"
import * as path from "path"

describe("MultiEdit Error Handling", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  it("should correctly track successful and failed edits", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "Hello world\nThis is a test\nAnother line\nFinal line")
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
              oldString: "Hello world",
              newString: "Hello universe", // This should succeed
            },
            {
              oldString: "Non-existent text",
              newString: "This will fail", // This should fail
            },
            {
              oldString: "Another line",
              newString: "Modified line", // This should succeed
            }
          ]
        }, mockCtx)

        // Verify the result has expected properties
        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(2)
        expect(result.metadata.failedEdits).toBe(1)
      },
    })
  })

  it("should handle no-op edits correctly", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "Hello world\nThis is a test\nAnother line\nFinal line")
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
              oldString: "Hello world",
              newString: "Hello universe", // This should succeed
            },
            {
              oldString: "Hello universe",
              newString: "Hello universe", // This is a no-op
            }
          ]
        }, mockCtx)

        // Verify the result has expected properties
        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(1)
      },
    })
  })

  it("should handle all edits failing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "Hello world\nThis is a test\nAnother line\nFinal line")
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
              oldString: "Non-existent text 1",
              newString: "This will fail 1",
            },
            {
              oldString: "Non-existent text 2",
              newString: "This will fail 2",
            }
          ]
        }, mockCtx)

        // Verify the result has expected properties
        expect(result.title).toBeDefined()
        expect(result.metadata.appliedEdits).toBe(0)
        expect(result.metadata.failedEdits).toBe(2)
      },
    })
  })
})