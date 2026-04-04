import z from "zod"
import { Tool } from "./tool"

export const InvalidTool = Tool.define("invalid", {
  description: "Do not use",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params) {
    const output = `The arguments provided to the tool are invalid: ${params.error}`
    return {
      title: "Invalid Tool",
      output,
      metadata: {},
    }
  },
})
