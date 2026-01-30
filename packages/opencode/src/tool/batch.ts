import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./batch.txt"

const DISALLOWED = new Set(["batch"])
const FILTERED_FROM_SUGGESTIONS = new Set(["invalid", "patch", ...DISALLOWED])

export const BatchTool = Tool.define("batch", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      tool_calls: z
        .array(
          z.object({
            tool: z.string().describe("The name of the tool to execute"),
            parameters: z.object({}).loose().describe("Parameters for the tool"),
          }),
        )
        .min(1, "Provide at least one tool call")
        .describe("Array of tool calls to execute in parallel"),
    }),
    /**
     * Formats validation errors for the batch tool parameters.
     * @param error - The Zod validation error
     * @returns Formatted error message with details
     */
    formatValidationError(error) {
      const issues = error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root"
          return `  - ${path}: ${issue.message}`
        })
        .join("\n")

      return `Invalid parameters for tool 'batch':\n${issues}\n\nExpected payload format:\n  [{"tool": "tool_name", "parameters": {...}}, {...}]`
    },
    async execute(params, ctx) {
      const { Session } = await import("../session")
      const { Identifier } = await import("../id/id")
      const { ToolRegistry } = await import("./registry")

      const available = await ToolRegistry.tools({ providerID: "", modelID: "" })
      const map = new Map(available.map((t) => [t.id, t]))

      const results = await Promise.all([
        ...params.tool_calls.slice(0, 25).map(async (call) => {
          const start = Date.now()
          const id = Identifier.ascending("part")
          const tool = map.get(call.tool)
          const error = DISALLOWED.has(call.tool)
            ? `Tool '${call.tool}' is not allowed in batch. Disallowed tools: ${Array.from(DISALLOWED).join(", ")}`
            : !tool
              ? `Tool '${call.tool}' not in registry. External tools (MCP, environment) cannot be batched - call them directly. Available tools: ${Array.from(map.keys()).filter((name) => !FILTERED_FROM_SUGGESTIONS.has(name)).join(", ")}`
              : null

          return error
            ? Session.updatePart({
                id,
                messageID: ctx.messageID,
                sessionID: ctx.sessionID,
                type: "tool",
                tool: call.tool,
                callID: id,
                state: {
                  status: "error",
                  input: call.parameters,
                  error,
                  time: { start, end: Date.now() },
                },
              }).then(() => ({ success: false as const, tool: call.tool, error: new Error(error) }))
            : Session.updatePart({
                id,
                messageID: ctx.messageID,
                sessionID: ctx.sessionID,
                type: "tool",
                tool: call.tool,
                callID: id,
                state: {
                  status: "running",
                  input: call.parameters,
                  time: { start },
                },
              })
                .then(() => tool!.execute(tool!.parameters.parse(call.parameters), { ...ctx, callID: id }))
                .then((res) =>
                  Session.updatePart({
                    id,
                    messageID: ctx.messageID,
                    sessionID: ctx.sessionID,
                    type: "tool",
                    tool: call.tool,
                    callID: id,
                    state: {
                      status: "completed",
                      input: call.parameters,
                      output: res.output,
                      title: res.title,
                      metadata: res.metadata,
                      attachments: res.attachments,
                      time: { start, end: Date.now() },
                    },
                  }).then(() => ({ success: true as const, tool: call.tool, result: res })),
                )
                .catch((err) =>
                  Session.updatePart({
                    id,
                    messageID: ctx.messageID,
                    sessionID: ctx.sessionID,
                    type: "tool",
                    tool: call.tool,
                    callID: id,
                    state: {
                      status: "error",
                      input: call.parameters,
                      error: err instanceof Error ? err.message : String(err),
                      time: { start, end: Date.now() },
                    },
                  }).then(() => ({ success: false as const, tool: call.tool, error: err })),
                )
        }),
        ...params.tool_calls.slice(25).map((call) => {
          const id = Identifier.ascending("part")
          const now = Date.now()
          return Session.updatePart({
            id,
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "tool",
            tool: call.tool,
            callID: id,
            state: {
              status: "error",
              input: call.parameters,
              error: "Maximum of 25 tools allowed in batch",
              time: { start: now, end: now },
            },
          }).then(() => ({
            success: false as const,
            tool: call.tool,
            error: new Error("Maximum of 25 tools allowed in batch"),
          }))
        }),
      ])

      const success = results.filter((r) => r.success).length
      const failed = results.length - success

      return {
        title: `Batch execution (${success}/${results.length} successful)`,
        output: failed > 0
          ? `Executed ${success}/${results.length} tools successfully. ${failed} failed.`
          : `All ${success} tools executed successfully.\n\nKeep using the batch tool for optimal performance in your next response!`,
        attachments: results.filter((r) => r.success).flatMap((r) => (r.success ? r.result.attachments ?? [] : [])),
        metadata: {
          totalCalls: results.length,
          successful: success,
          failed,
          tools: params.tool_calls.map((c) => c.tool),
          details: results.map((r) => ({ tool: r.tool, success: r.success })),
        },
      }
    },
  }
})
