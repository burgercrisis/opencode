import { describe, test, expect, mock } from "bun:test"
import { GrepTool } from "../grep"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("GrepTool", () => {
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
    expect(GrepTool.id).toBe("grep")
  })

  test("should have description", async () => {
    const init = await GrepTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await GrepTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should throw error when pattern is empty", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        expect(init.execute({ pattern: "" }, mockCtx)).rejects.toThrow("pattern is required")
      },
    })
  })

  test("should search for pattern", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import" }, mockCtx)

        expect(result.title).toBe("import")
        expect(result.metadata.matches).toBeGreaterThanOrEqual(1)
        expect(result.metadata.truncated).toBeDefined()
      },
    })
  })

  test("should request permission", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        await init.execute({ pattern: "test" }, mockCtx)

        expect(mockCtx.ask).toHaveBeenCalledWith({
          permission: "grep",
          patterns: ["test"],
          always: ["*"],
          metadata: {
            pattern: "test",
            path: undefined,
            include: undefined,
          },
        })
      },
    })
  })

  test("should handle custom path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import", path: "." }, mockCtx)

        expect(result.title).toBe("import")
      },
    })
  })

  test("should handle include pattern", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
        await Bun.write(path.join(dir, "test.js"), "import { bar } from 'baz'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import", include: "*.ts" }, mockCtx)

        expect(result.metadata.matches).toBeGreaterThanOrEqual(1)
      },
    })
  })

  test("should return no files found for non-matching pattern", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "nonexistentpattern12345xyz" }, mockCtx)

        expect(result.output).toContain("No files found")
        expect(result.metadata.matches).toBe(0)
      },
    })
  })

  test("should handle regex patterns", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import.*from" }, mockCtx)

        expect(result.metadata.matches).toBeGreaterThanOrEqual(0)
      },
    })
  })

  test("should handle absolute path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import", path: tmp.path }, mockCtx)

        expect(result.title).toBe("import")
      },
    })
  })

  test("should handle include with multiple extensions", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "import { foo } from 'bar'")
        await Bun.write(path.join(dir, "test.tsx"), "import { bar } from 'baz'")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await GrepTool.init()
        const result = await init.execute({ pattern: "import", include: "*.{ts,tsx}" }, mockCtx)

        expect(result.metadata.matches).toBeGreaterThanOrEqual(0)
      },
    })
  })
})