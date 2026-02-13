import { ToolRegistry } from "../../src/tool/registry"
import { z } from "zod"
import { mock, spyOn, beforeEach, afterEach, it, expect, describe, beforeAll, afterAll, vi } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, basename, extname } from "node:path"
import { tmpdir } from "node:os"
import { Instance } from "../../src/project/instance"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import { Truncate } from "../../src/tool/truncation"
import { tmpdir as createTmpDir } from "../fixture/fixture"

import { Flag } from "../../src/flag/flag"

const TEST_DIR = join(tmpdir(), "opencode-registry-test-" + Math.random().toString(36).slice(2))
const TOOL_PATH = join(TEST_DIR, "tool", "mytool.ts")

let mocks: {
  configDirectories: any
  configWaitForDependencies: any
  configGet: any
  pluginList: any
  truncateOutput: any
}

describe("ToolRegistry", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, "tool"), { recursive: true })
    // Create a dummy file so glob finds something
    writeFileSync(TOOL_PATH, "export default {}")
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    
    mocks = {
      configDirectories: vi.spyOn(Config, "directories"),
      configWaitForDependencies: vi.spyOn(Config, "waitForDependencies"),
      configGet: vi.spyOn(Config, "get"),
      pluginList: vi.spyOn(Plugin, "list"),
      truncateOutput: vi.spyOn(Truncate, "output"),
    }
    
    mocks.configDirectories.mockResolvedValue([TEST_DIR])
    mocks.configWaitForDependencies.mockResolvedValue(undefined)
    mocks.configGet.mockResolvedValue({ experimental: { batch_tool: true } } as any)
    
    mocks.pluginList.mockResolvedValue([{
      tool: {
        plugin_tool: {
          description: "Plugin Tool",
          args: { text: z.string() },
          execute: mock().mockResolvedValue("Plugin Success")
        }
      }
    }] as any)
    
    mocks.truncateOutput.mockImplementation((res: string) => Promise.resolve({ content: res, truncated: false }))
  })

  afterEach(() => {
     // Clean up dynamic mock.module
     mock.module(TOOL_PATH, () => ({}))
     vi.restoreAllMocks()
   })

  it("loads custom tools from directories", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mock.module(TOOL_PATH, () => ({
          default: {
            description: "Custom Tool",
            args: { name: z.string() },
            execute: mock().mockResolvedValue("Custom Success")
          }
        }))

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
          init: mock().mockResolvedValue({
            description: "Custom",
            parameters: z.object({}),
            execute: mock().mockResolvedValue("Result")
          })
        }
        await ToolRegistry.register(customTool)
        let ids = await ToolRegistry.ids()
        expect(ids).toContain("custom")

        const updatedTool = {
          id: "custom",
          init: mock().mockResolvedValue({
            description: "Updated",
            parameters: z.object({}),
            execute: mock().mockResolvedValue("Result")
          })
        }
        await ToolRegistry.register(updatedTool)
        ids = await ToolRegistry.ids()
        expect(ids).toContain("custom")

        const tools = await ToolRegistry.all()
        const tool = tools.find(t => t.id === "custom")
        const initialized = await tool?.init()
        expect(initialized?.description).toBe("Updated")
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
        expect(ids).toContain("plugin_tool")
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
        const bash = tools.find(t => t.id === "bash")
        expect(bash).toBeDefined()
      },
    })
  })

  it("filters tools based on modelID (usePatch logic)", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // gpt-3.5-turbo should use patch
        const toolsGPT3 = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-3.5-turbo" })
        const idsGPT3 = toolsGPT3.map(t => t.id)
        expect(idsGPT3).toContain("apply_patch")
        expect(idsGPT3).not.toContain("edit")
        expect(idsGPT3).not.toContain("patch")

        // gpt-4 should not use patch
        const toolsGPT4 = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-4" })
        const idsGPT4 = toolsGPT4.map(t => t.id)
        expect(idsGPT4).not.toContain("apply_patch")
        expect(idsGPT4).toContain("edit")
        expect(idsGPT4).toContain("patch")
      },
    })
  })

  it("fromPlugin correctly wraps plugin tools", async () => {
    await using tmp = await createTmpDir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools({ providerID: "a", modelID: "b" })
        const pluginTool = tools.find(t => t.id === "plugin_tool")
        expect(pluginTool).toBeDefined()

        const result = await pluginTool!.execute({ text: "hello" }, {} as any)
        expect(result.output).toBe("Plugin Success")
      },
    })
  })
})
