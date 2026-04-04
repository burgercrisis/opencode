import { describe, test, expect, mock } from "bun:test"
import { EditTool } from "../edit"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("Context Expansion Integration", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should work with actual EditTool when context expansion finds unique match", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const content = `function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
        await Bun.write(path.join(dir, "test.txt"), content)
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          oldString: 'console.log("hello")',
          newString: 'console.log("world")',
        }, mockCtx)
        
        // Should succeed because one of the replacers finds a unique match
        expect(result.title).toBeDefined()
      },
    })
  })

  test("should fail when multiple matches exist", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const content = `function test() {
  console.log("hello")
}

function another() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
        await Bun.write(path.join(dir, "test.txt"), content)
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        
        // Should throw error because multiple matches exist
        await expect(tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          oldString: 'console.log("hello")',
          newString: 'console.log("world")',
        }, mockCtx)).rejects.toThrow("Found multiple matches")
      },
    })
  })

  test("should work with explicit occurrence selection", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const content = `function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
        await Bun.write(path.join(dir, "test.txt"), content)
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute({
          filePath: path.join(tmp.path, "test.txt"),
          oldString: 'console.log("hello")',
          newString: 'console.log("world")',
          occurrence: 1,
        }, mockCtx)
        
        expect(result.title).toBeDefined()
      },
    })
  })
})
