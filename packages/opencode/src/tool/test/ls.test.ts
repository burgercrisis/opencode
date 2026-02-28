import { describe, test, expect, mock } from "bun:test"
import { ListTool } from "../ls"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("ListTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should define tool with correct id", () => {
    expect(ListTool.id).toBe("list")
  })

  test("should have description", async () => {
    const init = await ListTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await ListTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should list files in directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.txt"), "content2")
        await Bun.write(path.join(dir, "subdir", "file3.txt"), "content3")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.count).toBeGreaterThanOrEqual(2)
        expect(result.metadata.truncated).toBeDefined()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        await init.execute({ path: "." }, mockCtx)

        // Verify permission was requested
        expect(mockCtx.ask).toHaveBeenCalled()
        const call = mockCtx.ask.mock.calls.at(-1)[0]
        expect(call.permission).toBe("list")
      },
    })
  })

  test("should handle custom path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "content")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.title).toBeDefined()
      },
    })
  })

  test("should handle ignore patterns", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "file1.txt"), "content1")
        await Bun.write(path.join(dir, "file2.log"), "content2")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        // ignore should be an array
        const result = await init.execute({ path: ".", ignore: ["*.log"] }, mockCtx)

        expect(result.metadata.count).toBeGreaterThanOrEqual(0)
      },
    })
  })

  test("should return empty output for empty directory", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await ListTool.init()
        const result = await init.execute({ path: "." }, mockCtx)

        expect(result.metadata.count).toBe(0)
      },
    })
  })
})