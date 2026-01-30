import {
  RequestError,
  type Agent as ACPAgent,
  type AgentSideConnection,
  type AuthenticateRequest,
  type AuthMethod,
  type CancelNotification,
  type ForkSessionRequest,
  type ForkSessionResponse,
  type InitializeRequest,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type NewSessionRequest,
  type PermissionOption,
  type PlanEntry,
  type PromptRequest,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type Role,
  type SessionInfo,
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type ToolCallContent,
  type ToolKind,
} from "@agentclientprotocol/sdk"
import { Log } from "../util/log"
import { ACPSessionManager } from "./session"
import type { ACPConfig } from "./types"
import { Provider } from "../provider/provider"
import { Agent as AgentModule } from "../agent/agent"
import { Installation } from "@/installation"
import { MessageV2 } from "@/session/message-v2"
import { Config } from "@/config/config"
import { Todo } from "@/session/todo"
import { iife } from "@/util/iife"
import { z } from "zod"
import { LoadAPIKeyError } from "ai"
import type { Event, OpencodeClient, SessionMessageResponse } from "@opencode-ai/sdk/v2"
import { applyPatch } from "diff"

export namespace ACP {
  const log = Log.create({ service: "acp-agent" })

  export async function init({ sdk: _sdk }: { sdk: OpencodeClient }) {
    return {
      create: (connection: AgentSideConnection, fullConfig: ACPConfig) => {
        return new Agent(connection, fullConfig)
      },
    }
  }

  export class Agent implements ACPAgent {
    private connection: AgentSideConnection
    private config: ACPConfig
    private sdk: OpencodeClient
    private sessionManager: ACPSessionManager
    private eventAbort = new AbortController()
    private eventStarted = false
    private permissionQueues = new Map<string, Promise<void>>()
    private permissionOptions: PermissionOption[] = [
      { optionId: "once", kind: "allow_once", name: "Allow once" },
      { optionId: "always", kind: "allow_always", name: "Always allow" },
      { optionId: "reject", kind: "reject_once", name: "Reject" },
    ]

    constructor(connection: AgentSideConnection, config: ACPConfig) {
      this.connection = connection
      this.config = config
      this.sdk = config.sdk
      this.sessionManager = new ACPSessionManager(this.sdk)
      this.startEventSubscription()
    }

    private startEventSubscription() {
      if (this.eventStarted) return
      this.eventStarted = true
      const run = async (): Promise<void> => {
        if (this.eventAbort.signal.aborted) return
        const events = await this.sdk.global.event({
          signal: this.eventAbort.signal,
        })

        const processStream = async (stream: AsyncIterableIterator<any>): Promise<void> => {
          const next = await stream.next()
          if (next.done || this.eventAbort.signal.aborted) return
          const payload = (next.value as any)?.payload
          if (payload) {
            await this.handleEvent(payload as Event).catch((error) => {
              log.error("failed to handle event", { error, type: payload.type })
            })
          }
          return processStream(stream)
        }

        await processStream(events.stream as any)
        return run()
      }
      run().catch((error) => {
        if (this.eventAbort.signal.aborted) return
        log.error("event subscription failed", { error })
      })
    }

