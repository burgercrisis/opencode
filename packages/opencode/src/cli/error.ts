import { ConfigMarkdown } from "@/config/markdown"
import { Config } from "../config/config"
import { MCP } from "../mcp"
import { Provider } from "../provider/provider"
import { UI } from "./ui"

export function FormatError(input: unknown): string {
  // Handle null/undefined first
  if (input === null || input === undefined) {
    return "Unknown error occurred"
  }

  // Type narrowing with proper type guards
  if (typeof input === 'object' && input !== null) {
    // MCP.Failed case
    if ('name' in input && MCP.Failed.isInstance(input)) {
      return `MCP server "${input.name}" failed. Note, opencode does not support MCP authentication yet.`
    }

    // Provider.ModelNotFoundError case
    if ('providerID' in input && 'modelID' in input && Provider.ModelNotFoundError.isInstance(input)) {
      const { providerID, modelID, suggestions } = input as any
      return [
        `Model not found: ${providerID}/${modelID}`,
        ...(Array.isArray(suggestions) && suggestions.length ? ["Did you mean: " + suggestions.join(", ")] : []),
        `Try: \`opencode models\` to list available models`,
        `Or check your config (opencode.json) provider/model names`,
      ].join("\n")
    }

    // Provider.InitError case
    if ('providerID' in input && Provider.InitError.isInstance(input)) {
      return `Failed to initialize provider "${(input as any).providerID}". Check credentials and configuration.`
    }

    // Config.JsonError case
    if ('path' in input && Config.JsonError.isInstance(input)) {
      const error = input as any
      return (
        `Config file at ${error.path} is not valid JSON(C)` + (error.message ? `: ${error.message}` : "")
      )
    }

    // Config.ConfigDirectoryTypoError case
    if ('dir' in input && 'path' in input && 'suggestion' in input && Config.ConfigDirectoryTypoError.isInstance(input)) {
      const error = input as any
      return `Directory "${error.dir}" in ${error.path} is not valid. Rename the directory to "${error.suggestion}" or remove it. This is a common typo.`
    }

    // ConfigMarkdown.FrontmatterError case
    if ('path' in input && 'message' in input && ConfigMarkdown.FrontmatterError.isInstance(input)) {
      const error = input as any
      return `Failed to parse frontmatter in ${error.path}:\n${error.message}`
    }

    // Config.InvalidError case
    if ('path' in input && Config.InvalidError.isInstance(input)) {
      const error = input as any
      return [
        `Configuration is invalid${error.path && error.path !== "config" ? ` at ${error.path}` : ""}` +
        (error.message ? `: ${error.message}` : ""),
        ...(error.issues?.map((issue: any) => "↳ " + issue.message + " " + issue.path.join(".")) ?? []),
      ].join("\n")
    }

    // UI.CancelledError case
    if (UI.CancelledError.isInstance(input)) {
      return ""
    }
  }

  // Fallback for other types
  return FormatUnknownError(input)
}

export function FormatUnknownError(input: unknown): string {
  if (input instanceof Error) {
    return input.stack ?? `${input.name}: ${input.message}`
  }

  if (typeof input === "object" && input !== null) {
    try {
      const json = JSON.stringify(input, null, 2)
      if (json && json !== "{}") return json
    } catch { }
  }

  return String(input)
}
