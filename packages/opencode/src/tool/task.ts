import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { ModelSelectionEngine } from "../model/selection-engine"
import { TaskDetector } from "../model/task-detector"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const modelSelector = new ModelSelectionEngine()
  const taskDetector = new TaskDetector()
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => { })
          if (found) return found
        }

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      // Try intelligent model selection if enabled
      let model
      const config = await Config.get()

      if (config.subagent_model_strategy?.enabled) {
        try {
          // Analyze the task to determine optimal model selection
          const taskAnalysis = taskDetector.analyzeTask(params.prompt, agent.name)

          // Get quality preference from configuration (task-specific override or global)
          let qualityPreference = config.subagent_model_strategy.quality_preference || 50
          const taskOverride = config.subagent_model_strategy.task_specific_overrides?.[taskAnalysis.type]
          if (taskOverride?.quality_preference) {
            qualityPreference = taskOverride.quality_preference
          } else {
            // Use detector's default for this task type
            qualityPreference = taskDetector.getDefaultQualityForTask(taskAnalysis.type)
          }

          // Select optimal model
          const modelSelection = await modelSelector.selectOptimalModel({
            taskType: taskAnalysis.type,
            qualityPreference,
            reasoningRequired: taskAnalysis.reasoningRequired,
            estimatedTokens: taskAnalysis.estimatedTokens,
            maxCost: taskOverride?.cost_threshold,
            allowedModels: config.subagent_model_strategy.global_allowlist,
            excludedModels: []
          }, config.subagent_model_strategy)

          if (modelSelection) {
            model = {
              model: {
                model: modelSelection.model,
                providerID: modelSelection.providerID,
              }
            }
            console.log(`Task tool selected intelligent model: ${modelSelection.providerID}/${modelSelection.model} for task type: ${taskAnalysis.type}`)
          } else {
            // Fallback to original logic
            model = agent.model ?? {
              modelID: msg.info.modelID,
              providerID: msg.info.providerID,
            }
            console.warn(`Intelligent model selection failed, using fallback model`)
          }
        } catch (error) {
          console.error("Error in intelligent model selection:", error)
          // Fallback to original logic
          model = agent.model ?? {
            modelID: msg.info.modelID,
            providerID: msg.info.providerID,
          }
        }
      } else {
        // Use original behavior when intelligent selection is disabled
        if (config.subagent_model_strategy?.default_behavior === "fallback") {
          model = agent.model ?? {
            modelID: msg.info.modelID,
            providerID: msg.info.providerID,
          }
        } else {
          // Default "inherit" behavior
          model = {
            modelID: msg.info.modelID,
            providerID: msg.info.providerID,
          }
        }
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const sessionConfig = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: (model as any).model?.model || (model as any).modelID || '',
          providerID: (model as any).model?.providerID || (model as any).providerID || '',
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})
