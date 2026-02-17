import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./batch.txt"
import { Log } from "@/util/log"

const log = Log.create({ service: "tool.batch" })

const DISALLOWED = new Set(["batch"])
const FILTERED_FROM_SUGGESTIONS = new Set(["invalid", "patch", ...DISALLOWED])
const MAX_TOOL_CALLS = 25
const MAX_CONCURRENT_TOOLS = 5
const MAX_ERROR_MESSAGE_LENGTH = 1000

/**
 * Sanitizes error messages to prevent memory leaks and information disclosure
 */
function sanitizeError(err: unknown): string {
  let message: string

  if (err instanceof Error) {
    message = err.message
  } else if (typeof err === "string") {
    message = err
  } else {
    try {
      message = JSON.stringify(err)
    } catch {
      message = "Unknown error occurred"
    }
  }

  // Remove potential sensitive information and limit length
  return message
    .replace(/\/\/.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
    .substring(0, MAX_ERROR_MESSAGE_LENGTH)
    .trim()
}

/**
 * Creates a standardized error message with context
 */
function createErrorMessage(tool: string, reason: string, details?: string): string {
  const baseMessage = `Tool '${tool}' failed: ${reason}`
  return details ? `${baseMessage} (${details})` : baseMessage
}

/**
 * Executes tool calls with controlled concurrency to prevent resource exhaustion
 * Uses a semaphore pattern to avoid race conditions in promise tracking
 */
async function executeWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = []
  const executing: Array<{ promise: Promise<T>; id: string }> = []
  let index = 0

  while (index < tasks.length || executing.length > 0) {
    // Start new tasks up to the concurrency limit
    while (index < tasks.length && executing.length < limit) {
      const task = tasks[index++]
      const id = `task-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const promise = task()
      executing.push({ promise, id })
    }

    // Wait for exactly one task to complete
    if (executing.length > 0) {
      const completedTask = await Promise.race(
        executing.map(({ promise, id }) =>
          promise
            .then(result => ({ result, id, promise }))
            .catch(error => ({ error, id, promise }))
        )
      )

      // Find the completed task by comparing promise references (not values)
      const taskIndex = executing.findIndex(task => task.promise === completedTask.promise)
      if (taskIndex !== -1) {
        executing.splice(taskIndex, 1)
      }

      // Handle result based on completion status
      if ('result' in completedTask) {
        results.push(completedTask.result)
      } else {
        // Store error result instead of throwing - let batch continue with other tasks
        results.push(completedTask.error as any)
      }
    }
  }

  return results
}

// Export for testing
export { executeWithConcurrencyLimit }

export const BatchTool = Tool.define("batch", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      tool_calls: z
        .array(
          z.object({
            tool: z.string().describe("The name of the tool to execute"),
            parameters: z.record(z.string(), z.any()).describe("Parameters for the tool"),
          }),
        )
        .min(1, "Provide at least one tool call")
        .max(MAX_TOOL_CALLS, `Maximum of ${MAX_TOOL_CALLS} tool calls allowed per batch`)
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

      return `The batch tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.\n\nValidation issues:\n${issues}\n\nExpected payload format:\n  [{"tool": "tool_name", "parameters": {...}}, {...}]`
    },
    async execute(params, ctx) {
      const { Session } = await import("../session")
      const { Identifier } = await import("../id/id")
      const { ToolRegistry } = await import("./registry")

      const available = await ToolRegistry.tools({ providerID: "", modelID: "" })
      const map = new Map(available.map((t) => [t.id, t]))

      const validCalls = params.tool_calls.slice(0, MAX_TOOL_CALLS)
      const excessCalls = params.tool_calls.slice(MAX_TOOL_CALLS)

      // Create tasks for valid tool calls
      const toolTasks = validCalls.map((call) => async () => {
        const start = Date.now()
        const id = Identifier.ascending("part")
        const tool = map.get(call.tool)

        // Check for disallowed tools
        if (DISALLOWED.has(call.tool)) {
          const error = createErrorMessage(
            call.tool,
            "not allowed in batch",
            `Disallowed tools: ${Array.from(DISALLOWED).join(", ")}`
          )
          await Session.updatePart({
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
          })
          return { success: false as const, tool: call.tool, error: new Error(error) }
        }

        // Check for missing tools
        if (!tool) {
          const availableTools = Array.from(map.keys())
            .filter((name) => !FILTERED_FROM_SUGGESTIONS.has(name))
            .join(", ")
          const error = createErrorMessage(
            call.tool,
            "not in registry",
            "External tools (MCP, environment) cannot be batched - call them directly"
          )
          await Session.updatePart({
            id,
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "tool",
            tool: call.tool,
            callID: id,
            state: {
              status: "error",
              input: call.parameters,
              error: `${error}. Available tools: ${availableTools}`,
              time: { start, end: Date.now() },
            },
          })
          return { success: false as const, tool: call.tool, error: new Error(error) }
        }

        // Update part status to running
        await Session.updatePart({
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

        // Parse parameters with proper error handling
        let parsedParams
        try {
          parsedParams = tool.parameters.parse(call.parameters)
        } catch (parseError) {
          const error = createErrorMessage(
            call.tool,
            "parameter validation failed",
            sanitizeError(parseError)
          )
          await Session.updatePart({
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
          })
          return { success: false as const, tool: call.tool, error: new Error(error) }
        }

        // Execute tool with timeout and error handling
        try {
          const res = await Promise.race([
            tool.execute(parsedParams, { ...ctx, callID: id }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Tool execution timeout")), 30000)
            )
          ]) as any

          await Session.updatePart({
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
          })
          return { success: true as const, tool: call.tool, result: res }
        } catch (err) {
          const error = createErrorMessage(
            call.tool,
            "execution failed",
            sanitizeError(err)
          )
          await Session.updatePart({
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
          })
          return { success: false as const, tool: call.tool, error: new Error(error) }
        }
      })

      // Execute tool calls with controlled concurrency
      const results = await executeWithConcurrencyLimit(toolTasks, MAX_CONCURRENT_TOOLS)

      // Handle excess calls (beyond limit)
      const excessResults = excessCalls.map((call) => {
        const id = Identifier.ascending("part")
        const now = Date.now()
        const error = createErrorMessage(
          call.tool,
          "exceeded batch limit",
          `Maximum of ${MAX_TOOL_CALLS} tools allowed in batch`
        )

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
            error,
            time: { start: now, end: now },
          },
        }).then(() => ({
          success: false as const,
          tool: call.tool,
          error: new Error(error),
        }))
      })

      // Wait for excess call results
      const excessCompleted = await Promise.all(excessResults)

      // Combine all results
      const allResults = [...results, ...excessCompleted]

      const success = allResults.filter((r) => r.success).length
      const failed = allResults.length - success

      return {
        title: `Batch execution (${success}/${allResults.length} successful)`,
        output: failed > 0
          ? `Executed ${success}/${allResults.length} tools successfully. ${failed} failed.`
          : `All ${success} tools executed successfully.\n\nKeep using the batch tool for optimal performance in your next response!`,
        attachments: allResults.filter((r) => r.success).flatMap((r) => (r.success ? r.result.attachments ?? [] : [])),
        metadata: {
          totalCalls: allResults.length,
          successful: success,
          failed,
          tools: params.tool_calls.map((c) => c.tool),
          details: allResults.map((r) => ({ tool: r.tool, success: r.success })),
        },
      }
    },
  }
})
