import { createStore, produce, reconcile } from "solid-js/store"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { uniqueBy } from "remeda"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { base64Encode } from "@opencode-ai/util/encode"
import { useParams } from "@solidjs/router"
import { useLayout } from "./layout"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useModels } from "@/context/models"
import { useProviders } from "@/hooks/use-providers"
import { modelEnabled, modelProbe } from "@/testing/model-selection"
import { Persist, persisted } from "@/utils/persist"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "./model-variant"

export type ModelKey = { providerID: string; modelID: string }

type State = {
  agent?: string
  model?: ModelKey
  variant?: string | null
}

type Saved = {
  session: Record<string, State | undefined>
}

const WORKSPACE_KEY = "__workspace__"
const handoff = new Map<string, State>()

const handoffKey = (dir: string, id: string) => `${dir}\n${id}`

const migrate = (value: unknown) => {
  if (!value || typeof value !== "object") return { session: {} }

  const item = value as {
    session?: Record<string, State | undefined>
    pick?: Record<string, State | undefined>
  }

  if (item.session && typeof item.session === "object") return { session: item.session }
  if (!item.pick || typeof item.pick !== "object") return { session: {} }

  return {
    session: Object.fromEntries(Object.entries(item.pick).filter(([key]) => key !== WORKSPACE_KEY)),
  }
}

const clone = (value: State | undefined) => {
  if (!value) return undefined
  return {
    ...value,
    model: value.model ? { ...value.model } : undefined,
  } satisfies State
}

