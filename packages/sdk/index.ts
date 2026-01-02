export { createOpencodeClient, OpencodeClient } from "./v2/client.js"
export * from "./v2.js"

import type { Config } from "./v2.js"
import { createOpencodeClient } from "./v2/client.js"

export type CreateOpencodeOptions = {
  hostname?: string
  port?: number
  signal?: AbortSignal
  timeout?: number
  config?: Config
}

export async function createOpencode(options: CreateOpencodeOptions = {}) {
  const hostname = options.hostname ?? "127.0.0.1"
  const port = options.port ?? 4096
  const timeout = options.timeout ?? 5000
  const signal = options.signal

  const { spawn } = await import("node:child_process")

  let closed = false
  let resolvedUrl: string | undefined

  const proc = spawn("opencode", ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    signal: signal as any,
  })

  const close = () => {
    if (closed) return
    closed = true
    proc.kill()
  }

  const serverUrl = await new Promise<string>((resolve, reject) => {
    const abortListener = () => {
      close()
      reject(new Error("Aborted"))
    }

    if (signal) {
      if (signal.aborted) return abortListener()
      signal.addEventListener("abort", abortListener, { once: true })
    }

    const timer = setTimeout(() => {
      close()
      reject(new Error(`Timed out waiting for opencode server after ${timeout}ms`))
    }, timeout)

    const cleanup = () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener("abort", abortListener)
    }

    const onExit = () => {
      cleanup()
      reject(new Error("Opencode server exited before becoming ready"))
    }

    proc.once("exit", onExit)

    const buffer: string[] = []

    const tryParseUrl = (text: string) => {
      const match = text.match(/opencode server listening on (http:\/\/\S+)/)
      if (!match?.[1]) return
      resolvedUrl = match[1]
      proc.removeListener("exit", onExit)
      cleanup()
      resolve(resolvedUrl)
    }

    proc.stdout?.setEncoding("utf8")
    proc.stdout?.on("data", (chunk: string) => {
      buffer.push(chunk)
      if (buffer.length > 20) buffer.shift()
      tryParseUrl(buffer.join(""))
    })

    if (port !== 0) {
      resolvedUrl = `http://${hostname}:${port}`
      proc.removeListener("exit", onExit)
      cleanup()
      resolve(resolvedUrl)
    }
  })

  const client = createOpencodeClient({ baseUrl: serverUrl })

  const deadline = Date.now() + timeout
  while (true) {
    try {
      await client.global.health()
      break
    } catch {
      if (Date.now() > deadline) {
        close()
        throw new Error(`Timed out waiting for opencode health after ${timeout}ms`)
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  if (options.config) {
    await client.config.update({ config: options.config })
  }

  return {
    client,
    server: {
      url: serverUrl,
      close,
    },
  }
}
