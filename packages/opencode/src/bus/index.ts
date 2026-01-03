import z from "zod"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { BusEvent } from "./bus-event"
import { GlobalBus } from "./global"

export namespace Bus {
  const log = Log.create({ service: "bus" })
  type Subscription = (event: any) => void

  export const InstanceDisposed = BusEvent.define(
    "server.instance.disposed",
    z.object({
      directory: z.string(),
    }),
  )

<<<<<<< HEAD
  // Use a more robust singleton pattern that works across all contexts
  const globalKey = '__opencode_bus_global_state__'
  let moduleLevelState: { subscriptions: Map<any, Subscription[]> } | null = null

  function getGlobalState(): { subscriptions: Map<any, Subscription[]> } {
    // First, check module-level fallback
    if (moduleLevelState) {
      return moduleLevelState
    }

    // Try multiple approaches to get/set global state
    let state = null

    // Method 1: Try globalThis first
    try {
      if ((globalThis as any)[globalKey]) {
        state = (globalThis as any)[globalKey]
      }
    } catch (e) {
      log.warn("globalThis not available, trying alternative")
    }

    // Method 2: Try global (fallback for some environments)
    if (!state && typeof (globalThis as any).global !== 'undefined') {
      try {
        if (((globalThis as any).global)[globalKey]) {
          state = ((globalThis as any).global)[globalKey]
        }
      } catch (e) {
        log.warn("global not available")
      }
    }

    // Method 3: Try window (browser environments)
    if (!state && typeof (globalThis as any).window !== 'undefined') {
      try {
        if (((globalThis as any).window)[globalKey]) {
          state = ((globalThis as any).window)[globalKey]
        }
      } catch (e) {
        log.warn("window not available")
      }
    }

    // Create new state if none found
    if (!state) {
      state = {
        subscriptions: new Map<any, Subscription[]>()
      }

      // Try to store it using available global object
      try {
        (globalThis as any)[globalKey] = state
      } catch (e) {
        try {
          ((globalThis as any).global)[globalKey] = state
        } catch (e2) {
          try {
            ((globalThis as any).window)[globalKey] = state
          } catch (e3) {
            log.warn("Could not store global state, using module-level fallback")
            moduleLevelState = state
          }
        }
      }
    }

    // Ensure subscriptions is always a Map
    if (!state.subscriptions || !(state.subscriptions instanceof Map)) {
      state.subscriptions = new Map<any, Subscription[]>()
    }

    return state
  }
=======
  const state = Instance.state(
    () => {
      const subscriptions = new Map<any, Subscription[]>()

      return {
        subscriptions,
      }
    },
    async (entry) => {
      const wildcard = entry.subscriptions.get("*")
      if (!wildcard) return
      const event = {
        type: InstanceDisposed.type,
        properties: {
          directory: Instance.directory,
        },
      }
      for (const sub of [...wildcard]) {
        sub(event)
      }
    },
  )
>>>>>>> upstream/dev

  export async function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.output<Definition["properties"]>,
  ) {
    const payload = {
      type: def.type,
      properties,
    }
    log.info("publishing", {
      type: def.type,
    })
    const pending = []
    for (const key of [def.type, "*"]) {
<<<<<<< HEAD
      try {
        const currentState = getGlobalState()
        if (!currentState || !currentState.subscriptions) {
          console.error("State subscriptions not initialized in publish")
          continue
        }
        const match = currentState.subscriptions.get(key)
        for (const sub of match ?? []) {
          pending.push(sub(payload))
        }
      } catch (error) {
        console.error("Error in publish for key:", key, error)
=======
      const match = state().subscriptions.get(key)
      for (const sub of match ?? []) {
        pending.push(sub(payload))
>>>>>>> upstream/dev
      }
    }
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload,
    })
    return Promise.all(pending)
  }

  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
  ) {
    return raw(def.type, callback)
  }

  export function once<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"]
      properties: z.infer<Definition["properties"]>
    }) => "done" | undefined,
  ) {
    const unsub = subscribe(def, (event) => {
<<<<<<< HEAD
      const result = callback(event)
      if (result === "done" && unsub) unsub()
=======
      if (callback(event)) unsub()
>>>>>>> upstream/dev
    })
  }

  export function subscribeAll(callback: (event: any) => void) {
    return raw("*", callback)
  }

  function raw(type: string, callback: (event: any) => void) {
    log.info("subscribing", { type })
<<<<<<< HEAD

    // ULTRA DEFENSIVE: Handle any possible state scenario
    try {
      // Try to get state, but be prepared for any failure
      let state = null
      let subscriptions = null

      try {
        state = getGlobalState()
        if (state && state.subscriptions && typeof state.subscriptions.get === 'function') {
          subscriptions = state.subscriptions
        }
      } catch (stateError) {
        log.error("State retrieval failed:", { error: stateError })
      }

      // If we don't have valid subscriptions, create a local fallback
      if (!subscriptions) {
        log.warn("Creating local fallback subscriptions map")
        subscriptions = new Map<any, Subscription[]>()

        // Try to update global state for future calls
        try {
          const globalState = getGlobalState()
          globalState.subscriptions = subscriptions
        } catch (e) {
          log.warn("Could not update global state, using local fallback")
        }
      }

      let match = subscriptions.get(type) ?? []
      match.push(callback)
      subscriptions.set(type, match)

      return () => {
        log.info("unsubscribing", { type })
        try {
          if (subscriptions && typeof subscriptions.get === 'function') {
            const match = subscriptions.get(type)
            if (!match) return
            const index = match.indexOf(callback)
            if (index === -1) return
            match.splice(index, 1)
          }
        } catch (error) {
          log.error("Error in unsubscribe:", { error })
        }
      }
    } catch (error) {
      log.error("CRITICAL ERROR in raw subscription:", { error })
      // Return a dummy unsubscribe function that does nothing
      return () => {
        log.info("Dummy unsubscribe called")
      }
=======
    const subscriptions = state().subscriptions
    let match = subscriptions.get(type) ?? []
    match.push(callback)
    subscriptions.set(type, match)

    return () => {
      log.info("unsubscribing", { type })
      const match = subscriptions.get(type)
      if (!match) return
      const index = match.indexOf(callback)
      if (index === -1) return
      match.splice(index, 1)
>>>>>>> upstream/dev
    }
  }
}
