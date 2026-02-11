import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { MultiEditTool } from "../../src/tool/multiedit"
import { EditTool } from "../../src/tool/edit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("MultiEditTool", () => {
  let ctx: any
  let editToolExecute: any

  beforeEach(() => {
    ctx = {
      ask: vi.fn(async () => true),
    }
    editToolExecute = vi.fn(async () => ({
      output: "edit result",
      metadata: { diff: "some diff" },
    }))
    vi.spyOn(EditTool, "init").mockResolvedValue({
      execute: editToolExecute,
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("executes multiple edits sequentially", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await MultiEditTool.init()
        const file = path.join(tmp.path, "file.ts")
        const params = {
          filePath: file,
          edits: [
            { filePath: file, oldString: "old1", newString: "new1" },
            { filePath: file, oldString: "old2", newString: "new2" },
          ],
        }

        const result = await tool.execute(params, ctx)

        expect(editToolExecute).toHaveBeenCalledTimes(2)
        expect(editToolExecute).toHaveBeenNthCalledWith(
          1,
          {
            filePath: file,
            oldString: "old1",
            newString: "new1",
            replaceAll: undefined,
          },
          ctx
        )
        expect(editToolExecute).toHaveBeenNthCalledWith(
          2,
          {
            filePath: file,
            oldString: "old2",
            newString: "new2",
            replaceAll: undefined,
          },
          ctx
        )

        expect(result.title).toBe("file.ts")
        expect(result.output).toBe("edit result")
        expect(result.metadata.results).toHaveLength(2)
      }
    })
  })
})