export const { use: useLocal, provider: LocalProvider } = createSimpleContext({
  name: "Local",
  init: () => {
    const params = useParams()
    const sdk = useSDK()
    const sync = useSync()
    const layout = useLayout()
    const providers = useProviders()
    const models = useModels()

    const id = createMemo(() => params.id || undefined)
    const list = createMemo(() => sync.data.agent.filter((item) => item.mode !== "subagent" && !item.hidden))
    const connected = createMemo(() => new Set(providers.connected().map((item) => item.id)))

    const [saved, setSaved] = persisted(
      {
        ...Persist.workspace(sdk.directory, "model-selection", ["model-selection.v1"]),
        migrate,
      },
      createStore<Saved>({
        session: {},
      }),
    )

    const [store, setStore] = createStore<{
      current?: string
      draft?: State
      last?: {
        type: "agent" | "model" | "variant"
        agent?: string
        model?: ModelKey | null
        variant?: string | null
      }
    }>({
      current: list()[0]?.name,
      draft: undefined,
      last: undefined,
    })

    const validModel = (model: ModelKey) => {
      const provider = providers.all().find((item) => item.id === model.providerID)
      return !!provider?.models[model.modelID] && connected().has(model.providerID)
    }

    const getFirstValidModel = (...items: Array<() => ModelKey | undefined>) => {
      for (const item of items) {
        const model = item()
        if (!model) continue
        if (validModel(model)) return model
      }
    }

    const firstModel = getFirstValidModel

    const resolveConfigured = () => {
      if (!sync.data.config.model) return
      const [providerID, modelID] = sync.data.config.model.split("/")
      const key = { providerID, modelID }
      if (validModel(key)) return key
    }

    const resolveRecent = () => {
      for (const item of models.recent.list()) {
        if (validModel(item)) return item
      }
    }

    const resolveDefault = () => {
      const defaults = providers.default()
      for (const provider of providers.connected()) {
        const configured = defaults[provider.id]
        if (configured) {
          const key = { providerID: provider.id, modelID: configured }
          if (validModel(key)) return key
        }

        const first = Object.values(provider.models)[0]
        if (!first) continue
        const key = { providerID: provider.id, modelID: first.id }
        if (validModel(key)) return key
      }
    }

    // Prioritize OpenCode Zen models, especially big-pickle for Windows/shell
    const resolveOpenCode = () => {
      const allProviders = providers.all()
      // OpenCode provider first
      const opencodeProvider = allProviders.find(p => p.id === "opencode")
      if (opencodeProvider) {
        const pModels = Object.values(opencodeProvider.models)
        const bigPickle = pModels.find(m => m.id === "big-pickle")
        if (bigPickle) {
          return { providerID: "opencode", modelID: "big-pickle" }
        }
        if (pModels.length > 0) {
          return { providerID: "opencode", modelID: pModels[0].id }
        }
      }

      // Fallback to any available
      for (const p of allProviders) {
        const pModels = Object.values(p.models)
        if (pModels.length > 0) {
          return { providerID: p.id, modelID: pModels[0].id }
        }
      }
      return undefined
    }

    const fallbackModel = createMemo(() => resolveConfigured() ?? resolveRecent() ?? resolveDefault() ?? resolveOpenCode())

    const pickAgent = (name: string | undefined) => {
      const items = list()
      if (items.length === 0) return undefined
      return items.find((item) => item.name === name) ?? items[0]
    }

    const agent = {
      list,
      current() {
        return pickAgent(scope()?.agent ?? store.current)
      },
      set(name: string | undefined) {
        const item = pickAgent(name)
        if (!item) {
          setStore("current", undefined)
          return
        }

        batch(() => {
          setStore("current", item.name)
          setStore("last", {
            type: "agent",
            agent: item.name,
            model: item.model,
            variant: item.variant ?? null,
          })
          const prev = scope()
          const next = {
            agent: item.name,
            model: item.model ?? prev?.model,
            variant: item.variant ?? prev?.variant,
          } satisfies State
          const session = id()
          if (session) {
            setSaved("session", session, next)
            return
          }
          setStore("draft", next)
        })
      },
      move(direction: 1 | -1) {
        const items = list()
        if (items.length === 0) {
          setStore("current", undefined)
          return
        }

        let next = items.findIndex((item) => item.name === agent.current()?.name) + direction
        if (next < 0) next = items.length - 1
        if (next >= items.length) next = 0
        const item = items[next]
        if (!item) return
        agent.set(item.name)
      },
    }

    const scope = createMemo<State | undefined>(() => {
      const session = id()
      if (!session) return store.draft
      return saved.session[session] ?? handoff.get(handoffKey(sdk.directory, session))
    })

    const current = createMemo(() => {
      const item = getFirstValidModel(
        () => scope()?.model,
        () => agent.current()?.model,
        fallbackModel,
      )
      return item ? models.find(item) : undefined
    })

    const configured = () => {
      const item = agent.current()
      const model = current()
      if (!item || !model) return undefined
      return getConfiguredAgentVariant({
        agent: { model: item.model, variant: item.variant },
        model: { providerID: model.provider.id, modelID: model.id, variants: model.variants },
      })
    }

    const selected = () => scope()?.variant

    const recent = createMemo(() => models.recent.list().map(models.find).filter(Boolean))

    const snapshot = () => {
      const model = current()
      return {
        agent: agent.current()?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        variant: selected(),
      } satisfies State
    }

    const write = (next: Partial<State>) => {
      const state = {
        ...(scope() ?? { agent: agent.current()?.name }),
        ...next,
      } satisfies State

      const session = id()
      if (session) {
        setSaved("session", session, state)
        return
      }
      setStore("draft", state)
    }

    const model = {
      ready: models.ready,
      current,
      recent,
      list: models.list,
      cycle(direction: 1 | -1) {
        const items = recent()
        const item = current()
        if (!item) return

        const index = items.findIndex((entry) => entry?.provider.id === item.provider.id && entry?.id === item.id)
        if (index === -1) return

        let next = index + direction
        if (next < 0) next = items.length - 1
        if (next >= items.length) next = 0

        const entry = items[next]
        if (!entry) return
        model.set({ providerID: entry.provider.id, modelID: entry.id })
      },
      set(item: ModelKey | undefined, options?: { recent?: boolean }) {
        batch(() => {
          setStore("last", {
            type: "model",
            agent: agent.current()?.name,
            model: item ?? null,
            variant: selected(),
          })
          write({ model: item })
          if (!item) return
          models.setVisibility(item, true)
          if (!options?.recent) return
          models.recent.push(item)
        })
      },
      visible(item: ModelKey) {
        return models.visible(item)
      },
      setVisibility(item: ModelKey, visible: boolean) {
        models.setVisibility(item, visible)
      },
      variant: {
        configured,
        selected,
        current() {
          return resolveModelVariant({
            variants: this.list(),
            selected: this.selected(),
            configured: this.configured(),
          })
        },
        list() {
          const item = current()
          if (!item?.variants) return []
          return Object.keys(item.variants)
        },
        set(value: string | undefined) {
          batch(() => {
            const model = current()
            setStore("last", {
              type: "variant",
              agent: agent.current()?.name,
              model: model ? { providerID: model.provider.id, modelID: model.id } : null,
              variant: value ?? null,
            })
            write({ variant: value ?? null })
          })
        },
        cycle() {
          const items = this.list()
          if (items.length === 0) return
          this.set(
            cycleModelVariant({
              variants: items,
              selected: this.selected(),
              configured: this.configured(),
            }),
          )
        },
      },
    }

    const result = {
      slug: createMemo(() => base64Encode(sdk.directory)),
      model,
      agent,
      session: {
        reset() {
          setStore("draft", undefined)
        },
        promote(dir: string, session: string) {
          const next = clone(snapshot())
          if (!next) return

          if (dir === sdk.directory) {
            setSaved("session", session, next)
            setStore("draft", undefined)
            return
          }

          handoff.set(handoffKey(dir, session), next)
          setStore("draft", undefined)
        },
        restore(msg: { sessionID: string; agent: string; model: ModelKey; variant?: string }) {
          const session = id()
          if (!session) return
          if (msg.sessionID !== session) return
          if (saved.session[session] !== undefined) return
          if (handoff.has(handoffKey(sdk.directory, session))) return

          setSaved("session", session, {
            agent: msg.agent,
            model: msg.model,
            variant: msg.variant ?? null,
          })
        },
      },
    }

    if (modelEnabled()) {
      createEffect(() => {
        const agent = result.agent.current()
        const model = result.model.current()
        modelProbe.set({
          dir: sdk.directory,
          sessionID: id(),
          last: store.last,
          agent: agent?.name,
          model: model
            ? {
                providerID: model.provider.id,
                modelID: model.id,
                name: model.name,
              }
            : undefined,
          variant: result.model.variant.current() ?? null,
          selected: result.model.variant.selected(),
          configured: result.model.variant.configured(),
          pick: scope(),
          base: undefined,
          current: store.current,
        })
      })

      onCleanup(() => modelProbe.clear())
    }

    return result
  },
})
