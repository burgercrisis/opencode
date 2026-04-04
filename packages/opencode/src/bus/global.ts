import { EventEmitter } from "events"

export const GlobalBus = new EventEmitter<{
  event: [
    {
      directory?: string
      payload: any
    },
  ]
}>()

/**
 * Reset state for test isolation
 */
export function resetForTest() {
  GlobalBus.removeAllListeners()
}
