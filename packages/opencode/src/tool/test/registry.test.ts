import { describe, test, expect, mock } from "bun:test"
import { ToolRegistry } from "../registry"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import { Tool } from "../tool"
import z from "zod"

// Mock model for testing
const mockModel = {
  providerID: "test-provider",
  modelID: "test-model",
}

describe("ToolRegistry", () => {
  test("should have ids function", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toBeDefined()
        expect(Array.isArray(ids)).toBe(true)
      },
    })
  })

  test("should include core tools", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        
        expect(ids).toContain("bash")
        expect(ids).toContain("read")
        expect(ids).toContain("write")
        expect(ids).toContain("edit")
      },
    })
  })

  test("should return tools with id property", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools(mockModel)
        
        for (const tool of tools) {
          expect(tool.id).toBeDefined()
          expect(typeof tool.id).toBe("string")
        }
      },
    })
  })

  test("should return tools with description", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools(mockModel)
        
        for (const tool of tools.slice(0, 5)) {
          expect(tool.description).toBeDefined()
          expect(typeof tool.description).toBe("string")
        }
      },
    })
  })

  test("should initialize tools correctly", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools(mockModel)
        
        for (const tool of tools.slice(0, 5)) {
          expect(tool.description).toBeDefined()
          expect(tool.parameters).toBeDefined()
        }
      },
    })
  })

  test("should register custom tool", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const customTool = Tool.define("custom-test", {
          description: "A custom test tool",
          parameters: z.object({
            input: z.string(),
          }),
          async execute(params, ctx) {
            return {
              title: "custom",
              output: params.input,
              metadata: {},
            }
          },
        })

        await ToolRegistry.register(customTool)
        
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("custom-test")
      },
    })
  })

  test("should update existing tool on re-register", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool1 = Tool.define("duplicate-test", {
          description: "First version",
          parameters: z.object({}),
          async execute(params, ctx) {
            return { title: "v1", output: "", metadata: {} }
          },
        })

        await ToolRegistry.register(tool1)
        
        const tool2 = Tool.define("duplicate-test", {
          description: "Second version",
          parameters: z.object({}),
          async execute(params, ctx) {
            return { title: "v2", output: "", metadata: {} }
          },
        })

        await ToolRegistry.register(tool2)
        
        const ids = await ToolRegistry.ids()
        const duplicateCount = ids.filter(id => id === "duplicate-test").length
        expect(duplicateCount).toBe(1)
      },
    })
  })
})
