import { createContext, useContext, type ParentProps, onCleanup, createEffect } from "solid-js"
import { createEventBus } from "@solid-primitives/event-bus"
import type { Event as SDKEvent } from "@opencode-ai/sdk/v2/client"
import { useSDK, useGlobalSDK } from "@/context"

export type Event = SDKEvent // can extend with custom events later

function init() {
  const bus = createEventBus<Event>()

  createEffect(() => {
    const sdk = useSDK()
    const globalSdk = useGlobalSDK()
    if (!sdk || !globalSdk) return

    const unsub = globalSdk.event.on(sdk.directory, (event) => {
      bus.emit(event as Event)
    })
    onCleanup(() => {
      if (process.env.NODE_ENV === "production") {
        console.debug(`[EventProvider] cleaning up listener for ${sdk.directory}`)
      }
      unsub()
    })
  })

  return bus
}

type EventContext = ReturnType<typeof init>

const ctx = createContext<EventContext>()

export function EventProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useEvent() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useEvent must be used within a EventProvider")
  }
  return value
}
