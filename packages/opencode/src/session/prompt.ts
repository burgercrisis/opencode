import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { Identifier } from "../id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { SessionRevert } from "./revert"
import { Session } from "."
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
import { type Tool as AITool, tool, jsonSchema, type ToolCallOptions } from "ai"
import { SessionCompaction } from "./compaction"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { ProviderTransform } from "../provider/transform"
import { SystemPrompt } from "./system"
import { Plugin } from "../plugin"
import PROMPT_PLAN from "../session/prompt/plan.txt"
import BUILD_SWITCH from "../session/prompt/build-switch.txt"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import { defer } from "../util/defer"
import { clone } from "remeda"
import { ToolRegistry } from "../tool/registry"
import { MCP } from "../mcp"
import { LSP } from "../lsp"
import { ReadTool } from "../tool/read"
import { ListTool } from "../tool/ls"
import { FileTime } from "../file/time"
import { Flag } from "../flag/flag"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { Command } from "../command"
import { $, fileURLToPath } from "bun"
import { ConfigMarkdown } from "../config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/util/error"
import { fn } from "@/util/fn"
import { SessionProcessor } from "./processor"
import { TaskTool } from "@/tool/task"
import { Tool } from "@/tool/tool"
import { PermissionNext } from "@/permission/next"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { iife } from "@/util/iife"
import { Shell } from "@/shell/shell"
import { Truncate } from "@/tool/truncation"
import { Token } from "@/util/token"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })
  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  const state = Instance.state(
    () => {
      const data: Record<
        string,
        {
          abort: AbortController
          callbacks: {
            resolve(input: MessageV2.WithParts): void
            reject(): void
          }[]
        }
      > = {}
      return data
    },
    async (current) => {
      for (const item of Object.values(current)) {
        item.abort.abort()
        for (const callback of item.callbacks) {
          callback.reject()
        }
      }
    },
  )

  export function assertNotBusy(sessionID: string) {
    const match = state()[sessionID]
    if (match) throw new Session.BusyError(sessionID)
  }

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z
      .record(z.string(), z.boolean())
      .optional()
      .describe(
        "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
      ),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "TextPartInput",
          }),
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "FilePartInput",
          }),
        MessageV2.AgentPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "AgentPartInput",
          }),
        MessageV2.SubtaskPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "SubtaskPartInput",
          }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export const prompt = fn(PromptInput, async (input) => {
    const session = await Session.get(input.sessionID)
    await SessionRevert.cleanup(session)

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    // this is backwards compatibility for allowing `tools` to be specified when
    // prompting
    const permissions: PermissionNext.Ruleset = []
    for (const [tool, enabled] of Object.entries(input.tools ?? {})) {
      permissions.push({
        permission: tool,
        action: enabled ? "allow" : "deny",
        pattern: "*",
      })
    }
    if (permissions.length > 0) {
      session.permission = permissions
      await Session.update(session.id, (draft) => {
        draft.permission = permissions
      })
    }

    if (input.noReply === true) {
      return message
    }

    return loop(input.sessionID)
  })

  export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
    const parts: PromptInput["parts"] = [
      {
        type: "text",
        text: template,
      },
    ]
    const files = ConfigMarkdown.files(template)
    const seen = new Set<string>()
    await Promise.all(
      files.map(async (match) => {
        const name = match[1]
        if (seen.has(name)) return
        seen.add(name)
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(Instance.worktree, name)

        const stats = await fs.stat(filepath).catch(() => undefined)
        if (!stats) {
          const agent = await Agent.get(name)
          if (agent) {
            parts.push({
              type: "agent",
              name: agent.name,
            })
          }
          return
        }

        if (stats.isDirectory()) {
          parts.push({
            type: "file",
            url: `file://${filepath}`,
            filename: name,
            mime: "application/x-directory",
          })
          return
        }

        parts.push({
          type: "file",
          url: `file://${filepath}`,
          filename: name,
          mime: "text/plain",
        })
      }),
    )
    return parts
  }

  function start(sessionID: string) {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
      abort: controller,
      callbacks: [],
    }
    return controller.signal
  }

  export function cancel(sessionID: string) {
    log.info("cancel", { sessionID })
    const s = state()
    const match = s[sessionID]
    if (!match) return
    match.abort.abort()
    for (const item of match.callbacks) {
      item.reject()
    }
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }

  export const loop = fn(Identifier.schema("session"), async (sessionID) => {
    const abort = start(sessionID)
    if (!abort) {
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID].callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    let step = 0
    const session = await Session.get(sessionID)
    while (true) {
      try {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      let lastUser: MessageV2.User | undefined
      let lastAssistant: MessageV2.Assistant | undefined
      let lastFinished: MessageV2.Assistant | undefined
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
        if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
          lastFinished = msg.info as MessageV2.Assistant
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      step++
      if (step === 1) {
        try {
          ensureTitle({
            session,
            modelID: lastUser.model.modelID,
            providerID: lastUser.model.providerID,
            history: msgs,
          })
        } catch (error) {
          log.error("Failed to ensure title", { 
            sessionID, 
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue even if title setting fails
        }
      }

      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
      const task = tasks.pop()

      // pending subtask
      // TODO: centralize "invoke tool" logic
      if (task?.type === "subtask") {
        let taskToolInit: Awaited<ReturnType<typeof TaskTool.init>>
        try {
          taskToolInit = await TaskTool.init({ agent })
        } catch (error) {
          log.error("Failed to initialize task tool", { 
            sessionID, 
            agent: task.agent,
            error: error instanceof Error ? error.message : String(error) 
          })
          continue // Skip this subtask if tool initialization fails
        }
        
        let taskModel = model
        if (task.model) {
          try {
            taskModel = await Provider.getModel(task.model.providerID, task.model.modelID)
          } catch (error) {
            log.error("Failed to get task model, falling back to default model", { 
              sessionID, 
              taskModel: task.model,
              error: error instanceof Error ? error.message : String(error) 
          })
            // Continue with default model
          }
        }
        
        let assistantMessage: MessageV2.Assistant
        try {
          assistantMessage = (await Session.updateMessage({
            id: Identifier.ascending("message"),
            role: "assistant",
            parentID: lastUser.id,
            sessionID,
            mode: task.agent,
            agent: task.agent,
            path: {
              cwd: Instance.directory,
              root: Instance.worktree,
            },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            modelID: taskModel.id,
            providerID: taskModel.providerID,
            time: {
              created: Date.now(),
            },
          })) as MessageV2.Assistant
        } catch (error) {
          log.error("Failed to create subtask assistant message", { 
            sessionID, 
            agent: task.agent,
            error: error instanceof Error ? error.message : String(error) 
          })
          continue // Skip this subtask if message creation fails
        }
        let part: MessageV2.ToolPart
        try {
          part = (await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: assistantMessage.id,
            sessionID: assistantMessage.sessionID,
            type: "tool",
            callID: ulid(),
            tool: TaskTool.id,
            state: {
              status: "running",
              input: {
                prompt: task.prompt,
                description: task.description,
                subagent_type: task.agent,
                command: task.command,
              },
              time: {
                start: Date.now(),
              },
            },
          })) as MessageV2.ToolPart
        } catch (error) {
          log.error("Failed to create subtask part", { 
            sessionID, 
            agent: task.agent,
            error: error instanceof Error ? error.message : String(error) 
          })
          continue // Skip this subtask if part creation fails
        }
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
        }
        try {
          await Plugin.trigger(
            "tool.execute.before",
            {
              tool: "task",
              sessionID,
              callID: part.id,
            },
            { args: taskArgs },
          )
        } catch (error) {
          log.error("Failed to trigger before plugin for subtask", { 
            sessionID, 
            tool: "task",
            callID: part.id,
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue even if plugin trigger fails
        }
        
        let executionError: Error | undefined
        let taskAgent: Agent.Info
        try {
          taskAgent = await Agent.get(task.agent)
        } catch (error) {
          log.error("Failed to get task agent", { 
            sessionID, 
            agent: task.agent,
            error: error instanceof Error ? error.message : String(error) 
          })
          executionError = error as Error
        }
        
        const taskCtx: Tool.Context = {
          agent: task.agent,
          messageID: assistantMessage.id,
          sessionID: sessionID,
          abort,
          callID: part.callID,
          extra: { bypassAgentCheck: true },
          async metadata(input) {
            try {
              await Session.updatePart({
                ...part,
                type: "tool",
                state: {
                  ...part.state,
                  ...input,
                },
              } satisfies MessageV2.ToolPart)
            } catch (error) {
              log.error("Failed to update task metadata", { 
                sessionID, 
                callID: part.callID,
                error: error instanceof Error ? error.message : String(error) 
              })
            }
          },
          async ask(req) {
            try {
              await PermissionNext.ask({
                ...req,
                sessionID: sessionID,
                ruleset: PermissionNext.merge(taskAgent.permission, session.permission ?? []),
              })
            } catch (error) {
              log.error("Failed to ask for permission in task", { 
                sessionID, 
                callID: part.callID,
                permission: req.permission,
                error: error instanceof Error ? error.message : String(error) 
              })
              throw error // Re-throw permission errors
            }
          },
        }
        
        const result = await taskToolInit.execute(taskArgs, taskCtx).catch((error: unknown) => {
          executionError = error instanceof Error ? error : new Error(String(error))
          log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
          return undefined
        })
        
        try {
          await Plugin.trigger(
            "tool.execute.after",
            {
              tool: "task",
              sessionID,
              callID: part.id,
            },
            result,
          )
        } catch (error) {
          log.error("Failed to trigger after plugin for subtask", { 
            sessionID, 
            tool: "task",
            callID: part.id,
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue even if plugin trigger fails
        }
        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        
        try {
          await Session.updateMessage(assistantMessage)
        } catch (error) {
          log.error("Failed to update assistant message after task", { 
            sessionID, 
            messageID: assistantMessage.id,
            error: error instanceof Error ? error.message : String(error) 
          })
        }
        
        if (result && part.state.status === "running") {
          try {
            await Session.updatePart({
              ...part,
              state: {
                status: "completed",
                input: part.state.input,
                title: result.title,
                metadata: result.metadata,
                output: result.output,
                attachments: result.attachments,
                time: {
                  ...part.state.time,
                  end: Date.now(),
                },
              },
            } satisfies MessageV2.ToolPart)
          } catch (error) {
            log.error("Failed to update completed task part", { 
              sessionID, 
              callID: part.callID,
              error: error instanceof Error ? error.message : String(error) 
            })
          }
        }
        
        if (!result) {
          try {
            await Session.updatePart({
              ...part,
              state: {
                status: "error",
                error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
                time: {
                  start: part.state.status === "running" ? part.state.time.start : Date.now(),
                  end: Date.now(),
                },
                metadata: part.metadata,
                input: part.state.input,
              },
            } satisfies MessageV2.ToolPart)
          } catch (error) {
            log.error("Failed to update error task part", { 
              sessionID, 
              callID: part.callID,
              error: error instanceof Error ? error.message : String(error) 
            })
          }
        }

        if (task.command) {
          // Add synthetic user message to prevent certain reasoning models from erroring
          // If we create assistant messages w/ out user ones following mid loop thinking signatures
          // will be missing and it can cause errors for models like gemini for example
          try {
            const summaryUserMsg: MessageV2.User = {
              id: Identifier.ascending("message"),
              sessionID,
              role: "user",
              time: {
                created: Date.now(),
              },
              agent: lastUser.agent,
              model: lastUser.model,
            }
            await Session.updateMessage(summaryUserMsg)
            await Session.updatePart({
              id: Identifier.ascending("part"),
              messageID: summaryUserMsg.id,
              sessionID,
              type: "text",
              text: "Summarize the task tool output above and continue with your task.",
              synthetic: true,
            } satisfies MessageV2.TextPart)
          } catch (error) {
            log.error("Failed to create synthetic user message after task", { 
              sessionID, 
              error: error instanceof Error ? error.message : String(error) 
            })
            // Continue even if synthetic message creation fails
          }
        }

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        try {
          const result = await SessionCompaction.process({
            messages: msgs,
            parentID: lastUser.id,
            abort,
            sessionID,
            auto: task.auto,
          })
          if (result === "stop") break
        } catch (error) {
          log.error("Failed to process compaction", { 
            sessionID, 
            auto: task.auto,
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue even if compaction fails
        }
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true
      ) {
        let needsCompaction = false
        try {
          needsCompaction = await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
        } catch (error) {
          log.error("Failed to check for context overflow", { 
            sessionID, 
            error: error instanceof Error ? error.message : String(error) 
          })
          // Assume no overflow if check fails
        }
        
        if (needsCompaction) {
          try {
            await SessionCompaction.create({
              sessionID,
              agent: lastUser.agent,
              model: lastUser.model,
              auto: true,
            })
          } catch (error) {
            log.error("Failed to create compaction", { 
              sessionID, 
              error: error instanceof Error ? error.message : String(error) 
            })
            // Continue without compaction if creation fails
          }
          continue
        }
      }

      // normal processing
      const agent = await Agent.get(lastUser.agent)
      const maxSteps = agent.steps ?? Infinity
      const isLastStep = step >= maxSteps
      try {
        msgs = await insertReminders({
          messages: msgs,
          agent,
          session,
        })
      } catch (error) {
        log.error("Failed to insert reminders, continuing with original messages", { 
          sessionID, 
          error: error instanceof Error ? error.message : String(error),
          agent: agent.name 
        })
        // Continue with original messages if insertReminders fails
      }

      let assistantMessage: MessageV2.Assistant
      try {
        assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.name,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
          sessionID,
        })) as MessageV2.Assistant
      } catch (error) {
        log.error("Failed to create assistant message", { 
          sessionID, 
          step,
          error: error instanceof Error ? error.message : String(error) 
        })
        // Skip this loop iteration if we can't create the assistant message
        continue
      }

      const processor = SessionProcessor.create({
        assistantMessage,
        sessionID: sessionID,
        model,
        abort,
      })

      // Check if user explicitly invoked an agent via @ in this turn
      const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
      const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false

      let tools: Record<string, AITool> = {}
      try {
        tools = await resolveTools({
          agent,
          session,
          model,
          tools: lastUser.tools,
          processor,
          bypassAgentCheck,
        })
      } catch (error) {
        log.error("Failed to resolve tools, continuing with empty tool set", { 
          sessionID, 
          agent: agent.name,
          error: error instanceof Error ? error.message : String(error) 
        })
        // Continue with empty tools if resolution fails
      }

      if (step === 1) {
        try {
          SessionSummary.summarize({
            sessionID: sessionID,
            messageID: lastUser.id,
          })
        } catch (error) {
          log.error("Failed to create summary", { 
            sessionID, 
            messageID: lastUser.id,
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue even if summarization fails
        }
      }

      const sessionMessages = clone(msgs)

      // Ephemerally wrap queued user messages with a reminder to stay on track
      if (step > 1 && lastFinished) {
        for (const msg of sessionMessages) {
          if (msg.info.role !== "user" || msg.info.id <= lastFinished.id) continue
          for (const part of msg.parts) {
            if (part.type !== "text" || part.ignored || part.synthetic) continue
            if (!part.text.trim()) continue
            part.text = [
              "<system-reminder>",
              "The user sent the following message:",
              part.text,
              "",
              "Please address this message and continue with your tasks.",
              "</system-reminder>",
            ].join("\n")
          }
        }
      }

      try {
      await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })
    } catch (error) {
      log.error("Failed to transform messages", { 
        sessionID, 
        error: error instanceof Error ? error.message : String(error) 
      })
      // Continue with untransformed messages if transform fails
    }

      let systemPrompts: string[] = []
      try {
        systemPrompts = [...(await SystemPrompt.environment(model)), ...(await SystemPrompt.custom())]
      } catch (error) {
        log.error("Failed to load system prompts", { 
          sessionID, 
          model: model.id,
          error: error instanceof Error ? error.message : String(error) 
        })
        // Continue with empty system prompts if loading fails
      }

      let result: "stop" | "compact" | "continue" | undefined
      try {
        result = await processor.process({
          user: lastUser,
          agent,
          abort,
          sessionID,
          system: systemPrompts,
          messages: [
            ...MessageV2.toModelMessages(sessionMessages, model),
            ...(isLastStep
              ? [
                  {
                    role: "assistant" as const,
                    content: MAX_STEPS,
                  },
                ]
              : []),
          ],
          tools,
          model,
        })
      } catch (error) {
        log.error("Processor failed to process request", { 
          sessionID, 
          step,
          error: error instanceof Error ? error.message : String(error) 
        })
        // Break the loop on processor failure to prevent infinite loops
        break
      }
      if (result === "stop") break
      if (result === "compact") {
        try {
          await SessionCompaction.create({
            sessionID,
            agent: lastUser.agent,
            model: lastUser.model,
            auto: true,
          })
        } catch (error) {
          log.error("Failed to create compaction after processor request", { 
            sessionID, 
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue without compaction if creation fails
        }
      }
      continue
      } catch (loopError) {
        log.error("Unexpected error in main loop, attempting to continue", { 
          sessionID, 
          step,
          error: loopError instanceof Error ? loopError.message : String(loopError) 
        })
        
        // Try to create a fallback assistant message to prevent complete failure
        try {
          const fallbackMessage = await Session.updateMessage({
            id: Identifier.ascending("message"),
            parentID: (await MessageV2.filterCompacted(MessageV2.stream(sessionID)))
              .findLast(msg => msg.info?.role === "user")?.info?.id || "",
            role: "assistant",
            mode: "fallback",
            agent: "fallback",
            path: {
              cwd: Instance.directory,
              root: Instance.worktree,
            },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            modelID: (await Provider.defaultModel()).modelID,
            providerID: (await Provider.defaultModel()).providerID,
            time: {
              created: Date.now(),
              completed: Date.now(),
            },
            sessionID,
            finish: "error",
          })
          
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: fallbackMessage.id,
            sessionID,
            type: "text",
            text: "I encountered an error while processing your request. The system has recovered, but you may need to provide your input again.",
            synthetic: true,
          })
          
          return fallbackMessage
        } catch (fallbackError) {
          log.error("Failed to create fallback message", { 
            sessionID, 
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) 
          })
          throw new Error(`Critical error in session loop: ${loopError instanceof Error ? loopError.message : String(loopError)}`)
        }
      }
    }
    try {
      SessionCompaction.prune({ sessionID })
    } catch (error) {
      log.error("Failed to prune compaction", { 
        sessionID, 
        error: error instanceof Error ? error.message : String(error) 
      })
      // Continue even if prune fails
    }
    try {
      for await (const item of MessageV2.stream(sessionID)) {
        if (item.info.role === "user") continue
        const queued = state()[sessionID]?.callbacks ?? []
        for (const q of queued) {
          q.resolve(item)
        }
        return item
      }
    } catch (error) {
      log.error("Failed to stream messages for final return", { 
        sessionID, 
        error: error instanceof Error ? error.message : String(error) 
      })
      throw new Error("Failed to retrieve final assistant message from stream")
    }
    throw new Error("Impossible")
  })

  async function lastModel(sessionID: string) {
    try {
      const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      // Iterate backwards to find the most recent user message with a model
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (msg.info.role === "user" && msg.info.model) {
          return msg.info.model
        }
      }
    } catch (error) {
      log.error("Error in lastModel, falling back to default model", { sessionID, error })
    }
    return Provider.defaultModel()
  }

  async function lastAgent(sessionID: string) {
    try {
      const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      // Iterate backwards to find the most recent user message with an agent
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (msg.info.role === "user" && msg.info.agent) {
          return msg.info.agent
        }
      }
    } catch (error) {
      log.error("Error in lastAgent, falling back to default agent", { sessionID, error })
    }
    return Agent.defaultAgent()
  }

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    session: Session.Info
    tools?: Record<string, boolean>
    processor: SessionProcessor.Info
    bypassAgentCheck: boolean
  }) {
    using _ = log.time("resolveTools")
    const tools: Record<string, AITool> = {}

    const context = (args: any, options: ToolCallOptions): Tool.Context => ({
      sessionID: input.session.id,
      abort: options.abortSignal!,
      messageID: input.processor.message.id,
      callID: options.toolCallId,
      extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck },
      agent: input.agent.name,
      metadata: async (val: { title?: string; metadata?: any }) => {
        try {
          const match = input.processor.partFromToolCall(options.toolCallId)
          if (match && match.state.status === "running") {
            await Session.updatePart({
              ...match,
              state: {
                title: val.title,
                metadata: val.metadata,
                status: "running",
                input: args,
                time: {
                  start: Date.now(),
                },
              },
            })
          }
        } catch (error) {
          log.error("Failed to update tool metadata", { 
            sessionID: input.session.id, 
            toolCallId: options.toolCallId,
            error: error instanceof Error ? error.message : String(error) 
          })
        }
      },
      async ask(req) {
        try {
          await PermissionNext.ask({
            ...req,
            sessionID: input.session.id,
            tool: { messageID: input.processor.message.id, callID: options.toolCallId },
            ruleset: PermissionNext.merge(input.agent.permission, input.session.permission ?? []),
          })
        } catch (error) {
          log.error("Failed to ask for permission", { 
            sessionID: input.session.id, 
            toolCallId: options.toolCallId,
            permission: req.permission,
            error: error instanceof Error ? error.message : String(error) 
          })
          throw error // Re-throw permission errors as they're critical
        }
      },
    })

    // Load tool registry tools with error handling
    try {
      // Fix: Correct parameter order for ToolRegistry.tools() - providerID first, then modelID
      // Add backwards compatibility for both new and old parameter structures
      let modelParams: { providerID: string; modelID: string }
      
      // Handle different model object structures for backwards compatibility
      if (input.model.api && input.model.api.id) {
        // New structure with nested api.id
        modelParams = { 
          providerID: input.model.providerID, 
          modelID: input.model.api.id 
        }
      } else if (input.model.id) {
        // Direct id property (fallback for older structures)
        modelParams = { 
          providerID: input.model.providerID, 
          modelID: input.model.id 
        }
      } else {
        // Ultimate fallback: use providerID as modelID if available
        const fallbackModelID = input.model.id || input.model.providerID || "unknown"
        modelParams = { 
          providerID: input.model.providerID, 
          modelID: fallbackModelID
        }
        log.warn("Using fallback model ID for ToolRegistry", { 
          sessionID: input.session.id,
          providerID: input.model.providerID,
          fallbackModelID 
        })
      }
      
      const registryTools = await ToolRegistry.tools(modelParams, input.agent)
      
      for (const item of registryTools) {
        try {
          // Validate tool item before processing
          if (!item || !item.id) {
            log.warn("Skipping invalid tool item", { 
              sessionID: input.session.id,
              item: item ? Object.keys(item) : 'null'
            })
            continue
          }

          // Validate that tool has required properties
          if (!item.parameters || !item.description || !item.execute) {
            log.warn("Tool missing required properties", { 
              tool: item.id,
              sessionID: input.session.id,
              hasParameters: !!item.parameters,
              hasDescription: !!item.description,
              hasExecute: !!item.execute
            })
            continue
          }

          const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
          tools[item.id] = tool({
            id: item.id as any,
            description: item.description,
            inputSchema: jsonSchema(schema as any),
            async execute(args, options) {
              const ctx = context(args, options)
              try {
                await Plugin.trigger(
                  "tool.execute.before",
                  {
                    tool: item.id,
                    sessionID: ctx.sessionID,
                    callID: ctx.callID,
                  },
                  {
                    args,
                  },
                )
                const result = await item.execute(args, ctx)
                await Plugin.trigger(
                  "tool.execute.after",
                  {
                    tool: item.id,
                    sessionID: ctx.sessionID,
                    callID: ctx.callID,
                  },
                  result,
                )
                return result
              } catch (error) {
                log.error("Tool execution failed", { 
                  tool: item.id, 
                  sessionID: ctx.sessionID, 
                  callID: ctx.callID,
                  error: error instanceof Error ? error.message : String(error) 
                })
                throw error // Re-throw execution errors
              }
            },
          })
        } catch (error) {
          log.error("Failed to register tool", { 
            tool: item?.id || 'unknown', 
            sessionID: input.session.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          })
          // Continue with other tools even if one fails to register
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      
      log.error("Failed to load tool registry tools", { 
        sessionID: input.session.id,
        agent: input.agent.name,
        modelProvider: input.model.providerID,
        modelID: input.model.api?.id || input.model.id,
        error: errorMessage,
        stack: errorStack
      })
      
      // Try to load with fallback parameters as a recovery mechanism
      try {
        log.info("Attempting fallback tool registry loading", { 
          sessionID: input.session.id 
        })
        
        const fallbackParams = { 
          providerID: input.model.providerID || "fallback", 
          modelID: "fallback" 
        }
        
        const fallbackTools = await ToolRegistry.tools(fallbackParams, input.agent)
        
        // Register only safe, essential tools from fallback
        for (const item of fallbackTools) {
          if (!item?.id || !["read", "write", "bash"].includes(item.id)) {
            continue // Only include essential tools in fallback
          }
          
          try {
            const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
            tools[item.id] = tool({
              id: item.id as any,
              description: item.description,
              inputSchema: jsonSchema(schema as any),
              async execute(args, options) {
                const ctx = context(args, options)
                try {
                  const result = await item.execute(args, ctx)
                  return result
                } catch (execError) {
                  log.error("Fallback tool execution failed", { 
                    tool: item.id, 
                    sessionID: ctx.sessionID, 
                    callID: ctx.callID,
                    error: execError instanceof Error ? execError.message : String(execError) 
                  })
                  throw execError
                }
              },
            })
          } catch (toolError) {
            log.warn("Failed to register fallback tool", { 
              tool: item.id, 
              sessionID: input.session.id,
              error: toolError instanceof Error ? toolError.message : String(toolError) 
            })
          }
        }
        
        log.info("Fallback tool loading completed", { 
          sessionID: input.session.id,
          loadedTools: Object.keys(tools).length 
        })
      } catch (fallbackError) {
        log.error("Fallback tool loading also failed", { 
          sessionID: input.session.id,
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        })
        // Continue without any registry tools if both primary and fallback fail
      }
    }

    // Load MCP tools with error handling
    try {
      const mcpTools = await MCP.tools()
      for (const [key, item] of Object.entries(mcpTools)) {
        const execute = item.execute
        if (!execute) continue

        try {
          // Wrap execute to add plugin hooks and format output
          item.execute = async (args, opts) => {
            const ctx = context(args, opts)

            try {
              await Plugin.trigger(
                "tool.execute.before",
                {
                  tool: key,
                  sessionID: ctx.sessionID,
                  callID: opts.toolCallId,
                },
                {
                  args,
                },
              )

              await ctx.ask({
                permission: key,
                metadata: {},
                patterns: ["*"],
                always: ["*"],
              })

              const result = await execute(args, opts)

              await Plugin.trigger(
                "tool.execute.after",
                {
                  tool: key,
                  sessionID: ctx.sessionID,
                  callID: opts.toolCallId,
                },
                result,
              )

              const textParts: string[] = []
              const attachments: MessageV2.FilePart[] = []

              for (const contentItem of result.content) {
                if (contentItem.type === "text") {
                  textParts.push(contentItem.text)
                } else if (contentItem.type === "image") {
                  attachments.push({
                    id: Identifier.ascending("part"),
                    sessionID: input.session.id,
                    messageID: input.processor.message.id,
                    type: "file",
                    mime: contentItem.mimeType,
                    url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
                  })
                } else if (contentItem.type === "resource") {
                  const { resource } = contentItem
                  if (resource.text) {
                    textParts.push(resource.text)
                  }
                  if (resource.blob) {
                    attachments.push({
                      id: Identifier.ascending("part"),
                      sessionID: input.session.id,
                      messageID: input.processor.message.id,
                      type: "file",
                      mime: resource.mimeType ?? "application/octet-stream",
                      url: `data:${resource.mimeType ?? "application/octet-stream"};base64,${resource.blob}`,
                      filename: resource.uri,
                    })
                  }
                }
              }

              // Safely truncate tool output with comprehensive error handling
              let truncated: Truncate.Result
              let truncationError: Error | undefined
              const originalOutput = textParts.join("\n\n")
              
              try {
                // Use proper truncation options with reasonable limits
                const truncateOptions: Truncate.Options = {
                  maxLines: Math.min(2000, Math.max(100, originalOutput.split('\n').length / 4)),
                  maxBytes: Math.min(50 * 1024, Math.max(10 * 1024, Buffer.byteLength(originalOutput, 'utf8') / 4)),
                  direction: "head"
                }
                
                truncated = await Truncate.output(originalOutput, truncateOptions, input.agent)
                
                log.debug("Tool output truncated successfully", { 
                  tool: key,
                  sessionID: ctx.sessionID,
                  originalLength: originalOutput.length,
                  truncatedLength: truncated.content.length,
                  wasTruncated: truncated.truncated
                })
              } catch (error) {
                truncationError = error instanceof Error ? error : new Error(String(error))
                log.error("Tool output truncation failed, using fallback", { 
                  tool: key, 
                  sessionID: ctx.sessionID, 
                  callID: opts.toolCallId,
                  error: truncationError.message,
                  originalLength: originalOutput.length
                })
                
                // Fallback: create a safe truncated version manually
                try {
                  const fallbackLines = originalOutput.split('\n')
                  const maxFallbackLines = 500
                  const maxFallbackBytes = 25 * 1024
                  
                  let fallbackContent = ""
                  let byteCount = 0
                  
                  for (let i = 0; i < Math.min(fallbackLines.length, maxFallbackLines); i++) {
                    const line = fallbackLines[i] + '\n'
                    const lineBytes = Buffer.byteLength(line, 'utf8')
                    
                    if (byteCount + lineBytes > maxFallbackBytes) {
                      break
                    }
                    
                    fallbackContent += line
                    byteCount += lineBytes
                  }
                  
                  const wasTruncated = fallbackLines.length > maxFallbackLines || byteCount >= maxFallbackBytes
                  const removedLines = fallbackLines.length - fallbackContent.split('\n').length
                  
                  if (wasTruncated) {
                    const truncationNotice = `\n\n...${removedLines} lines truncated due to truncation system error...\n\n` +
                      `Note: Output was truncated due to a system error in the truncation process. ` +
                      `The original output was ${originalOutput.length} characters. ` +
                      `Contact support if you need the complete output.`
                    
                    fallbackContent += truncationNotice
                  }
                  
                  truncated = {
                    content: fallbackContent,
                    truncated: wasTruncated,
                    outputPath: "" // No file path available in fallback mode
                  }
                } catch (fallbackError) {
                  // Ultimate fallback: use first 1000 characters
                  log.error("Fallback truncation also failed, using minimal fallback", { 
                    tool: key, 
                    sessionID: ctx.sessionID,
                    fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
                  })
                  
                  const minimalContent = originalOutput.length > 1000 
                    ? originalOutput.substring(0, 1000) + 
                      "\n\n...Output severely truncated due to multiple system errors...\n\n" +
                      `Original output was ${originalOutput.length} characters. ` +
                      `Both primary and fallback truncation systems failed.`
                    : originalOutput
                  
                  truncated = {
                    content: minimalContent,
                    truncated: originalOutput.length > 1000,
                    outputPath: ""
                  }
                }
              }
              
              const metadata = {
                ...(result.metadata ?? {}),
                truncated: truncated.truncated,
                ...(truncated.truncated && { outputPath: truncated.outputPath }),
                ...(truncationError && { 
                  truncationError: truncationError.message,
                  truncationFallback: true 
                })
              }

              return {
                title: "",
                metadata,
                output: truncated.content,
                attachments,
                content: result.content, // directly return content to preserve ordering when outputting to model
              }
            } catch (error) {
              log.error("MCP tool execution failed", { 
                tool: key, 
                sessionID: ctx.sessionID, 
                callID: opts.toolCallId,
                error: error instanceof Error ? error.message : String(error) 
              })
              throw error // Re-throw execution errors
            }
          }
          tools[key] = item
        } catch (error) {
          log.error("Failed to register MCP tool", { 
            tool: key, 
            sessionID: input.session.id,
            error: error instanceof Error ? error.message : String(error) 
          })
          // Continue with other MCP tools even if one fails to register
        }
      }
    } catch (error) {
      log.error("Failed to load MCP tools", { 
        sessionID: input.session.id,
        error: error instanceof Error ? error.message : String(error) 
      })
      // Continue without MCP tools if loading fails
    }

    return tools
  }

  async function createUserMessage(input: PromptInput) {
    const agent = await Agent.get(input.agent ?? (await lastAgent(input.sessionID)))
    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.name,
      model: input.model ?? agent.model ?? (await lastModel(input.sessionID)),
      system: input.system,
      variant: input.variant,
    }

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<MessageV2.Part[]> => {
        if (part.type === "file") {
          // before checking the protocol we check if this is an mcp resource because it needs special handling
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            log.info("mcp resource", { clientName, uri, mime: part.mime })

            const pieces: MessageV2.Part[] = [
              {
                id: Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]

            try {
              const resourceContent = await MCP.readResource(clientName, uri)
              if (!resourceContent) {
                throw new Error(`Resource not found: ${clientName}/${uri}`)
              }

              // Handle different content types
              const contents = Array.isArray(resourceContent.contents)
                ? resourceContent.contents
                : [resourceContent.contents]

              for (const content of contents) {
                if ("text" in content && content.text) {
                  pieces.push({
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: content.text as string,
                  })
                } else if ("blob" in content && content.blob) {
                  // Handle binary content if needed
                  const mimeType = "mimeType" in content ? content.mimeType : part.mime
                  pieces.push({
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary content: ${mimeType}]`,
                  })
                }
              }

              pieces.push({
                ...part,
                id: part.id ?? Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
              })
            } catch (error: unknown) {
              log.error("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                id: Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }

            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: Buffer.from(part.url, "base64url").toString(),
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }
              break
            case "file:":
              log.info("file", { mime: part.mime })
              // have to normalize, symbol search returns absolute paths
              // Decode the pathname since URL constructor doesn't automatically decode it
              const filepath = fileURLToPath(part.url)
              const stat = await Bun.file(filepath).stat()

              if (stat.isDirectory()) {
                part.mime = "application/x-directory"
              }

              if (part.mime === "text/plain") {
                let offset: number | undefined = undefined
                let limit: number | undefined = undefined
                const range = {
                  start: url.searchParams.get("start"),
                  end: url.searchParams.get("end"),
                }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  // some LSP servers (eg, gopls) don't give full range in
                  // workspace/symbol searches, so we'll try to find the
                  // symbol in the document to get the full range
                  if (start === end) {
                    const symbols = await LSP.documentSymbol(filePathURI)
                    for (const symbol of symbols) {
                      let range: LSP.Range | undefined
                      if ("range" in symbol) {
                        range = symbol.range
                      } else if ("location" in symbol) {
                        range = symbol.location.range
                      }
                      if (range?.start?.line && range?.start?.line === start) {
                        start = range.start.line
                        end = range?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start - 1, 0)
                  if (end) {
                    limit = end - offset
                  }
                }
                const args = { filePath: filepath, offset, limit }

                const pieces: MessageV2.Part[] = [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]

                await ReadTool.init()
                  .then(async (t) => {
                    const model = await Provider.getModel(info.model.providerID, info.model.modelID)
                    const readCtx: Tool.Context = {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent!,
                      messageID: info.id,
                      extra: { bypassCwdCheck: true, model },
                      metadata: async () => {},
                      ask: async () => {},
                    }
                    const result = await t.execute(args, readCtx)
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((attachment) => ({
                          ...attachment,
                          synthetic: true,
                          filename: attachment.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({
                        ...part,
                        id: part.id ?? Identifier.ascending("part"),
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })
                    }
                  })
                  .catch((error) => {
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : error.toString()
                    Bus.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({
                        message,
                      }).toObject(),
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  })

                return pieces
              }

              if (part.mime === "application/x-directory") {
                const args = { path: filepath }
                const listCtx: Tool.Context = {
                  sessionID: input.sessionID,
                  abort: new AbortController().signal,
                  agent: input.agent!,
                  messageID: info.id,
                  extra: { bypassCwdCheck: true },
                  metadata: async () => {},
                  ask: async () => {},
                }
                const result = await ListTool.init().then((t) => t.execute(args, listCtx))
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the list tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }

              const file = Bun.file(filepath)
              FileTime.read(input.sessionID, filepath)
              return [
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  text: `Called the Read tool with the following input: {\"filePath\":\"${filepath}\"}`,
                  synthetic: true,
                },
                {
                  id: part.id ?? Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url: `data:${part.mime};base64,` + Buffer.from(await file.bytes()).toString("base64"),
                  mime: part.mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
          }
        }

        if (part.type === "agent") {
          // Check if this agent would be denied by task permission
          const perm = PermissionNext.evaluate("task", part.name, agent.permission)
          const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            {
              id: Identifier.ascending("part"),
              ...part,
              messageID: info.id,
              sessionID: input.sessionID,
            },
            {
              id: Identifier.ascending("part"),
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              // An extra space is added here. Otherwise the 'Use' gets appended
              // to user's last word; making a combined word
              text:
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
                hint,
            },
          ]
        }

        return [
          {
            id: Identifier.ascending("part"),
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }),
    ).then((x) => x.flat())

    await Plugin.trigger(
      "chat.message",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        messageID: input.messageID,
        variant: input.variant,
      },
      {
        message: info,
        parts,
      },
    )

    await Session.updateMessage(info)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    const userText = parts
      .filter((p) => p.type === "text" && !p.ignored)
      .map((p) => (p as MessageV2.TextPart).text)
      .join("")

    const toolResultTokens = Token.calculateToolResultTokens(parts)
    const sentEstimate = Token.estimate(userText)

    await Session.updateMessage({
      ...info,
      tokens: {
        ...info.tokens,
        sent: sentEstimate,
      },
    } as MessageV2.User)

    return {
      info,
      parts,
    }
  }

  async function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info; session: Session.Info }) {
    const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
    if (!userMessage) return input.messages

    // Original logic when experimental plan mode is disabled
    if (!Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE) {
      if (input.agent.name === "plan") {
        userMessage.parts.push({
          id: Identifier.ascending("part"),
          messageID: userMessage.info.id,
          sessionID: userMessage.info.sessionID,
          type: "text",
          text: PROMPT_PLAN,
          synthetic: true,
        })
      }
      const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
      if (wasPlan && input.agent.name === "build") {
        userMessage.parts.push({
          id: Identifier.ascending("part"),
          messageID: userMessage.info.id,
          sessionID: userMessage.info.sessionID,
          type: "text",
          text: BUILD_SWITCH,
          synthetic: true,
        })
      }
      return input.messages
    }

    // New plan mode logic when flag is enabled
    const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")

    // Switching from plan mode to build mode
    if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
      try {
        const plan = Session.plan(input.session)
        let exists = false
        try {
          exists = await Bun.file(plan).exists()
        } catch (fileError) {
          log.error("Failed to check plan file existence", { 
            sessionID: input.session.id, 
            plan, 
            error: fileError instanceof Error ? fileError.message : String(fileError) 
          })
        }
        
        if (exists) {
          try {
            const part = await Session.updatePart({
              id: Identifier.ascending("part"),
              messageID: userMessage.info.id,
              sessionID: userMessage.info.sessionID,
              type: "text",
              text:
                BUILD_SWITCH + "\n\n" + `A plan file exists at ${plan}. You should execute on the plan defined within it`,
              synthetic: true,
            })
            userMessage.parts.push(part)
          } catch (partError) {
            log.error("Failed to update part for build switch reminder", { 
              sessionID: input.session.id, 
              error: partError instanceof Error ? partError.message : String(partError) 
            })
            // Continue without the reminder part if update fails
          }
        }
      } catch (error) {
        log.error("Failed to process plan mode to build mode switch", { 
          sessionID: input.session.id, 
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return input.messages
    }

    // Entering plan mode
    if (input.agent.name === "plan" && assistantMessage?.info.agent !== "plan") {
      try {
        const plan = Session.plan(input.session)
        let exists = false
        try {
          exists = await Bun.file(plan).exists()
        } catch (fileError) {
          log.error("Failed to check plan file existence in plan mode", { 
            sessionID: input.session.id, 
            plan, 
            error: fileError instanceof Error ? fileError.message : String(fileError) 
          })
        }
        
        // Create directory if plan file doesn't exist
        if (!exists) {
          try {
            await fs.mkdir(path.dirname(plan), { recursive: true })
          } catch (mkdirError) {
            log.error("Failed to create plan directory", { 
              sessionID: input.session.id, 
              plan: path.dirname(plan), 
              error: mkdirError instanceof Error ? mkdirError.message : String(mkdirError) 
            })
            // Continue even if directory creation fails
          }
        }
        
        try {
          const part = await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: userMessage.info.id,
            sessionID: userMessage.info.sessionID,
            type: "text",
            text: `<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received.

## Plan File Info:
${exists ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.` : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the explore subagent type.

1. Focus on understanding the user's request and the code associated with their request

2. **Launch up to 3 explore agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - 3 agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the question tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Launch general agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to 1 agent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 Plan agent for most tasks - it helps validate your understanding and consider alternatives
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)

Examples of when to use multiple agents:
- The task touches multiple parts of the codebase
- It's a large refactor or architectural change
- There are many edge cases to consider
- You'd benefit from exploring different approaches

Example perspectives by task type:
- New feature: simplicity vs performance vs maintainability
- Bug fix: root cause vs workaround vs prevention
- Refactoring: minimal change vs clean architecture

In the agent prompt:
- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use question tool to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified
- Include a verification section describing how to test the changes end-to-end (run the code, use MCP tools, run tests)

### Phase 5: Call plan_exit tool
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call plan_exit to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling plan_exit. Do not stop unless it's for these 2 reasons.

**Important:** Use question tool to clarify requirements/approach, use plan_exit to request plan approval. Do NOT use question tool to ask "Is this plan okay?" - that's what plan_exit does.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.
</system-reminder>`,
            synthetic: true,
          })
          userMessage.parts.push(part)
        } catch (partError) {
          log.error("Failed to update part for plan mode reminder", { 
            sessionID: input.session.id, 
            error: partError instanceof Error ? partError.message : String(partError) 
          })
          // Continue without the plan mode reminder if update fails
        }
      } catch (error) {
        log.error("Failed to process plan mode entry", { 
          sessionID: input.session.id, 
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return input.messages
    }
    return input.messages
  }

  export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string(),
  })
  export type ShellInput = z.infer<typeof ShellInput>
  export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }
    using _ = defer(() => cancel(input.sessionID))

    const session = await Session.get(input.sessionID)
    if (session.revert) {
      SessionRevert.cleanup(session)
    }
    const agent = await Agent.get(input.agent)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      role: "user",
      agent: input.agent,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
    }
    await Session.updateMessage(userMsg)
    const userPart: MessageV2.Part = {
      type: "text",
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: input.sessionID,
      text: "The following tool was executed by the user",
      synthetic: true,
    }
    await Session.updatePart(userPart)

    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      time: {
        created: Date.now(),
      },
      role: "assistant",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.modelID,
      providerID: model.providerID,
    }
    await Session.updateMessage(msg)
    const part: MessageV2.Part = {
      type: "tool",
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      tool: "bash",
      callID: ulid(),
      state: {
        status: "running",
        time: {
          start: Date.now(),
        },
        input: {
          command: input.command,
        },
      },
    }
    await Session.updatePart(part)
    const shell = Shell.preferred()
    const shellName = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()

    const invocations: Record<string, { args: string[] }> = {
      nu: {
        args: ["-c", input.command],
      },
      fish: {
        args: ["-c", input.command],
      },
      zsh: {
        args: [
          "-c",
          "-l",
          `
            [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
            [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      bash: {
        args: [
          "-c",
          "-l",
          `
            shopt -s expand_aliases
            [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      // Windows cmd
      cmd: {
        args: ["/c", input.command],
      },
      // Windows PowerShell
      powershell: {
        args: ["-NoProfile", "-Command", input.command],
      },
      pwsh: {
        args: ["-NoProfile", "-Command", input.command],
      },
      // Fallback: any shell that doesn't match those above
      //  - No -l, for max compatibility
      "": {
        args: ["-c", `${input.command}`],
      },
    }

    const matchingInvocation = invocations[shellName] ?? invocations[""]
    const args = matchingInvocation?.args

    const proc = spawn(shell, args, {
      cwd: Instance.directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM: "dumb",
      },
    })

    let output = ""

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    let aborted = false
    let exited = false

    const kill = () => Shell.killTree(proc, { exited: () => exited })

    if (abort.aborted) {
      aborted = true
      await kill()
    }

    const abortHandler = () => {
      aborted = true
      void kill()
    }

    abort.addEventListener("abort", abortHandler, { once: true })

    await new Promise<void>((resolve) => {
      proc.on("close", () => {
        exited = true
        abort.removeEventListener("abort", abortHandler)
        resolve()
      })
    })

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    if (part.state.status === "running") {
      part.state = {
        status: "completed",
        time: {
          ...part.state.time,
          end: Date.now(),
        },
        input: part.state.input,
        title: "",
        metadata: {
          output,
          description: "",
        },
        output,
      }
      await Session.updatePart(part)
    }
    return { info: msg, parts: [part] }
  }

  export const CommandInput = z.object({
    messageID: Identifier.schema("message").optional(),
    sessionID: Identifier.schema("session"),
    agent: z.string().optional(),
    model: z.string().optional(),
    arguments: z.string(),
    command: z.string(),
    variant: z.string().optional(),
    parts: z
      .array(
        z.discriminatedUnion("type", [
          MessageV2.FilePart.omit({
            messageID: true,
            sessionID: true,
          }).partial({
            id: true,
          }),
        ]),
      )
      .optional(),
  })
  export type CommandInput = z.infer<typeof CommandInput>
  const bashRegex = /!`([^`]+)`/g
  // Match [Image N] as single token, quoted strings, or non-space sequences
  const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
  const placeholderRegex = /\$(\d+)/g
  const quoteTrimRegex = /^["']|["']$/g
  /**
   * Regular expression to match @ file references in text
   * Matches @ followed by file paths, excluding commas, periods at end of sentences, and backticks
   * Does not match when preceded by word characters or backticks (to avoid email addresses and quoted references)
   */

  export async function command(input: CommandInput) {
    log.info("command", input)
    const command = await Command.get(input.command)
    const agentName = command.agent ?? input.agent ?? (await lastAgent(input.sessionID))

    const raw = input.arguments.match(argsRegex) ?? []
    const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))

    const templateCommand = await command.template

    const placeholders = templateCommand.match(placeholderRegex) ?? []
    let last = 0
    for (const item of placeholders) {
      const value = Number(item.slice(1))
      if (value > last) last = value
    }

    // Let the final placeholder swallow any extra arguments so prompts read naturally
    const withArgs = templateCommand.replaceAll(placeholderRegex, (_, index) => {
      const position = Number(index)
      const argIndex = position - 1
      if (argIndex >= args.length) return ""
      if (position === last) return args.slice(argIndex).join(" ")
      return args[argIndex]
    })
    const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
    let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

    // If command doesn't explicitly handle arguments (no $N or $ARGUMENTS placeholders)
    // but user provided arguments, append them to the template
    if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
      template = template + "\n\n" + input.arguments
    }

    const shell = ConfigMarkdown.shell(template)
    if (shell.length > 0) {
      const results = await Promise.all(
        shell.map(async ([, cmd]) => {
          try {
            return await $`${{ raw: cmd }}`.quiet().nothrow().text()
          } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
          }
        }),
      )
      let index = 0
      template = template.replace(bashRegex, () => results[index++])
    }
    template = template.trim()

    const taskModel = await (async () => {
      if (command.model) {
        return Provider.parseModel(command.model)
      }
      if (command.agent) {
        const cmdAgent = await Agent.get(command.agent)
        if (cmdAgent?.model) {
          return cmdAgent.model
        }
      }
      if (input.model) return Provider.parseModel(input.model)
      return await lastModel(input.sessionID)
    })()

    try {
      await Provider.getModel(taskModel.providerID, taskModel.modelID)
    } catch (e) {
      if (Provider.ModelNotFoundError.isInstance(e)) {
        const { providerID, modelID, suggestions } = e.data
        const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
        Bus.publish(Session.Event.Error, {
          sessionID: input.sessionID,
          error: new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }).toObject(),
        })
      }
      throw e
    }
    const agent = await Agent.get(agentName)
    if (!agent) {
      const available = await Agent.list().then((agents) => agents.filter((a) => !a.hidden).map((a) => a.name))
      const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
      const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
      Bus.publish(Session.Event.Error, {
        sessionID: input.sessionID,
        error: error.toObject(),
      })
      throw error
    }

    const templateParts = await resolvePromptParts(template)
    const isSubtask = (agent.mode === "subagent" && command.subtask !== false) || command.subtask === true
    const parts = isSubtask
      ? [
          {
            type: "subtask" as const,
            agent: agent.name,
            description: command.description ?? "",
            command: input.command,
            model: {
              providerID: taskModel.providerID,
              modelID: taskModel.modelID,
            },
            // TODO: how can we make task tool accept a more complex input?
            prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
          },
        ]
      : [...templateParts, ...(input.parts ?? [])]

    const userAgent = isSubtask ? (input.agent ?? (await Agent.defaultAgent())) : agentName
    const userModel = isSubtask
      ? input.model
        ? Provider.parseModel(input.model)
        : await lastModel(input.sessionID)
      : taskModel

    await Plugin.trigger(
      "command.execute.before",
      {
        command: input.command,
        sessionID: input.sessionID,
        arguments: input.arguments,
      },
      { parts },
    )

    const result = (await prompt({
      sessionID: input.sessionID,
      messageID: input.messageID,
      model: userModel,
      agent: userAgent,
      parts,
      variant: input.variant,
    })) as MessageV2.WithParts

    Bus.publish(Command.Event.Executed, {
      name: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      messageID: result.info.id,
    })

    return result
  }

  async function ensureTitle(input: {
    session: Session.Info
    history: MessageV2.WithParts[]
    providerID: string
    modelID: string
  }) {
    if (input.session.parentID) return
    if (!Session.isDefaultTitle(input.session.title)) return

    // Find first non-synthetic user message
    const firstRealUserIdx = input.history.findIndex(
      (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic),
    )
    if (firstRealUserIdx === -1) return

    const isFirst =
      input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
        .length === 1
    if (!isFirst) return

    // Gather all messages up to and including the first real user message for context
    // This includes any shell/subtask executions that preceded the user's first prompt
    const contextMessages = input.history.slice(0, firstRealUserIdx + 1)
    const firstRealUser = contextMessages[firstRealUserIdx]

    // For subtask-only messages (from command invocations), extract the prompt directly
    // since toModelMessage converts subtask parts to generic "The following tool was executed by the user"
    const subtaskParts = firstRealUser.parts.filter((p) => p.type === "subtask") as MessageV2.SubtaskPart[]
    const hasOnlySubtaskParts = subtaskParts.length > 0 && firstRealUser.parts.every((p) => p.type === "subtask")

    const agent = await Agent.get("title")
    if (!agent) return
    const model = await iife(async () => {
      if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
      return (
        (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
      )
    })
    const result = await LLM.stream({
      agent,
      user: firstRealUser.info as MessageV2.User,
      system: [],
      small: true,
      tools: {},
      model,
      abort: new AbortController().signal,
      sessionID: input.session.id,
      retries: 2,
      messages: [
        {
          role: "user",
          content: "Generate a title for this conversation:\n",
        },
        ...(hasOnlySubtaskParts
          ? [{ role: "user" as const, content: subtaskParts.map((p) => p.prompt).join("\n") }]
          : MessageV2.toModelMessages(contextMessages, model)),
      ],
    })
    const text = await result.text.catch((err) => log.error("failed to generate title", { error: err }))
    if (text)
      return Session.update(
        input.session.id,
        (draft) => {
          const cleaned = text
            .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0)
          if (!cleaned) return

          const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
          draft.title = title
        },
        { touch: false },
      )
  }
}
