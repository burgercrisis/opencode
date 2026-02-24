import { ToolRegistry } from "../../src/tool/registry"
import { z } from "zod"
import { beforeEach, afterEach, it, expect, describe, vi } from "bun:test"
import { Instance } from "../../src/project/instance"
import { tmpdir as createTmpDir } from "../fixture/fixture"
import path from "path"

describe("ToolRegistry", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads custom tools from directories", async () => {
    await using tmp = await createTmpDir()
    
    // Create a custom tool file
    const toolDir = path.join(tmp.path, ".opencode", "tool")
    const toolPath = path.join(toolDir, "mytool.ts")
    await Bun.write(toolPath, `
      export default {
        description: "Custom Tool",
        args: { name: { type: "string" } },
        execute: async (args) => "Custom Success: " + args.name
      }
    `)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("mytool")
      },
    })
  })

  it("filters tools based on OPENCODE_CLIENT", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        process.env.OPENCODE_CLIENT = "cli"
        let ids = await ToolRegistry.ids()
        expect(ids).toContain("question")

        process.env.OPENCODE_CLIENT = "web"
        ids = await ToolRegistry.ids()
        expect(ids).not.toContain("question")
      },
    })
  })

  it("includes PlanTools when flags are set", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE = "true"
        process.env.OPENCODE_CLIENT = "cli"

        const ids = await ToolRegistry.ids()
        expect(ids).toContain("plan_enter")
        expect(ids).toContain("plan_exit")
      },
    })
  })

  it("register() updates existing tool if id matches", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const customTool = {
          id: "custom",
          init: async () => ({
            description: "Custom",
            parameters: z.object({}),
            execute: async () => ({ title: "Result", output: "Result", metadata: {} }),
          }),
        }
        await ToolRegistry.register(customTool)
        let ids = await ToolRegistry.ids()
        expect(ids).toContain("custom")

        const updatedTool = {
          id: "custom",
          init: async () => ({
            description: "Updated",
            parameters: z.object({}),
            execute: async () => ({ title: "Result", output: "Result", metadata: {} }),
          }),
        }
        await ToolRegistry.register(updatedTool)
        ids = await ToolRegistry.ids()
        expect(ids).toContain("custom")

        // Verify the tool was updated by initializing it
        const tools = await ToolRegistry.tools({ providerID: "test", modelID: "test" })
        const tool = tools.find((t) => t.id === "custom")
        expect(tool).toBeDefined()
        expect(tool?.description).toBe("Updated")
      },
    })
  })

  it("ids() returns a list of tool ids", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(Array.isArray(ids)).toBe(true)
        expect(ids.length).toBeGreaterThan(0)
        expect(ids).toContain("bash")
        expect(ids).toContain("edit")
      },
    })
  })

  it("tools() returns initialized tools", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3" })
        expect(Array.isArray(tools)).toBe(true)
        expect(tools.length).toBeGreaterThan(0)
        const bash = tools.find((t) => t.id === "bash")
        expect(bash).toBeDefined()
      },
    })
  })

  it("filters tools based on modelID (usePatch logic)", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // gpt-3.5-turbo should use apply_patch instead of edit/write
        const toolsGPT3 = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-3.5-turbo" })
        const idsGPT3 = toolsGPT3.map((t) => t.id)
        expect(idsGPT3).toContain("apply_patch")
        expect(idsGPT3).not.toContain("edit")
        expect(idsGPT3).not.toContain("write")

        // gpt-4 should use edit/write instead of apply_patch
        const toolsGPT4 = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-4" })
        const idsGPT4 = toolsGPT4.map((t) => t.id)
        expect(idsGPT4).not.toContain("apply_patch")
        expect(idsGPT4).toContain("edit")
        expect(idsGPT4).toContain("write")
      },
    })
  })
})
