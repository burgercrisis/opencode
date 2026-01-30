import { Log } from "@/util/log"

export namespace State {
  interface Entry {
    state: any
    dispose?: (state: any) => Promise<void>
  }

  const log = Log.create({ service: "state" })
  const recordsByKey = new Map<string, Map<any, Entry>>()

  export function create<S>(root: () => string, init: () => S, dispose?: (state: Awaited<S>) => Promise<void>) {
    return () => {
      const key = root()
      const entries =
        recordsByKey.get(key) ??
        (() => {
          const map = new Map<any, Entry>()
          recordsByKey.set(key, map)
          return map
        })()
      const exists = entries.get(init)
      return exists
        ? (exists.state as S)
        : (() => {
            const state = init()
            entries.set(init, {
              state,
              dispose,
            })
            return state
          })()
    }
  }

  export async function dispose(key: string) {
    const entries = recordsByKey.get(key)
    if (!entries) return

    log.info("waiting for state disposal to complete", { key })

    const timeout = setTimeout(() => {
      log.warn(
        "state disposal is taking an unusually long time - if it does not complete in a reasonable time, please report this as a bug",
        { key },
      )
    }, 10000)
    timeout.unref()

    const tasks = Array.from(entries.values()).reduce((acc, entry) => {
      const task = entry.dispose
        ? Promise.resolve(entry.state)
            .then((state) => entry.dispose!(state))
            .catch((error) => {
              log.error("Error while disposing state:", { error, key })
            })
        : undefined
      return task ? [...acc, task] : acc
    }, [] as Promise<void>[])

    entries.clear()
    recordsByKey.delete(key)
    await Promise.all(tasks)
    clearTimeout(timeout)
    log.info("state disposal completed", { key })
  }
}
