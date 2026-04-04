import { createContext, useContext, type ParentProps, onCleanup } from "solid-js"
import { createEventBus } from "@solid-primitives/event-bus"
import type { Event as SDKEvent } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "./sdk"
import { useGlobalSDK } from "./global-sdk"

export type Event = SDKEvent // can extend with custom events later

function init() {
  const sdk = useSDK()
  const globalSdk = useGlobalSDK()
  const bus = createEventBus<Event>()
  const unsub = globalSdk.event.on(sdk.directory, (event) => {
    bus.emit(event as Event)
  })
  onCleanup(unsub)
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
