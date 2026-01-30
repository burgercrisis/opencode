import z from "zod"
import { Tool } from "./tool"
import path from "path"
import { LSP } from "../lsp"
import DESCRIPTION from "./lsp.txt"
import { Instance } from "../project/instance"
import { pathToFileURL } from "url"
import { assertExternalDirectory } from "./external-directory"

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
  "diagnostics",
] as const

export const LspTool = Tool.define("lsp", {
  description: DESCRIPTION,
  parameters: z.object({
    operation: z.enum(operations).describe("The LSP operation to perform"),
    filePath: z.string().describe("The absolute or relative path to the file"),
    line: z.number().int().min(1).describe("The line number (1-based, as shown in editors)"),
    character: z.number().int().min(1).describe("The character offset (1-based, as shown in editors)"),
  }),
  execute: async (args, ctx) => {
    const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(Instance.directory, args.filePath)
    await assertExternalDirectory(ctx, file)

    await ctx.ask({
      permission: "lsp",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    const uri = pathToFileURL(file).href
    const position = {
      file,
      line: args.line - 1,
      character: args.character - 1,
    }

    const relPath = path.relative(Instance.worktree, file)
    const title = `${args.operation} ${relPath}:${args.line}:${args.character}`

    !(await Bun.file(file).exists()) && (() => { throw new Error(`File not found: ${file}`) })()
    !(await LSP.hasClients(file)) && (() => { throw new Error("No LSP server available for this file type.") })()

    await LSP.touchFile(file, true)

    const result = await (args.operation === "diagnostics"
      ? LSP.diagnostics().then((all) => all[file] || [])
      : args.operation === "workspaceSymbol"
        ? LSP.workspaceSymbol("")
        : args.operation === "documentSymbol"
          ? LSP.documentSymbol(uri)
          : LSP[args.operation === "goToDefinition" ? "definition" :
                args.operation === "findReferences" ? "references" :
                args.operation === "hover" ? "hover" :
                args.operation === "goToImplementation" ? "implementation" :
                args.operation === "prepareCallHierarchy" ? "prepareCallHierarchy" :
                args.operation === "incomingCalls" ? "incomingCalls" :
                "outgoingCalls"](position))

    return {
      title,
      metadata: { result },
      output: args.operation === "diagnostics"
        ? (result.length === 0 ? "No diagnostics found for this file." : result.map(LSP.Diagnostic.pretty).join("\n"))
        : (result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2)),
    }
  },
})
