import { ToolRegistry } from "../../src/tool/registry"
import { z } from "zod"
import { mock, spyOn, beforeEach, it, expect, describe, beforeAll, afterAll } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, basename, extname } from "node:path"
import { tmpdir } from "node:os"

const TEST_DIR = join(tmpdir(), "opencode-registry-test-" + Math.random().toString(36).slice(2))
const TOOL_PATH = join(TEST_DIR, "tool", "mytool.ts")

// Mock dependencies
let stateValue: any = null
mock.module("../../src/project/instance", () => ({
  Instance: {
    state: (init: any) => {
      return async () => {
        if (!stateValue) stateValue = await init()
        return stateValue
      }
    },
    directory: "/test-dir",
    worktree: "/test-worktree",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined)
  }
}))

const FlagMock = {
  OPENCODE_CLIENT: "cli",
  OPENCODE_EXPERIMENTAL_LSP_TOOL: false,
  OPENCODE_EXPERIMENTAL_PLAN_MODE: false,
  OPENCODE_DISABLE_DEFAULT_PLUGINS: false
}
mock.module("../../src/flag/flag", () => ({
  Flag: FlagMock
}))

mock.module("../../src/config/config", () => ({
  Config: {
    directories: mock().mockResolvedValue([TEST_DIR]),
    waitForDependencies: mock().mockResolvedValue(undefined),
    get: mock().mockResolvedValue({ experimental: { batch_tool: true } })
  }
}))

mock.module("../../src/plugin", () => ({
  Plugin: {
    list: mock().mockResolvedValue([{
      tool: {
        plugin_tool: {
          description: "Plugin Tool",
          args: { text: z.string() },
          execute: mock().mockResolvedValue("Plugin Success")
        }
      }
    }])
  }
}))

mock.module("../../src/tool/truncation", () => ({
  Truncate: {
    output: mock().mockImplementation((res) => Promise.resolve({ content: res, truncated: false }))
  }
}))

describe("ToolRegistry", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, "tool"), { recursive: true })
    // Create a dummy file so glob finds something
    writeFileSync(TOOL_PATH, "export default {}")
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    mock.restore()
    stateValue = null
    // Reset Flag mock values
    FlagMock.OPENCODE_CLIENT = "cli"
    FlagMock.OPENCODE_EXPERIMENTAL_LSP_TOOL = false
    FlagMock.OPENCODE_EXPERIMENTAL_PLAN_MODE = false

    // We don't need to spy on Bun.Glob anymore if we use real files in tmpdir
    // But registry.ts uses new Bun.Glob(...)
  })

  it("loads custom tools from directories", async () => {
    mock.module(TOOL_PATH, () => ({
      default: {
        description: "Custom Tool",
        args: { name: z.string() },
        execute: mock().mockResolvedValue("Custom Success")
      }
    }))

    const ids = await ToolRegistry.ids()
    expect(ids).toContain("mytool")
  })

  it("includes QuestionTool only on certain clients", async () => {
    FlagMock.OPENCODE_CLIENT = "cli"
    let ids = await ToolRegistry.ids()
    expect(ids).toContain("question")

    stateValue = null // Reset cache
    FlagMock.OPENCODE_CLIENT = "other"
    ids = await ToolRegistry.ids()
    expect(ids).not.toContain("question")
  })

  it("includes LspTool when flag is set", async () => {
    FlagMock.OPENCODE_EXPERIMENTAL_LSP_TOOL = true
    const ids = await ToolRegistry.ids()
    expect(ids).toContain("lsp")
  })

  it("includes PlanTools when flags are set", async () => {
    FlagMock.OPENCODE_EXPERIMENTAL_PLAN_MODE = true
    FlagMock.OPENCODE_CLIENT = "cli"
    const ids = await ToolRegistry.ids()
    expect(ids).toContain("plan_enter")
    expect(ids).toContain("plan_exit")
  })

  it("register() updates existing tool if id matches", async () => {
    const tool1 = { id: "test", init: async () => ({ id: "test", description: "V1", parameters: z.object({}), execute: async () => "" }) } as any
    const tool2 = { id: "test", init: async () => ({ id: "test", description: "V2", parameters: z.object({}), execute: async () => "" }) } as any
    
    await ToolRegistry.register(tool1)
    await ToolRegistry.register(tool2)
    const custom = (await ToolRegistry.state()).custom
    expect(custom.find(t => t.id === "test")).toBe(tool2)
  })

  it("ids() returns a list of tool ids", async () => {
    const ids = await ToolRegistry.ids()
    expect(ids).toContain("bash")
    expect(ids).toContain("read")
    expect(ids).toContain("invalid")
  })

  it("tools() returns initialized tools", async () => {
    const tools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3" })
    expect(tools.some(t => t.id === "bash")).toBe(true)
    const bash = tools.find(t => t.id === "bash")
    expect(bash).toHaveProperty("description")
    expect(bash).toHaveProperty("parameters")
  })

  it("filters tools based on modelID (usePatch logic)", async () => {
    // GPT-3.5 should use patch
    const gpt3Tools = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-3.5-turbo" })
    expect(gpt3Tools.some(t => t.id === "apply_patch")).toBe(true)
    expect(gpt3Tools.some(t => t.id === "edit")).toBe(false)

    // Claude or GPT-4 should not use patch
    const claudeTools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3" })
    expect(claudeTools.some(t => t.id === "apply_patch")).toBe(false)
    expect(claudeTools.some(t => t.id === "edit")).toBe(true)
    
    // GPT-4o should not use patch
    const gpt4oTools = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-4o" })
    expect(gpt4oTools.some(t => t.id === "apply_patch")).toBe(false)
  })

  it("fromPlugin correctly wraps plugin tools", async () => {
    const tools = await ToolRegistry.tools({ providerID: "a", modelID: "b" })
    const pluginTool = tools.find(t => t.id === "plugin_tool")
    expect(pluginTool).toBeDefined()
    
    const result = await pluginTool!.execute({ text: "hello" }, { sessionID: "s1" } as any)
    expect(result.output).toBe("Plugin Success")
  })
})
