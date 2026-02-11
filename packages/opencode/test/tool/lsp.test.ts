import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { LspTool } from "../../src/tool/lsp"
import { LSP } from "../../src/lsp"
import { Instance } from "../../src/project/instance"
import * as ExternalDirectory from "../../src/tool/external-directory"
import { tmpdir } from "../fixture/fixture"
import path from "path"

describe("LspTool", () => {
  let mocks: {
    lspHasClients: any
    lspTouchFile: any
    lspDefinition: any
    lspReferences: any
    lspHover: any
    lspDocumentSymbol: any
    lspWorkspaceSymbol: any
    lspImplementation: any
    lspPrepareCallHierarchy: any
    lspIncomingCalls: any
    lspOutgoingCalls: any
    lspDiagnostics: any
    assertExternal: any
  }

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
    mocks = {
      lspHasClients: vi.spyOn(LSP, "hasClients").mockResolvedValue(true),
      lspTouchFile: vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined),
      lspDefinition: vi.spyOn(LSP, "definition"),
      lspReferences: vi.spyOn(LSP, "references"),
      lspHover: vi.spyOn(LSP, "hover"),
      lspDocumentSymbol: vi.spyOn(LSP, "documentSymbol"),
      lspWorkspaceSymbol: vi.spyOn(LSP, "workspaceSymbol"),
      lspImplementation: vi.spyOn(LSP, "implementation"),
      lspPrepareCallHierarchy: vi.spyOn(LSP, "prepareCallHierarchy"),
      lspIncomingCalls: vi.spyOn(LSP, "incomingCalls"),
      lspOutgoingCalls: vi.spyOn(LSP, "outgoingCalls"),
      lspDiagnostics: vi.spyOn(LSP, "diagnostics"),
      assertExternal: vi.spyOn(ExternalDirectory, "assertExternalDirectory").mockResolvedValue(undefined),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
        mocks.lspDefinition.mockResolvedValue(expectedResult as any)

        const result = await tool.execute(params, ctx)

        expect(mocks.lspDefinition).toHaveBeenCalled()
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
        mocks.lspDiagnostics.mockResolvedValue({})

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
        const diag = {
          message: "Something is wrong",
          severity: 1,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          }
        }
        mocks.lspDiagnostics.mockResolvedValue({
          [filePath]: [diag],
        })

        const result = await tool.execute(params, ctx)
        expect(result.output).toBe("ERROR [1:1] Something is wrong")
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
        mocks.lspHasClients.mockResolvedValue(false)

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
          const mockSpy = operation === "findReferences" ? mocks.lspReferences : 
                             operation === "goToImplementation" ? mocks.lspImplementation : 
                             operation === "hover" ? mocks.lspHover :
                             operation === "workspaceSymbol" ? mocks.lspWorkspaceSymbol :
                             operation === "documentSymbol" ? mocks.lspDocumentSymbol :
                             operation === "prepareCallHierarchy" ? mocks.lspPrepareCallHierarchy :
                             operation === "incomingCalls" ? mocks.lspIncomingCalls :
                             mocks.lspOutgoingCalls
          
          mockSpy.mockResolvedValue([])
          
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
