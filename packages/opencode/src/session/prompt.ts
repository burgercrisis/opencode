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
import { InstructionPrompt } from "./instruction"
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
      for (const entry of Object.values(current)) {
        entry.abort.abort()
        for (const cb of entry.callbacks) {
          cb.reject()
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
        if (task.length > 0 && !lastFinished) {
          tasks.push(...(task as (MessageV2.CompactionPart | MessageV2.SubtaskPart)[]))
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
        if (!lastUser.model) {
          log.warn("Skipping title generation - no user model available", { sessionID })
        } else {
          ensureTitle({
            session,
            modelID: lastUser.model.modelID,
            providerID: lastUser.model.providerID,
            history: msgs,
          })
        }
      }

      // Type safety: Ensure lastUser.model exists before accessing properties
      if (!lastUser?.model) {
        throw new Error("No user model found for session processing")
      }
      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
      const task = tasks.pop()

        // pending subtask
        // TODO: centralize "invoke tool" logic
        if (task?.type === "subtask") {
          const taskToolInit = await TaskTool.init()
          const taskModel = task.model
            ? await Provider.getModel(task.model.providerID, task.model.modelID)
            : model
        
          const assistantMessage = (await Session.updateMessage({
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
          const part = (await Session.updatePart({
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
          const taskArgs = {
            prompt: task.prompt,
            description: task.description,
            subagent_type: task.agent,
            command: task.command,
          }
          await Plugin.trigger(
            "tool.execute.before",
            {
              tool: "task",
              sessionID,
              callID: part.id,
            },
            { args: taskArgs },
          )
          const taskAgent = await Agent.get(task.agent)
          const taskCtx: Tool.Context = {
            agent: task.agent,
            messageID: assistantMessage.id,
            sessionID: sessionID,
            abort,
            callID: part.id,
            messages: msgs,
            extra: { bypassAgentCheck: true },
            async metadata(input) {
              const currentState = part.state || ({} as any)
              await Session.updatePart({
                ...part,
                type: "tool",
                state: {
                  ...currentState,
                  ...input,
                },
              } satisfies MessageV2.ToolPart)
            },
            async ask(req) {
              await PermissionNext.ask({
                ...req,
                sessionID: sessionID,
                ruleset: PermissionNext.merge(taskAgent?.permission ?? [], session.permission ?? []),
              })
            },
          }
        
          let executionError: Error | undefined
          const result = await taskToolInit.execute(taskArgs, taskCtx).catch(async (error: unknown) => {
            executionError = error instanceof Error ? error : new Error(String(error))
            
            if (taskToolInit && typeof taskToolInit === "object" && "cleanup" in taskToolInit && typeof taskToolInit.cleanup === "function") {
              await taskToolInit.cleanup()
            }
            
            return undefined
          })

        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          result,
        )

        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        
        await Session.updateMessage(assistantMessage)
        
        if (result && part && part.state?.status === "running") {
          const currentState = part.state || {}
          const currentTime = currentState.time || {}
          
          await Session.updatePart({
            ...part,
            state: {
              status: "completed",
              input: currentState.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments: result.attachments,
              time: {
                ...currentTime,
                end: Date.now(),
              },
            },
          } satisfies MessageV2.ToolPart)
        }
        
        if (!result) {
          if (part && part.state) {
            const currentState = part.state as any
            const currentTime = currentState.time || {}
            
            await Session.updatePart({
              ...part,
              state: {
                status: "error",
                error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
                time: {
                  start: currentState.status === "running" && currentTime.start ? currentTime.start : Date.now(),
                  end: Date.now(),
                },
                metadata: (part as any).metadata,
                input: currentState.input,
              },
            } satisfies MessageV2.ToolPart)
          }
        }

        if (task.command) {
          if (lastUser?.agent && lastUser?.model) {
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
          }
        }

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto ?? false,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (lastFinished && lastFinished.summary !== true) {
        if (lastFinished.tokens && await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })) {
          await SessionCompaction.create({
            sessionID,
            agent: lastUser.agent,
            model: lastUser.model,
            auto: true,
          })
          continue
        }
      }

      // normal processing
      const agent = await Agent.get(lastUser.agent ?? await lastAgent(sessionID))
      const maxSteps = agent.steps ?? Infinity
      const isLastStep = step >= maxSteps

      msgs = await insertReminders({
        messages: msgs,
        agent,
        session,
      })

      const assistantMessage = (await Session.updateMessage({
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

      const processor = SessionProcessor.create({
        assistantMessage,
        sessionID: sessionID,
        model,
        abort,
      })
      using _ = defer(() => InstructionPrompt.clear(processor.message.id))

      // Check if user explicitly invoked an agent via @ in this turn
      const lastUserMsg = msgs.findLast((m) => m.info?.role === "user")
      const bypassAgentCheck = lastUserMsg?.parts && Array.isArray(lastUserMsg.parts) 
        ? lastUserMsg.parts.some((p) => p.type === "agent") 
        : false

      const tools = await resolveTools({
        agent,
        session,
        model,
        tools: lastUser.tools,
        processor,
        bypassAgentCheck,
        messages: msgs,
      })

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      const sessionMessages = clone(msgs)

      // Ephemerally wrap queued user messages with a reminder to stay on track
      if (step > 1 && lastFinished) {
        for (const msg of sessionMessages) {
          if (!msg.info || msg.info.role !== "user" || !lastFinished.id || msg.info.id <= lastFinished.id) continue
          if (!msg.parts || !Array.isArray(msg.parts)) continue
          
          for (const part of msg.parts) {
            if (!part || part.type !== "text" || part.ignored || part.synthetic) continue
            if (typeof part.text !== "string" || !part.text.trim()) continue
            
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

      await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })

      const systemPrompts = [...(await SystemPrompt.environment(model)), ...(await SystemPrompt.custom())]

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system: [...systemPrompts, ...(await InstructionPrompt.system())],
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

      if (result === "stop") break
      if (result === "compact") {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
      }
      continue
    } catch (loopError) {
      log.error("Unexpected error in main loop, attempting to continue", { 
        sessionID, 
        step,
        error: loopError instanceof Error ? loopError.message : String(loopError) 
      })
      
      const filteredMessages = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      const lastUserMessage = filteredMessages.findLast(msg => msg.info?.role === "user")
      const parentID = lastUserMessage?.info?.id || ""

      const defaultModel = await Provider.defaultModel()

      const fallbackMessage = await Session.updateMessage({
        id: Identifier.ascending("message"),
        parentID,
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
        modelID: defaultModel.modelID,
        providerID: defaultModel.providerID,
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
    }
  }

  SessionCompaction.prune({ sessionID })

  const messageStream = MessageV2.stream(sessionID)
  
  for await (const item of messageStream) {
    if (!item.info || item.info.role === "user") continue
    
    const queued = state()[sessionID]?.callbacks ?? []
    for (const q of queued) {
      q.resolve(item)
    }
    
    return item
  }
  throw new Error("Impossible")
})

  async function lastModel(sessionID: string) {
    try {
      const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      // Iterate backwards to find the most recent user message with a model
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        // Type safety: Ensure msg.info and msg.info.model exist before accessing properties
        if (msg.info?.role === "user" && msg.info.model) {
          // Verify that the model still exists and is accessible
          try {
            await Provider.getModel(msg.info.model.providerID, msg.info.model.modelID)
            log.debug("Found last used model", { 
              sessionID, 
              providerID: msg.info.model.providerID, 
              modelID: msg.info.model.modelID 
            })
            return msg.info.model
          } catch (modelError) {
            log.warn("Last used model is not available, continuing search", { 
              sessionID, 
              providerID: msg.info.model.providerID, 
              modelID: msg.info.model.modelID,
              error: modelError instanceof Error ? modelError.message : String(modelError)
            })
          }
        }
      }
    } catch (error) {
      log.error("Error in lastModel, falling back to default model", { 
        sessionID, 
        error: error instanceof Error ? error.message : String(error) 
      })
    }
    
    try {
      const defaultModel = await Provider.defaultModel()
      log.info("Using default model as fallback", { 
        sessionID, 
        providerID: defaultModel.providerID, 
        modelID: defaultModel.modelID 
      })
      return defaultModel
    } catch (defaultError) {
      log.error("Failed to get default model, attempting to find any available model", { 
        sessionID, 
        error: defaultError instanceof Error ? defaultError.message : String(defaultError) 
      })
      
      try {
        // Try to get any available model as a last resort
        const providers = await Provider.list()
        for (const provider of Object.values(providers) as any[]) {
          const models = Object.values(provider.models || {}) as any[]
          if (models.length > 0) {
            const fallbackModel = {
              providerID: provider.id,
              modelID: models[0].id
            }
            return fallbackModel
          }
        }
      } catch (anyError) {
        log.error("Failed to find any available model", { 
          sessionID, 
          error: anyError instanceof Error ? anyError.message : String(anyError) 
        })
      }
      
      const ultimateFallback = {
        providerID: "openai",
        modelID: "gpt-4"
      }
      return ultimateFallback
    }
  }

  async function lastAgent(sessionID: string) {
    const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.info?.role === "user" && msg.info.agent) {
        const agent = await Agent.get(msg.info.agent)
        if (agent && agent.hidden !== true) return msg.info.agent
      }
    }
    
    const defaultAgentName = await Agent.defaultAgent()
    return defaultAgentName
  }

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    session: Session.Info
    tools?: Record<string, boolean>
    processor: SessionProcessor.Info
    bypassAgentCheck: boolean
    messages: MessageV2.WithParts[]
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
      messages: input.messages,
      metadata: async (val: { title?: string; metadata?: any }) => {
        const match = input.processor.partFromToolCall(options.toolCallId)
        if (!match) return
        
        if (match.state?.status === "running") {
          const currentState = match.state || {}
          await Session.updatePart({
            ...match,
            state: {
              ...currentState,
              ...val,
            },
          })
        }
      },
      async ask(req) {
        await PermissionNext.ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: PermissionNext.merge(input.agent.permission || [], input.session.permission || []),
        })
      },
    })

    const modelParams = input.model.api?.id
      ? { providerID: input.model.providerID, modelID: input.model.api.id }
      : { providerID: input.model.providerID, modelID: input.model.id || input.model.providerID || "unknown" }
    
    const registryTools = await ToolRegistry.tools(modelParams, input.agent)
    
    for (const item of registryTools) {
      if (!item?.id || !item.parameters || !item.description || !item.execute) continue

      const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
      tools[item.id] = tool({
        id: item.id as any,
        description: item.description,
        inputSchema: jsonSchema(schema as any),
        async execute(args, options) {
          const ctx = context(args, options)
          await Plugin.trigger("tool.execute.before", {
            tool: item.id,
            sessionID: ctx.sessionID,
            callID: ctx.callID,
          }, { args })
          
          const executionResult = await item.execute(args, ctx)
          
          await Plugin.trigger("tool.execute.after", {
            tool: item.id,
            sessionID: ctx.sessionID,
            callID: ctx.callID,
          }, executionResult)
          
          return executionResult
        },
      })
    }

    try {
      const mcpTools = await MCP.tools()
      for (const [key, item] of Object.entries(mcpTools) as [string, any][]) {
        try {
          if (!item?.execute) continue

          const execute = item.execute
          item.execute = async (args: any, opts: any) => {
            try {
              const ctx = context(args, opts)

              await Plugin.trigger("tool.execute.before", {
                tool: key,
                sessionID: ctx.sessionID,
                callID: opts.toolCallId,
              }, { args })

              await ctx.ask({
                permission: key,
                metadata: {},
                patterns: ["*"],
                always: ["*"],
              })

              const result = await execute(args, opts)

              await Plugin.trigger("tool.execute.after", {
                tool: key,
                sessionID: ctx.sessionID,
                callID: opts.toolCallId,
              }, result)

              const textParts: string[] = []
              const attachments: MessageV2.FilePart[] = []

              if (result?.content) {
                for (const contentItem of result.content) {
                  if (!contentItem?.type) continue

                  if (contentItem.type === "text" && typeof contentItem.text === "string") {
                    textParts.push(contentItem.text)
                  } else if (contentItem.type === "image" && contentItem.mimeType && contentItem.data) {
                    attachments.push({
                      id: Identifier.ascending("part"),
                      sessionID: input.session.id,
                      messageID: input.processor.message.id,
                      type: "file",
                      mime: contentItem.mimeType,
                      url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
                    })
                  } else if (contentItem.type === "resource" && contentItem.resource) {
                    const { resource } = contentItem
                    if (resource.text && typeof resource.text === "string") {
                      textParts.push(resource.text)
                    }
                    if (resource.blob && resource.uri) {
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
              }

              // Safely truncate tool output with comprehensive error handling
              let truncated: Truncate.Result
              let truncationError: Error | undefined
              const originalOutput = textParts.join("\n\n")

              try {
                // Use proper truncation options with reasonable limits
                const truncateOptions: Truncate.Options = {
                  maxLines: Math.min(2000, Math.max(100, originalOutput.split("\n").length / 4)),
                  maxBytes: Math.min(50 * 1024, Math.max(10 * 1024, Buffer.byteLength(originalOutput, "utf8") / 4)),
                  direction: "head",
                }

                truncated = await Truncate.output(originalOutput, truncateOptions, input.agent)

                log.debug("Tool output truncated successfully", {
                  tool: key,
                  sessionID: ctx.sessionID,
                  originalLength: originalOutput.length,
                  truncatedLength: truncated.content.length,
                  wasTruncated: truncated.truncated,
                })
              } catch (error) {
                truncationError = error instanceof Error ? error : new Error(String(error))
                log.error("Tool output truncation failed, using fallback", {
                  tool: key,
                  sessionID: ctx.sessionID,
                  callID: opts.toolCallId,
                  error: truncationError.message,
                  originalLength: originalOutput.length,
                })

                // Fallback: create a safe truncated version manually
                try {
                  const fallbackLines = originalOutput.split("\n")
                  const maxFallbackLines = 500
                  const maxFallbackBytes = 25 * 1024

                  let fallbackContent = ""
                  let byteCount = 0

                  for (let i = 0; i < Math.min(fallbackLines.length, maxFallbackLines); i++) {
                    const line = fallbackLines[i] + "\n"
                    const lineBytes = Buffer.byteLength(line, "utf8")

                    if (byteCount + lineBytes > maxFallbackBytes) {
                      break
                    }

                    fallbackContent += line
                    byteCount += lineBytes
                  }

                  const wasTruncated = fallbackLines.length > maxFallbackLines || byteCount >= maxFallbackBytes
                  const removedLines = fallbackLines.length - fallbackContent.split("\n").length

                  if (wasTruncated) {
                    const truncationNotice =
                      `\n\n...${removedLines} lines truncated due to truncation system error...\n\n` +
                      `Note: Output was truncated due to a system error in the truncation process. ` +
                      `The original output was ${originalOutput.length} characters. ` +
                      `Contact support if you need the complete output.`

                    fallbackContent += truncationNotice
                  }

                  truncated = {
                    content: fallbackContent,
                    truncated: wasTruncated,
                    outputPath: "", // No file path available in fallback mode
                  }
                } catch (fallbackError) {
                  // Ultimate fallback: use first 1000 characters
                  log.error("Fallback truncation also failed, using minimal fallback", {
                    tool: key,
                    sessionID: ctx.sessionID,
                    fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                  })

                  const minimalContent =
                    originalOutput.length > 1000
                      ? originalOutput.substring(0, 1000) +
                        "\n\n...Output severely truncated due to multiple system errors...\n\n" +
                        `Original output was ${originalOutput.length} characters. ` +
                        `Both primary and fallback truncation systems failed.`
                      : originalOutput

                  truncated = {
                    content: minimalContent,
                    truncated: originalOutput.length > 1000,
                    outputPath: "",
                  }
                }
              }

              const metadata = {
                ...(result.metadata ?? {}),
                truncated: truncated.truncated,
                ...(truncated.truncated && { outputPath: truncated.outputPath }),
                ...(truncationError && {
                  truncationError: truncationError.message,
                  truncationFallback: true,
                }),
              }

              return {
                title: "",
                metadata,
                output: truncated.content,
                attachments,
                content: result.content, // directly return content to preserve ordering when outputting to model
              }
            } catch (error) {
              const ctx = context(args, opts)
              log.error("MCP tool execution failed", {
                tool: key,
                sessionID: ctx.sessionID,
                callID: opts.toolCallId,
                error: error instanceof Error ? error.message : String(error),
              })
              throw error // Re-throw execution errors
            }
          }
          tools[key] = item as any
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
    let agent: Agent.Info
    let agentName: string
    
    // Resolve agent with robust fallback logic
    if (input.agent) {
      try {
        agent = await Agent.get(input.agent)
        agentName = input.agent
        log.debug("Using explicitly provided agent", { 
          sessionID: input.sessionID, 
          agent: agentName 
        })
      } catch (error) {
        log.error("Failed to get explicitly provided agent, falling back to last agent", { 
          sessionID: input.sessionID, 
          requestedAgent: input.agent,
          error: error instanceof Error ? error.message : String(error) 
        })
        agentName = await lastAgent(input.sessionID)
        agent = await Agent.get(agentName)
      }
    } else {
      agentName = await lastAgent(input.sessionID)
      agent = await Agent.get(agentName)
    }

    // Resolve model with robust fallback logic
    let model: { providerID: string; modelID: string }
    if (input.model) {
      // Use explicitly provided model
      model = input.model
      log.debug("Using explicitly provided model", { 
        sessionID: input.sessionID, 
        providerID: model.providerID, 
        modelID: model.modelID 
      })
    } else if (agent.model) {
      // Use agent's default model
      model = agent.model
      log.debug("Using agent default model", { 
        sessionID: input.sessionID, 
        agent: agent.name,
        providerID: model.providerID, 
        modelID: model.modelID 
      })
    } else {
      // Fall back to last used model
      model = await lastModel(input.sessionID)
    }

    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.name,
      model: model,
      system: input.system,
      variant: input.variant,
    }
    using _ = defer(() => InstructionPrompt.clear(info.id))

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<MessageV2.Part[]> => {
        if (part.type === "file") {
          // before checking the protocol we check if this is an mcp resource because it needs special handling
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            
            // Type safety: Ensure clientName and uri exist
            if (!clientName || !uri) {
              log.error("MCP resource missing clientName or uri", { 
                clientName, 
                uri, 
                mime: part.mime 
              })
              return []
            }
            
            log.info("mcp resource", { clientName, uri, mime: part.mime })

            const pieces: MessageV2.Part[] = [
              {
                id: Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename || 'unknown'} (${uri})`,
              },
            ]

            try {
              let resourceContent: any
              try {
                resourceContent = await MCP.readResource(clientName, uri)
              } catch (readError) {
                log.error("Failed to read MCP resource", { 
                  clientName, 
                  uri, 
                  error: readError instanceof Error ? readError.message : String(readError)
                })
                throw new Error(`MCP resource read failed: ${clientName}/${uri}`)
              }
              
              if (!resourceContent) {
                throw new Error(`Resource not found: ${clientName}/${uri}`)
              }

              // Handle different content types with proper error handling
              let contents: any[]
              try {
                contents = Array.isArray(resourceContent.contents)
                  ? resourceContent.contents
                  : [resourceContent.contents]
              } catch (contentsError) {
                log.error("Failed to process MCP resource contents", { 
                  clientName, 
                  uri, 
                  error: contentsError instanceof Error ? contentsError.message : String(contentsError)
                })
                throw new Error(`Invalid resource contents structure: ${clientName}/${uri}`)
              }

              // Type safety: Ensure contents exists and is iterable
              if (contents && Array.isArray(contents)) {
                for (const content of contents) {
                  if (!content) continue
                  
                  try {
                    if ("text" in content && content.text && typeof content.text === 'string') {
                      pieces.push({
                        id: Identifier.ascending("part"),
                        messageID: info.id,
                        sessionID: input.sessionID,
                        type: "text",
                        synthetic: true,
                        text: content.text,
                      })
                    } else if ("blob" in content && content.blob) {
                      // Handle binary content with proper validation
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
                  } catch (contentError) {
                    log.error("Failed to process MCP content item", { 
                      clientName, 
                      uri, 
                      error: contentError instanceof Error ? contentError.message : String(contentError)
                    })
                    // Continue with other content items
                  }
                }
              }

              pieces.push({
                ...part,
                id: part.id ?? Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
              })
            } catch (error: unknown) {
              log.error("Failed to read MCP resource", { 
                clientName, 
                uri, 
                error: error instanceof Error ? error.message : String(error) 
              })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                id: Identifier.ascending("part"),
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename || 'unknown'}: ${message}`,
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
              
              // Type safety: Handle file stat errors gracefully
              let stat: any
              try {
                stat = await Bun.file(filepath).stat()
              } catch (fileError) {
                log.error("Failed to stat file", { 
                  filepath, 
                  error: fileError instanceof Error ? fileError.message : String(fileError)
                })
                stat = { isDirectory: () => false }
              }

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
                
                // Type safety: Safely parse range values
                if (range.start != null && range.start !== null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start, 10)
                  let end = range.end ? parseInt(range.end, 10) : undefined
                  
                  // Validate parsed values
                  if (!isNaN(start)) {
                    // some LSP servers (eg, gopls) don't give full range in
                    // workspace/symbol searches, so we'll try to find the
                    // symbol in the document to get the full range
                    if (start === end && end !== undefined) {
                      try {
                        const symbols = await LSP.documentSymbol(filePathURI)
                        if (Array.isArray(symbols)) {
                          for (const symbol of symbols) {
                            let range: LSP.Range | undefined
                            if ("range" in symbol && symbol.range) {
                              range = symbol.range
                            } else if ("location" in symbol && symbol.location?.range) {
                              range = symbol.location.range
                            }
                            if (range?.start?.line && range?.start?.line === start) {
                              start = range.start.line
                              end = range?.end?.line ?? start
                              break
                            }
                          }
                        }
                      } catch (symbolError) {
                        log.warn("Failed to get document symbols", { 
                          filePathURI, 
                          error: symbolError instanceof Error ? symbolError.message : String(symbolError)
                        })
                      }
                    }
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

                try {
                  const t = await ReadTool.init()
                  
                  // Type safety: Ensure info.model exists
                  if (!info.model) {
                    throw new Error("No model available for read tool context")
                  }
                  
                  const model = await Provider.getModel(info.model.providerID, info.model.modelID)
                  const readCtx: Tool.Context = {
                    sessionID: input.sessionID,
                    abort: new AbortController().signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true, model },
                    messages: [],
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
                        filename: attachment.filename ?? (part as any).filename,
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
                } catch (error) {
                  log.error("failed to read file", { error, filepath })
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
                }

                return pieces
              }

              if (part.mime === "application/x-directory") {
                try {
                  const args = { path: filepath }
                  const listCtx: Tool.Context = {
                    sessionID: input.sessionID,
                    abort: new AbortController().signal,
                    agent: input.agent!,
                    messageID: info.id,
                    messages: [], // Added missing property
                    callID: Identifier.ascending("call"), // Added missing property
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
                } catch (listError) {
                  log.error("Failed to list directory", { 
                    filepath, 
                    error: listError instanceof Error ? listError.message : String(listError)
                  })
                  // Fallback: return basic directory info
                  return [
                    {
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Failed to list directory ${filepath}: ${listError instanceof Error ? listError.message : String(listError)}`,
                    },
                  ]
                }
              }

              try {
                const file = Bun.file(filepath)
                let fileData: Uint8Array
                
                try {
                  fileData = await file.bytes()
                  FileTime.read(input.sessionID, filepath)
                } catch (readError) {
                  log.error("Failed to read file data", { 
                    filepath, 
                    error: readError instanceof Error ? readError.message : String(readError)
                  })
                  throw readError
                }
                
                let base64Data: string
                try {
                  base64Data = Buffer.from(fileData).toString("base64")
                } catch (encodeError) {
                  log.error("Failed to encode file data to base64", { 
                    filepath, 
                    error: encodeError instanceof Error ? encodeError.message : String(encodeError)
                  })
                  throw encodeError
                }
                
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
                    url: `data:${part.mime};base64,` + base64Data,
                    mime: part.mime,
                    filename: part.filename || filepath.split('/').pop() || 'unknown',
                    source: part.source,
                  },
                ]
              } catch (fileError) {
                log.error("Failed to read file for base64 encoding", { 
                  filepath, 
                  error: fileError instanceof Error ? fileError.message : String(fileError)
                })
                // Fallback: return error message
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Failed to read file ${filepath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
                  },
                ]
              } finally {
                // Ensure any temporary resources are cleaned up
                // Note: Bun automatically manages the file resources, but we ensure proper error handling
              }
          }
        }

        if (part.type === "agent") {
          // Type safety: Ensure part.name exists
          if (!part.name) {
            log.error("Agent part missing name", { sessionID: input.sessionID })
            return []
          }
          
          // Check if this agent would be denied by task permission
          const agentPermission = agent.permission || []
          const perm = PermissionNext.evaluate("task", part.name, agentPermission)
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
    const userMessage = input.messages.findLast((msg) => msg.info?.role === "user")
    if (!userMessage) return input.messages

    // Type safety: Ensure userMessage.info exists before accessing properties
    if (!userMessage.info) {
      log.error("User message missing info", { sessionID: input.session.id })
      return input.messages
    }

    // Type safety: Ensure userMessage.parts exists and is an array
    if (!userMessage.parts || !Array.isArray(userMessage.parts)) {
      userMessage.parts = []
    }

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
      const wasPlan = input.messages.some((msg) => msg.info?.role === "assistant" && msg.info?.agent === "plan")
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
    const assistantMessage = input.messages.findLast((msg) => msg.info?.role === "assistant")

    // Switching from plan mode to build mode
    if (input.agent.name !== "plan" && assistantMessage?.info?.agent === "plan") {
      try {
        const plan = Session.plan(input.session as any)
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
    if (input.agent.name === "plan" && assistantMessage?.info?.agent !== "plan") {
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
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received.

## Plan File Info:
${exists ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.` : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the explore subagent type.

1. Focus on understanding the user's request and code associated with their request

2. **Launch up to 3 explore agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - 3 agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the question tool to clarify ambiguities in user request up front.

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
- Include paths of critical files to be modified
- Include a verification section describing how to test the changes end-to-end (run the code, use MCP tools, run tests)

### Phase 5: Call plan_exit tool
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call plan_exit to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking to user a question or calling plan_exit. Do not stop unless it's for these 2 reasons.

**Important:** Use question tool to clarify requirements/approach, use plan_exit to request plan approval. Do NOT use question tool to ask "Is this plan okay?" - that's what plan_exit does.

NOTE: At any point in time through this workflow you should feel free to ask user questions or clarifications. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.
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
        
    // Switching from plan mode to build mode
    if (input.agent.name !== "plan" && assistantMessage?.info?.agent === "plan") {
      try {
        const plan = Session.plan(input.session as any)
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
    if (input.agent.name === "plan" && assistantMessage?.info?.agent !== "plan") {
      try {
        const plan = Session.plan(input.session as any)
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
      await SessionRevert.cleanup(session)
    }
    
    // Resolve agent with validation
    let agent: Agent.Info
    try {
      agent = await Agent.get(input.agent)
      log.debug("Using explicitly provided agent for shell", { 
        sessionID: input.sessionID, 
        agent: input.agent 
      })
    } catch (error) {
      log.error("Failed to get agent for shell, falling back to last agent", { 
        sessionID: input.sessionID, 
        requestedAgent: input.agent,
        error: error instanceof Error ? error.message : String(error) 
      })
      const fallbackAgentName = await lastAgent(input.sessionID)
      agent = await Agent.get(fallbackAgentName)
    }
    
    // Resolve model with robust fallback logic
    let model: { providerID: string; modelID: string }
    if (input.model) {
      model = input.model
      log.debug("Using explicitly provided model for shell", { 
        sessionID: input.sessionID, 
        providerID: model.providerID, 
        modelID: model.modelID 
      })
    } else if (agent.model) {
      model = agent.model
      log.debug("Using agent default model for shell", { 
        sessionID: input.sessionID, 
        agent: agent.name,
        providerID: model.providerID, 
        modelID: model.modelID 
      })
    } else {
      model = await lastModel(input.sessionID)
      log.debug("Using last model for shell", { 
        sessionID: input.sessionID, 
        providerID: model.providerID, 
        modelID: model.modelID 
      })
    }
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
    let stdoutStream: NodeJS.ReadableStream | null = null
    let stderrStream: NodeJS.ReadableStream | null = null
    let aborted = false
    let exited = false

    // Resource cleanup function
    const cleanupStreams = () => {
      try {
        if (stdoutStream) {
          stdoutStream.removeAllListeners()
          ;(stdoutStream as any).destroy?.()
        }
        if (stderrStream) {
          stderrStream.removeAllListeners()
          ;(stderrStream as any).destroy?.()
        }
        if (proc && !proc.killed) {
          proc.kill('SIGTERM')
        }
      } catch (cleanupError) {
        log.error("Error during process cleanup", { 
          sessionID: input.sessionID,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        })
      }
    }

    try {
      stdoutStream = proc.stdout
      stderrStream = proc.stderr

      if (stdoutStream) {
        stdoutStream.on("data", (chunk) => {
          try {
            if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
              output += chunk.toString()
              
              // Type safety: Ensure part.state exists before accessing properties
              if (part.state?.status === "running") {
                part.state.metadata = {
                  output: output,
                  description: "",
                }
                Session.updatePart(part).catch((error) => {
                  log.error("Failed to update part during stdout processing", { 
                    sessionID: input.sessionID, 
                    error: error instanceof Error ? error.message : String(error) 
                  })
                })
              }
            }
          } catch (dataError) {
            log.error("Error processing stdout data", { 
              sessionID: input.sessionID,
              error: dataError instanceof Error ? dataError.message : String(dataError)
            })
          }
        })

        stdoutStream.on("error", (error) => {
          log.error("Stdout stream error", { 
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      }

      if (stderrStream) {
        stderrStream.on("data", (chunk) => {
          try {
            if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
              output += chunk.toString()
              
              // Type safety: Ensure part.state exists before accessing properties
              if (part.state?.status === "running") {
                part.state.metadata = {
                  output: output,
                  description: "",
                }
                Session.updatePart(part).catch((error) => {
                  log.error("Failed to update part during stderr processing", { 
                    sessionID: input.sessionID, 
                    error: error instanceof Error ? error.message : String(error) 
                  })
                })
              }
            }
          } catch (dataError) {
            log.error("Error processing stderr data", { 
              sessionID: input.sessionID,
              error: dataError instanceof Error ? dataError.message : String(dataError)
            })
          }
        })

        stderrStream.on("error", (error) => {
          log.error("Stderr stream error", { 
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      }

      const kill = () => {
        try {
          Shell.killTree(proc, { exited: () => exited })
        } catch (killError) {
          log.error("Error killing process", { 
            sessionID: input.sessionID,
            error: killError instanceof Error ? killError.message : String(killError)
          })
        }
      }

      if (abort.aborted) {
        aborted = true
        await kill()
      }

      const abortHandler = () => {
        aborted = true
        void kill()
      }

      abort.addEventListener("abort", abortHandler, { once: true })

      await new Promise<void>((resolve, reject) => {
        proc.on("close", (code, signal) => {
          try {
            exited = true
            abort.removeEventListener("abort", abortHandler)
            
            // Log process exit information for debugging
            log.debug("Process closed", { 
              sessionID: input.sessionID,
              code,
              signal,
              aborted
            })
            
            resolve()
          } catch (closeError) {
            reject(closeError)
          }
        })

        proc.on("error", (error) => {
          try {
            log.error("Process error", { 
              sessionID: input.sessionID,
              error: error instanceof Error ? error.message : String(error)
            })
            cleanupStreams()
            reject(error)
          } catch (handlerError) {
            log.error("Error in process error handler", { 
              sessionID: input.sessionID,
              error: handlerError instanceof Error ? handlerError.message : String(handlerError)
            })
            reject(handlerError)
          }
        })
      })

    } catch (processError) {
      log.error("Error setting up process streams", { 
        sessionID: input.sessionID,
        error: processError instanceof Error ? processError.message : String(processError)
      })
      cleanupStreams()
      throw processError
    }

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }

    // Ensure streams are cleaned up
    cleanupStreams()
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    
    // Type safety: Ensure part.state exists before accessing properties
    if (part.state?.status === "running") {
      const currentState = part.state || {}
      const currentTime = currentState.time || {}
      
      part.state = {
        status: "completed",
        time: {
          ...currentTime,
          end: Date.now(),
        },
        input: currentState.input,
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
    
    // Resolve agent with robust fallback logic
    let agentName: string
    if (command.agent) {
      agentName = command.agent
      log.debug("Using command-specified agent", { 
        sessionID: input.sessionID, 
        command: input.command,
        agent: agentName 
      })
    } else if (input.agent) {
      try {
        // Verify that the explicitly provided agent exists
        await Agent.get(input.agent)
        agentName = input.agent
        log.debug("Using explicitly provided agent", { 
          sessionID: input.sessionID, 
          command: input.command,
          agent: agentName 
        })
      } catch (error) {
        log.error("Failed to get explicitly provided agent for command, falling back to last agent", { 
          sessionID: input.sessionID, 
          command: input.command,
          requestedAgent: input.agent,
          error: error instanceof Error ? error.message : String(error) 
        })
        agentName = await lastAgent(input.sessionID)
      }
    } else {
      agentName = await lastAgent(input.sessionID)
      log.debug("Using last agent for command", { 
        sessionID: input.sessionID, 
        command: input.command,
        agent: agentName 
      })
    }

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
      try {
        if (command.model) {
          const model = Provider.parseModel(command.model)
          log.debug("Using command-specified model", { 
            sessionID: input.sessionID, 
            command: input.command,
            providerID: model.providerID, 
            modelID: model.modelID 
          })
          return model
        }
        
        if (command.agent) {
          try {
            const cmdAgent = await Agent.get(command.agent)
            if (cmdAgent?.model) {
              log.debug("Using command agent model", { 
                sessionID: input.sessionID, 
                command: input.command,
                agent: command.agent,
                providerID: cmdAgent.model.providerID, 
                modelID: cmdAgent.model.modelID 
              })
              return cmdAgent.model
            }
          } catch (agentError) {
            log.warn("Failed to get command agent for model resolution", { 
              sessionID: input.sessionID, 
              command: input.command,
              agent: command.agent,
              error: agentError instanceof Error ? agentError.message : String(agentError)
            })
          }
        }
        
        if (input.model) {
          const model = Provider.parseModel(input.model)
          log.debug("Using explicitly provided model", { 
            sessionID: input.sessionID, 
            command: input.command,
            providerID: model.providerID, 
            modelID: model.modelID 
          })
          return model
        }
        
        const lastModelResult = await lastModel(input.sessionID)
        log.debug("Using last resolved model", { 
          sessionID: input.sessionID, 
          command: input.command,
          providerID: lastModelResult.providerID, 
          modelID: lastModelResult.modelID 
        })
        return lastModelResult
      } catch (modelError) {
        log.error("All model resolution strategies failed, using fallback", { 
          sessionID: input.sessionID, 
          command: input.command,
          error: modelError instanceof Error ? modelError.message : String(modelError)
        })
        return await lastModel(input.sessionID)
      }
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
    // since toModelMessage converts subtask parts to generic "The following tool was executed by user"
    const subtaskParts = firstRealUser.parts?.filter((p) => p.type === "subtask") as MessageV2.SubtaskPart[] || []
    const hasOnlySubtaskParts = subtaskParts.length > 0 && firstRealUser.parts?.every((p) => p.type === "subtask")

    const agent = await Agent.get("title")
    if (!agent) return
    
    const model = await iife(async () => {
      if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
      return (
        (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
      )
    })
    
    // Type safety: Ensure firstRealUser.info exists
    if (!firstRealUser.info) {
      log.error("First real user message missing info", { sessionID: input.session.id })
      return
    }
    
     const titleAbortController = new AbortController()
     let llmResult: any = null
     
     try {
       llmResult = await LLM.stream({
         agent,
         user: firstRealUser.info as MessageV2.User,
         system: [],
         small: true,
         tools: {},
         model,
         abort: titleAbortController.signal,
         sessionID: input.session.id,
         retries: 2,
         messages: [
           {
             role: "user",
             content: "Generate a title for this conversation:\n",
           },
           ...(hasOnlySubtaskParts
             ? [{ role: "user" as const, content: subtaskParts.map((p) => p.prompt || '').filter(Boolean).join("\n") }]
             : MessageV2.toModelMessages(contextMessages, model)),
         ],
       })
       
       const text = await llmResult.text.catch(async (err: any) => {
        log.error("failed to generate title", { 
          sessionID: input.session.id, 
          error: err instanceof Error ? err.message : String(err) 
        })
         
         // Cleanup on title generation failure
         try {
           titleAbortController.abort()
         } catch (abortError) {
           log.error("Failed to abort title generation", { 
             sessionID: input.session.id,
             error: abortError instanceof Error ? abortError.message : String(abortError)
           })
         }
         
         return null
       })
    
     if (text) {
       try {
         return await Session.update(
           input.session.id,
           (draft) => {
             try {
               const cleaned = text
                .replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "")
                .split("\n")
                .map((line: string) => line.trim())
                .find((line: string) => line.length > 0)
              if (!cleaned) return
                const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
               draft.title = title
             } catch (processError) {
               log.error("Failed to process title text", { 
                 sessionID: input.session.id,
                 error: processError instanceof Error ? processError.message : String(processError)
               })
               // Continue without title if processing fails
             }
           },
           { touch: false },
         )
       } catch (updateError) {
         log.error("Failed to update session with title", { 
           sessionID: input.session.id,
           error: updateError instanceof Error ? updateError.message : String(updateError)
         })
         
         // Cleanup abort controller on update failure
         try {
           titleAbortController.abort()
         } catch (abortError) {
           log.error("Failed to abort after title update error", { 
             sessionID: input.session.id,
             error: abortError instanceof Error ? abortError.message : String(abortError)
           })
         }
       }
    }
  } catch (error) {
    log.error("Failed in ensureTitle", {
      sessionID: input.session.id,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    // Any final cleanup if needed
  }
}
}
