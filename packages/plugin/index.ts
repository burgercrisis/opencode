import { z } from "zod"

export interface PluginInput {
  client: any
  project: any
  worktree: string
  directory: string
  serverUrl: string
  $: any
}

export type Plugin = (input: PluginInput) => Promise<Hooks>

export interface Hooks {
  [key: string]: any
}

export interface ToolDefinition<Parameters extends z.ZodType = z.ZodType> {
  description: string
  parameters: Parameters
  execute: (args: z.infer<Parameters>, ctx: any) => Promise<any>
}
