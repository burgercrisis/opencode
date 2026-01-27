import { Instance } from "../project/instance"

export namespace Env {
  const state = Instance.state(() => {
    return process.env as Record<string, string | undefined>
  })

  export function get(key: string) {
    const env = state()
    const value = env[key]
    if (value !== undefined) return value

    // Case-insensitive lookup as fallback
    const upper = key.toUpperCase()
    const found = Object.keys(env).find((k) => k.toUpperCase() === upper)
    return found ? env[found] : undefined
  }

  export function all() {
    return state()
  }

  export function set(key: string, value: string) {
    const env = state()
    env[key] = value
  }

  export function remove(key: string) {
    const env = state()
    delete env[key]
  }
}