    private async handleEvent(event: Event) {
      if (event.type === "permission.asked") {
        const p = event.properties
        const s = this.sessionManager.tryGet(p.sessionID)
        if (!s) return

        const prev = this.permissionQueues.get(p.sessionID) ?? Promise.resolve()
        const next = prev
          .then(async () => {
            const dir = s.cwd
            const res = await this.connection
              .requestPermission({
                sessionId: p.sessionID,
                toolCall: {
                  toolCallId: p.tool?.callID ?? p.id,
                  status: "pending",
                  title: p.permission,
                  rawInput: p.metadata,
                  kind: toToolKind(p.permission),
                  locations: toLocations(p.permission, p.metadata),
                },
                options: this.permissionOptions,
              })
              .catch(async (error) => {
                log.error("failed to request permission from ACP", { error, pID: p.id, sID: p.sessionID })
                await this.sdk.permission.reply({ requestID: p.id, reply: "reject", directory: dir })
                return undefined
              })

            if (!res) return
            if (res.outcome.outcome !== "selected") {
              await this.sdk.permission.reply({ requestID: p.id, reply: "reject", directory: dir })
              return
            }

            if (res.outcome.optionId !== "reject" && p.permission == "edit") {
              const meta = p.metadata || {}
              const file = typeof meta["filepath"] === "string" ? meta["filepath"] : ""
              const diff = typeof meta["diff"] === "string" ? meta["diff"] : ""
              const text = await Bun.file(file).text()
              const next = getNewContent(text, diff)
              if (next) this.connection.writeTextFile({ sessionId: s.id, path: file, content: next })
            }

            await this.sdk.permission.reply({
              requestID: p.id,
              reply: res.outcome.optionId as "once" | "always" | "reject",
              directory: dir,
            })
          })
          .catch((error) => {
            log.error("failed to handle permission", { error, pID: p.id })
          })
          .finally(() => {
            if (this.permissionQueues.get(p.sessionID) === next) this.permissionQueues.delete(p.sessionID)
          })
        this.permissionQueues.set(p.sessionID, next)
        return
      }

      if (event.type === "message.part.updated") {
        log.info("message part updated", { event: event.properties })
        const props = event.properties
        const part = props.part
        const s = this.sessionManager.tryGet(part.sessionID)
        if (!s) return
        const sid = s.id
        const dir = s.cwd

        const msg = await this.sdk.session
          .message({ sessionID: part.sessionID, messageID: part.messageID, directory: dir }, { throwOnError: true })
          .then((x) => x.data)
          .catch((error) => {
            log.error("unexpected error when fetching message", { error })
            return undefined
          })

        if (!msg || msg.info.role !== "assistant") return

        if (part.type === "tool") {
          const kind = toToolKind(part.tool)
          if (part.state.status === "pending") {
            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: {
                  sessionUpdate: "tool_call",
                  toolCallId: part.callID,
                  title: part.tool,
                  kind,
                  status: "pending",
                  locations: [],
                  rawInput: {},
                },
              })
              .catch((error) => log.error("failed to send tool pending to ACP", { error }))
            return
          }

          if (part.state.status === "running") {
            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "in_progress",
                  kind,
                  title: part.tool,
                  locations: toLocations(part.tool, part.state.input),
                  rawInput: part.state.input,
                },
              })
              .catch((error) => log.error("failed to send tool in_progress to ACP", { error }))
            return
          }

          if (part.state.status === "completed") {
            const content: ToolCallContent[] = [{ type: "content", content: { type: "text", text: part.state.output } }]

            if (kind === "edit") {
              const input = part.state.input
              const file = typeof input["filePath"] === "string" ? input["filePath"] : ""
              const old = typeof input["oldString"] === "string" ? input["oldString"] : ""
              const next =
                typeof input["newString"] === "string"
                  ? input["newString"]
                  : typeof input["content"] === "string"
                    ? input["content"]
                    : ""
              content.push({ type: "diff", path: file, oldText: old, newText: next })
            }

            if (part.tool === "todowrite") {
              const res = z.array(Todo.Info).safeParse(JSON.parse(part.state.output))
              if (res.success) {
                await this.connection
                  .sessionUpdate({
                    sessionId: sid,
                    update: {
                      sessionUpdate: "plan",
                      entries: res.data.map((todo) => ({
                        priority: "medium",
                        status: todo.status === "cancelled" ? "completed" : (todo.status as PlanEntry["status"]),
                        content: todo.content,
                      })),
                    },
                  })
                  .catch((error) => log.error("failed to send session update for todo", { error }))
              } else {
                log.error("failed to parse todo output", { error: res.error })
              }
            }

            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "completed",
                  kind,
                  content,
                  title: part.state.title,
                  rawInput: part.state.input,
                  rawOutput: { output: part.state.output, metadata: part.state.metadata },
                },
              })
              .catch((error) => log.error("failed to send tool completed to ACP", { error }))
            return
          }

          if (part.state.status === "error") {
            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "failed",
                  kind,
                  title: part.tool,
                  rawInput: part.state.input,
                  content: [{ type: "content", content: { type: "text", text: part.state.error } }],
                  rawOutput: { error: part.state.error },
                },
              })
              .catch((error) => log.error("failed to send tool error to ACP", { error }))
            return
          }
        }

        if (part.type === "text") {
          const delta = props.delta
          if (delta && part.ignored !== true) {
            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: delta } },
              })
              .catch((error) => log.error("failed to send text to ACP", { error }))
          }
          return
        }

        if (part.type === "reasoning") {
          const delta = props.delta
          if (delta) {
            await this.connection
              .sessionUpdate({
                sessionId: sid,
                update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: delta } },
              })
              .catch((error) => log.error("failed to send reasoning to ACP", { error }))
          }
        }
      }
    }

    async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      log.info("initialize", { protocolVersion: params.protocolVersion })

      const authMethod: AuthMethod = {
        description: "Run `opencode auth login` in the terminal",
        name: "Login with opencode",
        id: "opencode-login",
      }

      // If client supports terminal-auth capability, use that instead.
      if (params.clientCapabilities?._meta?.["terminal-auth"] === true) {
        authMethod._meta = {
          "terminal-auth": {
            command: "opencode",
            args: ["auth", "login"],
            label: "OpenCode Login",
          },
        }
      }

      return {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          mcpCapabilities: {
            http: true,
            sse: true,
          },
          promptCapabilities: {
            embeddedContext: true,
            image: true,
          },
          sessionCapabilities: {
            fork: {},
            list: {},
            resume: {},
          },
        },
        authMethods: [authMethod],
        agentInfo: {
          name: "OpenCode",
          version: Installation.VERSION,
        },
      }
    }

    async authenticate(_params: AuthenticateRequest) {
      throw new Error("Authentication not implemented")
    }

    async newSession(params: NewSessionRequest) {
      const dir = params.cwd
      return defaultModel(this.config, dir)
        .then(async (model) => {
          const state = await this.sessionManager.create(dir, params.mcpServers, model)
          const id = state.id
          log.info("creating_session", { id, mcp: params.mcpServers.length })
          const load = await this.loadSessionMode({
            cwd: dir,
            mcpServers: params.mcpServers,
            sessionId: id,
          })
          return {
            sessionId: id,
            models: load.models,
            modes: load.modes,
            _meta: {},
          }
        })
        .catch((e) => {
          const error = MessageV2.fromError(e, {
            providerID: this.config.defaultModel?.providerID ?? "unknown",
          })
          if (LoadAPIKeyError.isInstance(error)) {
            throw RequestError.authRequired()
          }
          throw e
        })
    }

    async loadSession(params: LoadSessionRequest) {
      const dir = params.cwd
      const id = params.sessionId

      return defaultModel(this.config, dir)
        .then(async (model) => {
          await this.sessionManager.load(id, params.cwd, params.mcpServers, model)
          log.info("load_session", { id, mcp: params.mcpServers.length })

          const res = await this.loadSessionMode({
            cwd: dir,
            mcpServers: params.mcpServers,
            sessionId: id,
          })

          const msgs = await this.sdk.session
            .messages({ sessionID: id, directory: dir }, { throwOnError: true })
            .then((x) => x.data)
            .catch((err) => {
              log.error("unexpected error when fetching message", { error: err })
              return undefined
            })

          const last = msgs?.findLast((m) => m.info.role === "user")?.info
          const updatedRes = iife(() => {
            if (last?.role === "user") {
              const r = { ...res }
              r.models.currentModelId = `${last.model.providerID}/${last.model.modelID}`
              this.sessionManager.setModel(id, {
                providerID: last.model.providerID,
                modelID: last.model.modelID,
              })
              if (res.modes.availableModes.some((m) => m.id === last.agent)) {
                r.modes.currentModeId = last.agent
                this.sessionManager.setMode(id, last.agent)
              }
              return r
            }
            return res
          })

          const processMessages = async (remaining: SessionMessageResponse[]): Promise<void> => {
            const msg = remaining[0]
            if (!msg) return
            log.debug("replay message", msg)
            await this.processMessage(msg)
            return processMessages(remaining.slice(1))
          }

          await processMessages(msgs ?? [])

          return updatedRes
        })
        .catch((e) => {
          const error = MessageV2.fromError(e, {
            providerID: this.config.defaultModel?.providerID ?? "unknown",
          })
          if (LoadAPIKeyError.isInstance(error)) {
            throw RequestError.authRequired()
          }
          throw e
        })
    }

    async unstable_listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
      const cursor = params.cursor ? Number(params.cursor) : undefined
      const limit = 100

      return this.sdk.session
        .list({ directory: params.cwd ?? undefined, roots: true }, { throwOnError: true })
        .then((x) => x.data ?? [])
        .then((sessions) => {
          const sorted = sessions.toSorted((a, b) => b.time.updated - a.time.updated)
          const filtered = cursor ? sorted.filter((s) => s.time.updated < cursor) : sorted
          const page = filtered.slice(0, limit)
          const last = page[page.length - 1]
          const next = filtered.length > limit && last ? String(last.time.updated) : undefined

          const res: ListSessionsResponse = {
            sessions: page.map((s) => ({
              sessionId: s.id,
              cwd: s.directory,
              title: s.title,
              updatedAt: new Date(s.time.updated).toISOString(),
            })),
          }
          if (next) res.nextCursor = next
          return res
        })
        .catch((e) => {
          const error = MessageV2.fromError(e, {
            providerID: this.config.defaultModel?.providerID ?? "unknown",
          })
          if (LoadAPIKeyError.isInstance(error)) {
            throw RequestError.authRequired()
          }
          throw e
        })
    }

    async unstable_forkSession(params: ForkSessionRequest): Promise<ForkSessionResponse> {
      const directory = params.cwd
      const mcpServers = params.mcpServers ?? []

      const forked = await this.sdk.session
        .fork(
          {
            sessionID: params.sessionId,
            directory,
          },
          { throwOnError: true },
        )
        .then((x) => x.data)

      if (!forked) {
        throw new Error("Fork session returned no data")
      }

      return this.loadSession({
        sessionId: forked.id,
        cwd: directory,
        mcpServers,
      })
    }

    async unstable_resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse> {
      return this.loadSession({
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
      })
    }

    private async processMessage(message: SessionMessageResponse) {
      log.debug("process message", message)
      if (message.info.role !== "assistant" && message.info.role !== "user") return
      const sessionId = message.info.sessionID

      const processParts = async (remaining: SessionMessageResponse["parts"]): Promise<void> => {
        const part = remaining[0]
        if (!part) return

        await iife(async () => {
          if (part.type === "tool") {
            const status = part.state.status
            if (status === "pending") {
              return this.connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "tool_call",
                    toolCallId: part.callID,
                    title: part.tool,
                    kind: toToolKind(part.tool),
                    status: "pending",
                    locations: [],
                    rawInput: {},
                  },
                })
                .catch((error) => log.error("failed to send tool pending replay to ACP", { error }))
            }
            if (status === "running") {
              return this.connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "tool_call_update",
                    toolCallId: part.callID,
                    status: "in_progress",
                    kind: toToolKind(part.tool),
                    title: part.tool,
                    locations: toLocations(part.tool, part.state.input),
                    rawInput: part.state.input,
                  },
                })
                .catch((error) => log.error("failed to send tool in_progress replay to ACP", { error }))
            }
            if (status === "completed") {
              return this.connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "tool_call_update",
                    toolCallId: part.callID,
                    status: "completed",
                    kind: toToolKind(part.tool),
                    title: part.state.title,
                    rawInput: part.state.input,
                    rawOutput: { output: part.state.output, metadata: part.state.metadata },
                    content: [{ type: "content", content: { type: "text", text: part.state.output } }],
                  },
                })
                .catch((error) => log.error("failed to send tool completed replay to ACP", { error }))
            }
            if (status === "error") {
              return this.connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "tool_call_update",
                    toolCallId: part.callID,
                    status: "failed",
                    kind: toToolKind(part.tool),
                    title: part.tool,
                    rawInput: part.state.input,
                    content: [{ type: "content", content: { type: "text", text: part.state.error } }],
                    rawOutput: { error: part.state.error },
                  },
                })
                .catch((error) => log.error("failed to send tool error replay to ACP", { error }))
            }
          }
          if (part.type === "text" && part.ignored !== true) {
            return this.connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: message.info.role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
                  content: { type: "text", text: part.text },
                },
              })
              .catch((error) => log.error("failed to send text replay to ACP", { error }))
          }
        })

        return processParts(remaining.slice(1))
      }

      await processParts(message.parts)
    }

    private async loadSessionMode(params: LoadSessionRequest) {
      const directory = params.cwd
      const model = await defaultModel(this.config, directory)
      const sessionId = params.sessionId

      const providers = await this.sdk.config.providers({ directory }).then((x) => x.data!.providers)
      const entries = providers.sort((a, b) => {
        const nameA = a.name.toLowerCase()
        const nameB = b.name.toLowerCase()
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
        return 0
      })
      const availableModels = entries.flatMap((provider) => {
        const models = Provider.sort(Object.values(provider.models))
        return models.map((model) => ({
          modelId: `${provider.id}/${model.id}`,
          name: `${provider.name}/${model.name}`,
        }))
      })

      const agents = await this.config.sdk.app
        .agents(
          {
            directory,
          },
          { throwOnError: true },
        )
        .then((resp) => resp.data!)

      const commands = await this.config.sdk.command
        .list(
          {
            directory,
          },
          { throwOnError: true },
        )
        .then((resp) => resp.data!)

      const availableCommands = commands.map((command) => ({
        name: command.name,
        description: command.description ?? "",
      }))
      const names = new Set(availableCommands.map((c) => c.name))
      if (!names.has("compact"))
        availableCommands.push({
          name: "compact",
          description: "compact the session",
        })

      const availableModes = agents
        .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
        .map((agent) => ({
          id: agent.name,
          name: agent.name,
          description: agent.description,
        }))

      const defaultAgentName = await AgentModule.defaultAgent()
      const currentModeId = availableModes.find((m) => m.name === defaultAgentName)?.id ?? availableModes[0].id

      // Persist the default mode so prompt() uses it immediately
      this.sessionManager.setMode(sessionId, currentModeId)

      const mcpServers: Record<string, Config.Mcp> = {}
      for (const server of params.mcpServers) {
        if ("type" in server) {
          mcpServers[server.name] = {
            url: server.url,
            headers: server.headers.reduce<Record<string, string>>((acc, { name, value }) => {
              acc[name] = value
              return acc
            }, {}),
            type: "remote",
          }
        } else {
          mcpServers[server.name] = {
            type: "local",
            command: [server.command, ...server.args],
            environment: server.env.reduce<Record<string, string>>((acc, { name, value }) => {
              acc[name] = value
              return acc
            }, {}),
          }
        }
      }

      await Promise.all(
        Object.entries(mcpServers).map(async ([key, mcp]) => {
          await this.sdk.mcp
            .add(
              {
                directory,
                name: key,
                config: mcp,
              },
              { throwOnError: true },
            )
            .catch((error) => {
              log.error("failed to add mcp server", { name: key, error })
            })
        }),
      )

      setTimeout(() => {
        this.connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "available_commands_update",
            availableCommands,
          },
        })
      }, 0)

      return {
        sessionId,
        models: {
          currentModelId: `${model.providerID}/${model.modelID}`,
          availableModels,
        },
        modes: {
          availableModes,
          currentModeId,
        },
        _meta: {},
      }
    }

    async setSessionModel(params: SetSessionModelRequest) {
      const session = this.sessionManager.get(params.sessionId)
      const model = Provider.parseModel(params.modelId)
      this.sessionManager.setModel(session.id, {
        providerID: model.providerID,
        modelID: model.modelID,
      })
      return { _meta: {} }
    }

    async unstable_setSessionModel(params: SetSessionModelRequest) {
      return this.setSessionModel(params)
    }

    async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse | void> {
      this.sessionManager.get(params.sessionId)
      await this.config.sdk.app
        .agents({}, { throwOnError: true })
        .then((x) => x.data)
        .then((agent) => {
          if (!agent) throw new Error(`Agent not found: ${params.modeId}`)
        })
      this.sessionManager.setMode(params.sessionId, params.modeId)
    }

    async prompt(params: PromptRequest) {
      const id = params.sessionId
      const session = this.sessionManager.get(id)
      const dir = session.cwd

      const model = session.model ?? (await defaultModel(this.config, dir))
      if (!session.model) this.sessionManager.setModel(session.id, model)

      const agent = session.modeId ?? (await AgentModule.defaultAgent())

      const processPromptParts = (remaining: PromptRequest["prompt"], acc: any[]): any[] => {
        const part = remaining[0]
        if (!part) return acc

        const nextParts = iife(() => {
          if (part.type === "text") {
            const audience = part.annotations?.audience
            const assistant = audience?.length === 1 && audience[0] === "assistant"
            const user = audience?.length === 1 && audience[0] === "user"
            return [
              {
                type: "text" as const,
                text: part.text,
                ...(assistant && { synthetic: true }),
                ...(user && { ignored: true }),
              },
            ]
          }
          if (part.type === "image") {
            const parsed = parseUri(part.uri ?? "")
            const file = parsed.type === "file" ? (parsed as any).filename : "image"
            if (part.data) {
              return [
                {
                  type: "file" as const,
                  url: `data:${part.mimeType};base64,${part.data}`,
                  filename: file,
                  mime: part.mimeType,
                },
              ]
            }
            if (part.uri?.startsWith("http:")) {
              return [
                {
                  type: "file" as const,
                  url: part.uri,
                  filename: file,
                  mime: part.mimeType,
                },
              ]
            }
          }
          if (part.type === "resource_link") {
            const parsed = parseUri(part.uri)
            if (part.name && parsed.type === "file") (parsed as any).filename = part.name
            return [parsed]
          }
          if (part.type === "resource") {
            const res = part.resource
            if ("text" in res && res.text) return [{ type: "text" as const, text: res.text }]
            if ("blob" in res && res.blob && res.mimeType) {
              const parsed = parseUri(res.uri ?? "")
              const file = parsed.type === "file" ? (parsed as any).filename : "file"
              return [
                {
                  type: "file" as const,
                  url: `data:${res.mimeType};base64,${res.blob}`,
                  filename: file,
                  mime: res.mimeType,
                },
              ]
            }
          }
          return []
        })

        return processPromptParts(remaining.slice(1), [...acc, ...nextParts])
      }

      const parts = processPromptParts(params.prompt, [])

      log.info("parts", { parts })

      const text = parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim()

      const cmd = text.startsWith("/")
        ? (() => {
            const [name, ...rest] = text.slice(1).split(/\s+/)
            return { name, args: rest.join(" ").trim() }
          })()
        : undefined

      const done = { stopReason: "end_turn" as const, _meta: {} }

      if (!cmd) {
        await this.sdk.session.prompt({
          sessionID: id,
          model: { providerID: model.providerID, modelID: model.modelID },
          parts,
          agent,
          directory: dir,
        })
        return done
      }

      const list = await this.config.sdk.command.list({ directory: dir }, { throwOnError: true })
      const command = list.data?.find((c) => c.name === cmd.name)
      if (command) {
        await this.sdk.session.command({
          sessionID: id,
          command: command.name,
          arguments: cmd.args,
          model: model.providerID + "/" + model.modelID,
          agent,
          directory: dir,
        })
        return done
      }

      if (cmd.name === "compact") {
        await this.config.sdk.session.summarize(
          {
            sessionID: id,
            directory: dir,
            providerID: model.providerID,
            modelID: model.modelID,
          },
          { throwOnError: true },
        )
      }

      return done
    }

    async cancel(params: CancelNotification) {
      const session = this.sessionManager.get(params.sessionId)
      await this.config.sdk.session.abort(
        {
          sessionID: params.sessionId,
          directory: session.cwd,
        },
        { throwOnError: true },
      )
    }
  }

  function toToolKind(toolName: string): ToolKind {
    const tool = toolName.toLocaleLowerCase()
    switch (tool) {
      case "bash":
        return "execute"
      case "webfetch":
        return "fetch"

      case "edit":
      case "patch":
      case "write":
        return "edit"

      case "grep":
      case "glob":
      case "context7_resolve_library_id":
      case "context7_get_library_docs":
        return "search"

      case "list":
      case "read":
        return "read"

      default:
        return "other"
    }
  }

  function toLocations(toolName: string, input: Record<string, any>): { path: string }[] {
    const tool = toolName.toLocaleLowerCase()
    switch (tool) {
      case "read":
      case "edit":
      case "write":
        return input["filePath"] ? [{ path: input["filePath"] }] : []
      case "glob":
      case "grep":
        return input["path"] ? [{ path: input["path"] }] : []
      case "bash":
        return []
      case "list":
        return input["path"] ? [{ path: input["path"] }] : []
      default:
        return []
    }
  }

  async function defaultModel(config: ACPConfig, cwd?: string) {
    const sdk = config.sdk
    if (config.defaultModel) return config.defaultModel

    const dir = cwd ?? process.cwd()

    const spec = await sdk.config
      .get({ directory: dir }, { throwOnError: true })
      .then((resp) => {
        const cfg = resp.data
        if (!cfg || !cfg.model) return undefined
        const parsed = Provider.parseModel(cfg.model)
        return { providerID: parsed.providerID, modelID: parsed.modelID }
      })
      .catch((error) => {
        log.error("failed to load user config for default model", { error })
        return undefined
      })

    const provs = await sdk.config
      .providers({ directory: dir }, { throwOnError: true })
      .then((x) => x.data?.providers ?? [])
      .catch((error) => {
        log.error("failed to list providers for default model", { error })
        return []
      })

    if (spec && provs.length) {
      const p = provs.find((p) => p.id === spec.providerID)
      if (p && p.models[spec.modelID]) return spec
    }

    if (spec && !provs.length) return spec

    const oc = provs.find((p) => p.id === "opencode")
    if (oc) {
      if (oc.models["big-pickle"]) return { providerID: "opencode", modelID: "big-pickle" }
      const [best] = Provider.sort(Object.values(oc.models))
      if (best) return { providerID: best.providerID, modelID: best.id }
    }

    const models = provs.flatMap((p) => Object.values(p.models))
    const [best] = Provider.sort(models)
    if (best) return { providerID: best.providerID, modelID: best.id }

    return spec || { providerID: "opencode", modelID: "big-pickle" }
  }

  function parseUri(
    uri: string,
  ): { type: "file"; url: string; filename: string; mime: string } | { type: "text"; text: string } {
    if (uri.startsWith("file://")) {
      const path = uri.slice(7)
      const name = path.split("/").pop() || path
      return { type: "file", url: uri, filename: name, mime: "text/plain" }
    }
    if (uri.startsWith("zed://")) {
      const url = new URL(uri)
      const path = url.searchParams.get("path")
      if (path) {
        const name = path.split("/").pop() || path
        return { type: "file", url: `file://${path}`, filename: name, mime: "text/plain" }
      }
    }
    return { type: "text", text: uri }
  }

  function getNewContent(fileOriginal: string, unifiedDiff: string): string | undefined {
    const result = applyPatch(fileOriginal, unifiedDiff)
    if (result === false) {
      log.error("Failed to apply unified diff (context mismatch)")
      return undefined
    }
    return result
  }
}
