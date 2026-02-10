import { expect, it, describe, mock, beforeEach } from "bun:test"
import { LspTool } from "../../src/tool/lsp"
import { LSP } from "../../src/lsp"
import { Instance } from "../../src/project/instance"
import { assertExternalDirectory } from "../../src/tool/external-directory"
import { tmpdir } from "../fixture/fixture"
import path from "path"

// Mock dependencies
mock.module("../../src/lsp", () => ({
  LSP: {
    hasClients: mock(),
    touchFile: mock(),
    definition: mock(),
    references: mock(),
    hover: mock(),
    documentSymbol: mock(),
    workspaceSymbol: mock(),
    implementation: mock(),
    prepareCallHierarchy: mock(),
    incomingCalls: mock(),
    outgoingCalls: mock(),
    diagnostics: mock(),
    Diagnostic: {
      pretty: (d: any) => `Pretty: ${d.message}`,
    },
  },
}))

mock.module("../../src/tool/external-directory", () => ({
  assertExternalDirectory: mock(),
}))

describe("LspTool", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: mock(async () => {}),
  }

  beforeEach(() => {
    mock.restore()
    ;(ctx.ask as any).mockClear()
    ;(assertExternalDirectory as any).mockResolvedValue(undefined)
    ;(LSP.hasClients as any).mockResolvedValue(true)
    ;(LSP.touchFile as any).mockResolvedValue(undefined)
  })

  it("performs goToDefinition", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")
        
        const tool = await LspTool.init()
        const params = {
          operation: "goToDefinition",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }
        const expectedResult = [{ uri: `file://${filePath}`, range: {} }]
        ;(LSP.definition as any).mockResolvedValue(expectedResult)

        const result = await tool.execute(params, ctx)

        expect(LSP.definition).toHaveBeenCalled()
        expect(result.output).toBe(JSON.stringify(expectedResult, null, 2))
      },
    })
  })

  it("performs diagnostics and handles no results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")

        const tool = await LspTool.init()
        const params = {
          operation: "diagnostics",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }
        ;(LSP.diagnostics as any).mockResolvedValue({})

        const result = await tool.execute(params, ctx)
        expect(result.output).toBe("No diagnostics found for this file.")
      },
    })
  })

  it("performs diagnostics and handles results", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")

        const tool = await LspTool.init()
        const params = {
          operation: "diagnostics",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }
        const diag = { message: "Error" }
        ;(LSP.diagnostics as any).mockResolvedValue({
          [filePath]: [diag],
        })

        const result = await tool.execute(params, ctx)
        expect(result.output).toBe("Pretty: Error")
      },
    })
  })

  it("throws error if file not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await LspTool.init()
        const params = {
          operation: "hover",
          filePath: "non-existent.ts",
          line: 1,
          character: 1,
        }

        expect(tool.execute(params, ctx)).rejects.toThrow("File not found")
      },
    })
  })

  it("throws error if no LSP clients", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")

        const tool = await LspTool.init()
        const params = {
          operation: "hover",
          filePath: "test.ts",
          line: 1,
          character: 1,
        }
        ;(LSP.hasClients as any).mockResolvedValue(false)

        expect(tool.execute(params, ctx)).rejects.toThrow("No LSP server available")
      },
    })
  })

  it("handles other operations", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.ts")
        await Bun.write(filePath, "const x = 1;")

        const tool = await LspTool.init()
        const ops = [
          "findReferences",
          "hover",
          "workspaceSymbol",
          "documentSymbol",
          "goToImplementation",
          "prepareCallHierarchy",
          "incomingCalls",
          "outgoingCalls",
        ] as const

        for (const operation of ops) {
          const mockMethod = operation === "findReferences" ? "references" : 
                             operation === "goToImplementation" ? "implementation" : 
                             operation
          
          ;(LSP[mockMethod] as any).mockResolvedValue([])
          
          const result = await tool.execute({
            operation,
            filePath: "test.ts",
            line: 1,
            character: 1,
          }, ctx)
          
          expect(result.output).toContain("No results found")
        }
      },
    })
  })
})
