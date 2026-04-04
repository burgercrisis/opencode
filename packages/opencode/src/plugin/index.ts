import type { Hooks, PluginInput, Plugin as PluginInstance } from "@opencode-ai/plugin"
import { Config } from "../config/config"
import { Bus } from "../bus"
import { Log } from "../util/log"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Server } from "../server/server"
import { BunProc } from "../bun"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { CodexAuthPlugin } from "./codex"
import { Session } from "../session"
import { NamedError } from "@opencode-ai/util/error"
import { CopilotAuthPlugin } from "./copilot"
import { gitlabAuthPlugin as GitlabAuthPlugin } from "@gitlab/opencode-gitlab-auth"

export namespace Plugin {
  const log = Log.create({ service: "plugin" })

  const BUILTIN = ["opencode-anthropic-auth@0.0.13"]

  // Built-in plugins that are directly imported (not installed from npm)
  const INTERNAL_PLUGINS: PluginInstance[] = [CodexAuthPlugin, CopilotAuthPlugin, GitlabAuthPlugin]

  const state = Instance.state(async () => {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: Instance.directory,
      // @ts-ignore - fetch type incompatibility
      fetch: async (...args) => Server.App().fetch(...args),
    })
    const config = await Config.get()
    const input: PluginInput = {
      client,
      project: Instance.project,
      worktree: Instance.worktree,
      directory: Instance.directory,
      serverUrl: Server.url(),
      $: Bun.$,
    }

    const internalHooks = await Promise.all(
      INTERNAL_PLUGINS.map(async (plugin) => {
        log.info("loading internal plugin", { name: plugin.name })
        return await plugin(input)
      }),
    )

    let plugins = config.plugin ?? []
    if (plugins.length) await Config.waitForDependencies()
    if (!Flag.OPENCODE_DISABLE_DEFAULT_PLUGINS) {
      plugins = [...BUILTIN, ...plugins]
    }

    const externalHooks = await plugins.reduce(async (accPromise, rawPlugin) => {
      const acc = await accPromise

      // ignore old codex plugin since it is supported first party now
      const isDeprecated =
        rawPlugin.includes("opencode-openai-codex-auth") ||
        rawPlugin.includes("opencode-copilot-auth")
      if (isDeprecated) return acc

      log.info("loading plugin", { path: rawPlugin })

      const plugin = await (async () => {
        if (rawPlugin.startsWith("file://")) return rawPlugin

        const lastAtIndex = rawPlugin.lastIndexOf("@")
        const pkg = lastAtIndex > 0 ? rawPlugin.substring(0, lastAtIndex) : rawPlugin
        const version = lastAtIndex > 0 ? rawPlugin.substring(lastAtIndex + 1) : "latest"
        const builtin = BUILTIN.some((x) => x.startsWith(pkg + "@"))

        return await BunProc.install(pkg, version).catch((err) => {
          if (!builtin) throw err

          const message = err instanceof Error ? err.message : String(err)
          log.error("failed to install builtin plugin", {
            pkg,
            version,
            error: message,
          })
          Bus.publish(Session.Event.Error, {
            error: new NamedError.Unknown({
              message: `Failed to install built-in plugin ${pkg}@${version}: ${message}`,
            }).toObject(),
          })

          return ""
        })
      })()

      return !plugin
        ? acc
        : await (async () => {
            const mod = await import(plugin)
            // Prevent duplicate initialization when plugins export the same function
            // as both a named export and default export (e.g., `export const X` and `export default X`).
            const pluginInits = await Object.entries<PluginInstance>(mod).reduce(
              async (innerAccPromise, [_name, fn]) => {
                const innerAcc = await innerAccPromise
                return innerAcc.seen.has(fn)
                  ? innerAcc
                  : {
                      seen: new Set([...innerAcc.seen, fn]),
                      hooks: [...innerAcc.hooks, await fn(input)],
                    }
              },
              Promise.resolve({ seen: new Set<PluginInstance>(), hooks: [] as Hooks[] }),
            )
            return [...acc, ...pluginInits.hooks]
          })()
    }, Promise.resolve([] as Hooks[]))

    return {
      hooks: [...internalHooks, ...externalHooks],
      input,
    }
  })

  export async function trigger<
    Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool">,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    if (!name) return output
    const hooks = await state().then((x) => x.hooks)

    await hooks.reduce(async (promise, hook) => {
      await promise
      const fn = hook[name]
      if (!fn) return
      await (fn as any)(input, output)
    }, Promise.resolve())

    return output
  }

  export async function list() {
    return state().then((x) => x.hooks)
  }

  export async function init() {
    const hooks = await state().then((x) => x.hooks)
    const config = await Config.get()

    await hooks.reduce(async (promise, hook) => {
      await promise
      await (hook.config as any)?.(config)
    }, Promise.resolve())

    Bus.subscribeAll(async (input) => {
      const hooks = await state().then((x) => x.hooks)
      hooks.forEach((hook) => {
        hook["event"]?.({
          event: input,
        })
      })
    })
  }
}
