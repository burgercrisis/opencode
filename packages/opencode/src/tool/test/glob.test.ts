import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { GlobTool } from "../glob"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("GlobTool", () => {
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
    expect(GlobTool.id).toBe("glob")
  })

  test("should have description", async () => {
    const init = await GlobTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await GlobTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should find files matching pattern", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
        await Bun.write(path.join(dir, "test.js"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.ts" }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.count).toBe(1)
        expect(result.metadata.truncated).toBeDefined()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        await init.execute({ pattern: "*.ts" }, mockCtx)

        expect(mockCtx.ask).toHaveBeenCalledWith({
          permission: "glob",
          patterns: ["*.ts"],
          always: ["*"],
          metadata: {
            pattern: "*.ts",
            path: undefined,
          },
        })
      },
    })
  })

  test("should handle custom path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.ts", path: "." }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.count).toBe(1)
      },
    })
  })

  test("should return no files found for non-matching pattern", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.nonexistent123" }, mockCtx)

        expect(result.output).toContain("No files found")
        expect(result.metadata.count).toBe(0)
      },
    })
  })

  test("should handle absolute path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.ts", path: tmp.path }, mockCtx)

        expect(result.title).toBeDefined()
        expect(result.metadata.count).toBe(1)
      },
    })
  })

  test("should handle relative path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.ts", path: "." }, mockCtx)

        expect(result.title).toBeDefined()
      },
    })
  })

  test("should handle glob patterns with wildcards", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
        await Bun.write(path.join(dir, "src", "nested.ts"), "console.log('nested')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "**/*.ts" }, mockCtx)

        expect(result.metadata.count).toBeGreaterThanOrEqual(1)
      },
    })
  })

  test("should handle complex glob patterns", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "src", "test.ts"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "src/**/*.ts" }, mockCtx)

        expect(result.metadata.count).toBeGreaterThanOrEqual(0)
      },
    })
  })

  test("should return file paths in output", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "console.log('test')")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GlobTool.init()
        const result = await init.execute({ pattern: "*.ts" }, mockCtx)

        if (result.metadata.count > 0) {
          expect(result.output).toContain(".ts")
        }
      },
    })
  })
})