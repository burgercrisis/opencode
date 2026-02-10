import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { ToolRegistry } from "../../src/tool/registry"

describe("tool.registry", () => {
  test("loads tools from .opencode/tool (singular)", async () => {
    console.log("Starting singular test")
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolDir = path.join(opencodeDir, "tool")
        await fs.mkdir(toolDir, { recursive: true })

        await Bun.write(
          path.join(toolDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        console.log("Singular IDs:", ids)
        expect(ids).toContain("hello")
      },
    })
    console.log("Finished singular test")
  })

  test("loads tools from .opencode/tools (plural)", async () => {
    console.log("Starting plural test")
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolsDir = path.join(opencodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(toolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        console.log("Plural IDs:", ids)
        expect(ids).toContain("hello")
      },
    })
    console.log("Finished plural test")
  })

  // test("loads tools with external dependencies without crashing", async () => {
  //   await using tmp = await tmpdir({
  //     init: async (dir) => {
  //       const opencodeDir = path.join(dir, ".opencode")
  //       await fs.mkdir(opencodeDir, { recursive: true })
  //
  //       const toolsDir = path.join(opencodeDir, "tools")
  //       await fs.mkdir(toolsDir, { recursive: true })
  //
  //       await Bun.write(
  //         path.join(opencodeDir, "package.json"),
  //         JSON.stringify({
  //           name: "custom-tools",
  //           dependencies: {
  //             "@opencode-ai/plugin": "^0.0.0",
  //             cowsay: "^1.6.0",
  //           },
  //         }),
  //       )
  //
  //       await Bun.write(
  //         path.join(toolsDir, "cowsay.ts"),
  //         [
  //           "import { say } from 'cowsay'",
  //           "export default {",
  //           "  description: 'tool that imports cowsay at top level',",
  //           "  args: { text: { type: 'string' } },",
  //           "  execute: async ({ text }: { text: string }) => {",
  //           "    return say({ text })",
  //           "  },",
  //           "}",
  //           "",
  //         ].join("\n"),
  //       )
  //     },
  //   })
  //
  //   await Instance.provide({
  //     directory: tmp.path,
  //     fn: async () => {
  //       const ids = await ToolRegistry.ids()
  //       expect(ids).toContain("cowsay")
  //     },
  //   })
  // })

  test("register and tools", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const customTool = {
          id: "my-custom-tool",
          init: async () => ({
            description: "custom tool description",
            parameters: (await import("zod")).z.object({ name: (await import("zod")).z.string() }),
            execute: async (args: any) => ({
              title: "Custom Tool",
              metadata: {},
              output: `Hello ${args.name}`,
            }),
          }),
        }

        await ToolRegistry.register(customTool)
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("my-custom-tool")

        const tools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3-5-sonnet-20241022" })
        const registered = tools.find((t) => t.id === "my-custom-tool")
        expect(registered).toBeDefined()
        expect(registered?.description).toBe("custom tool description")

        // Test tool selection logic (patch vs edit/write)
        const gpt35Tools = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-3.5-turbo" })
        expect(gpt35Tools.some((t) => t.id === "apply_patch")).toBe(true)
        expect(gpt35Tools.some((t) => t.id === "edit")).toBe(false)

        const gpt4Tools = await ToolRegistry.tools({ providerID: "openai", modelID: "gpt-4-turbo" })
        expect(gpt4Tools.some((t) => t.id === "apply_patch")).toBe(false)
        expect(gpt4Tools.some((t) => t.id === "edit")).toBe(true)

        const claudeTools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
        expect(claudeTools.some((t) => t.id === "apply_patch")).toBe(false)
        expect(claudeTools.some((t) => t.id === "edit")).toBe(true)

        const o1Tools = await ToolRegistry.tools({ providerID: "openai", modelID: "o1-preview" })
        expect(o1Tools.some((t) => t.id === "apply_patch")).toBe(false)
        expect(o1Tools.some((t) => t.id === "edit")).toBe(true)
      },
    })
  })

  test("custom tool execution from plugin", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const toolsDir = path.join(dir, ".opencode", "tools")
        await fs.mkdir(toolsDir, { recursive: true })
        await Bun.write(
          path.join(toolsDir, "test.ts"),
          `
          export const greet = {
            description: 'greet someone',
            args: { name: { type: 'string' } },
            execute: async (args: any) => 'Hello ' + args.name
          }
        `,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tools = await ToolRegistry.tools({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
        const greetTool = tools.find((t) => t.id === "test_greet")
        expect(greetTool).toBeDefined()

        const result = await greetTool!.execute({ name: "World" }, {} as any)
        expect(result.output).toBe("Hello World")
      },
    })
  })
})
