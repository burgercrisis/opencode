import { expect, it, describe, mock, beforeEach } from "bun:test"
import { MultiEditTool } from "../../src/tool/multiedit"
import { EditTool } from "../../src/tool/edit"
import path from "path"

mock.module("../../src/project/instance", () => ({
  Instance: {
    worktree: "/test",
    disposeAll: mock(),
    resetForTest: mock(),
  },
}))

mock.module("../../src/tool/edit", () => ({
  EditTool: {
    init: mock().mockResolvedValue({
      execute: mock().mockResolvedValue({
        output: "edit result",
        metadata: { diff: "some diff" },
      }),
    }),
  },
}))

describe("MultiEditTool", () => {
  let ctx: any

  beforeEach(() => {
    ctx = {
      ask: mock().mockResolvedValue(true),
    }
  })

  it("executes multiple edits sequentially", async () => {
    const editToolMock = await EditTool.init()
    const tool = await MultiEditTool.init()
    const params = {
      filePath: "/test/file.ts",
      edits: [
        { filePath: "/test/file.ts", oldString: "old1", newString: "new1" },
        { filePath: "/test/file.ts", oldString: "old2", newString: "new2" },
      ],
    }

    const result = await tool.execute(params, ctx)

    expect(editToolMock.execute).toHaveBeenCalledTimes(2)
    expect(editToolMock.execute).toHaveBeenNthCalledWith(
      1,
      {
        filePath: "/test/file.ts",
        oldString: "old1",
        newString: "new1",
        replaceAll: undefined,
      },
      ctx
    )
    expect(editToolMock.execute).toHaveBeenNthCalledWith(
      2,
      {
        filePath: "/test/file.ts",
        oldString: "old2",
        newString: "new2",
        replaceAll: undefined,
      },
      ctx
    )

    expect(result.title).toBe("file.ts")
    expect(result.output).toBe("edit result")
    expect(result.metadata.results).toHaveLength(2)
  })
})
