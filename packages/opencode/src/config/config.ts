import { Log } from "../util/log"
import path from "path"
import { pathToFileURL } from "url"
import os from "os"
import z from "zod"
import { Filesystem } from "../util/filesystem"
import { ModelsDev } from "../provider/models"
import { mergeDeep, pipe, unique } from "remeda"
import { Global } from "../global"
import fs from "fs/promises"
import { lazy } from "../util/lazy"
import { NamedError } from "@opencode-ai/util/error"
import { Flag } from "../flag/flag"
import { Auth } from "../auth"
import {
  type ParseError as JsoncParseError,
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode,
} from "jsonc-parser"
import { Instance } from "../project/instance"
import { LSPServer } from "../lsp/server"
import { BunProc } from "@/bun"
import { Installation } from "@/installation"
import { ConfigMarkdown } from "./markdown"
import { existsSync } from "fs"
import { Bus } from "@/bus"
import { GlobalBus } from "@/bus/global"
import { Event } from "../server/event"
import { PackageRegistry } from "@/bun/registry"

export namespace Config {
  const log = Log.create({ service: "config" })

  // Managed settings directory for enterprise deployments (highest priority, admin-controlled)
  // These settings override all user and project settings
  function getManagedConfigDir(): string {
    switch (process.platform) {
      case "darwin":
        return "/Library/Application Support/opencode"
      case "win32":
        return path.join(process.env.ProgramData || "C:\\ProgramData", "opencode")
      default:
        return "/etc/opencode"
    }
  }

  const managedConfigDir = process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR || getManagedConfigDir()

  // Custom merge function that concatenates array fields instead of replacing them
  function mergeConfigConcatArrays(target: Info, source: Info): Info {
    const merged = mergeDeep(target, source)
    if (target.plugin && source.plugin) {
      merged.plugin = Array.from(new Set([...target.plugin, ...source.plugin]))
    }
    if (target.instructions && source.instructions) {
      merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
    }
    return merged
  }

  export const state = Instance.state(async () => {
    const auth = await Auth.all()

    // Config loading order (low -> high precedence): https://opencode.ai/docs/config#precedence-order
    // 1) Remote .well-known/opencode (org defaults)
    // 2) Global config (~/.config/opencode/opencode.json{,c})
    // 3) Custom config (OPENCODE_CONFIG)
    // 4) Project config (opencode.json{,c})
    // 5) .opencode directories (.opencode/agents/, .opencode/commands/, .opencode/plugins/, .opencode/opencode.json{,c})
    // 6) Inline config (OPENCODE_CONFIG_CONTENT)
    // Managed config directory is enterprise-only and always overrides everything above.
    let result: Info = {}
    for (const [key, value] of Object.entries(auth)) {
      if (value.type === "wellknown") {
        process.env[value.key] = value.token
        log.debug("fetching remote config", { url: `${key}/.well-known/opencode` })
        const response = await fetch(`${key}/.well-known/opencode`)
        if (!response.ok) {
          throw new Error(`failed to fetch remote config from ${key}: ${response.status}`)
        }
        const wellknown = (await response.json()) as any
        const remoteConfig = wellknown.config ?? {}
        // Add $schema to prevent load() from trying to write back to a non-existent file
        if (!remoteConfig.$schema) remoteConfig.$schema = "https://opencode.ai/config.json"
        result = mergeConfigConcatArrays(
          result,
          await load(JSON.stringify(remoteConfig), `${key}/.well-known/opencode`),
        )
        log.debug("loaded remote config from well-known", { url: key })
      }
    }

    // Global user config overrides remote config.
    result = mergeConfigConcatArrays(result, await global())

    // Custom config path overrides global config.
    if (Flag.OPENCODE_CONFIG) {
      result = mergeConfigConcatArrays(result, await loadFile(Flag.OPENCODE_CONFIG))
      log.debug("loaded custom config", { path: Flag.OPENCODE_CONFIG })
    }

    // Project config overrides global and remote config.
    if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
      for (const file of ["opencode.jsonc", "opencode.json"]) {
        const found = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
        for (const resolved of found.toReversed()) {
          result = mergeConfigConcatArrays(result, await loadFile(resolved))
        }
      }
    }

    // Inline config content has highest precedence
    if (Flag.OPENCODE_CONFIG_CONTENT) {
      log.debug("loaded custom config from OPENCODE_CONFIG_CONTENT")
      result = mergeConfigConcatArrays(result, JSON.parse(Flag.OPENCODE_CONFIG_CONTENT))
    }

    result.agent = result.agent || {}
    result.mode = result.mode || {}
    result.plugin = result.plugin || []
    
    const base = result

    const directories = [
      Global.Path.config,
      // Only scan project .opencode/ directories when project discovery is enabled
      ...(!Flag.OPENCODE_DISABLE_PROJECT_CONFIG
        ? await Array.fromAsync(
            Filesystem.up({
              targets: [".opencode"],
              start: Instance.directory,
              stop: Instance.worktree,
            }),
          )
        : []),
      // Always scan ~/.opencode/ (user home directory)
      ...(await Array.fromAsync(
        Filesystem.up({
          targets: [".opencode"],
          start: Global.Path.home,
          stop: Global.Path.home,
        }),
      )),
      ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),
    ]

    // .opencode directory config overrides (project and global) config sources.
    if (Flag.OPENCODE_CONFIG_DIR) {
      directories.push(Flag.OPENCODE_CONFIG_DIR)
      log.debug("loading config from OPENCODE_CONFIG_DIR", { path: Flag.OPENCODE_CONFIG_DIR })
    }

    let finalResult = await unique(directories).reduce(async (accPromise, dir) => {
      const acc = await accPromise

      const withDirConfig: any =
        dir.endsWith(".opencode") || dir === Flag.OPENCODE_CONFIG_DIR
          ? await ["opencode.jsonc", "opencode.json"].reduce(async (innerAccPromise, file) => {
              const innerAcc = await innerAccPromise
              const filePath = path.join(dir, file)
              log.debug(`loading config from ${filePath}`)
              const loaded = await loadFile(filePath)
              return mergeConfigConcatArrays(innerAcc, {
                ...loaded,
                agent: loaded.agent ?? {},
                mode: loaded.mode ?? {},
                plugin: loaded.plugin ?? [],
              })
            }, Promise.resolve(acc))
          : acc

      const shouldInstall = await needsInstall(dir)
      if (shouldInstall) {
        await installDependencies(dir)
      }

      return {
        ...withDirConfig,
        command: mergeDeep(withDirConfig.command ?? {}, await loadCommand(dir)),
        // Merge agents and modes into agent for backwards compatibility
        agent: mergeDeep(
          withDirConfig.agent ?? {},
          mergeDeep(await loadAgent(dir), await loadMode(dir)),
        ),
        plugin: [...(withDirConfig.plugin ?? []), ...(await loadPlugin(dir))],
      } as any
    }, Promise.resolve(base as any))

    // Inline config content overrides all non-managed config sources.
    if (Flag.OPENCODE_CONFIG_CONTENT) {
      finalResult = mergeConfigConcatArrays(finalResult, JSON.parse(Flag.OPENCODE_CONFIG_CONTENT))
      log.debug("loaded custom config from OPENCODE_CONFIG_CONTENT")
    }

    // Load managed config files last (highest priority) - enterprise admin-controlled
    // Kept separate from directories array to avoid write operations when installing plugins
    // which would fail on system directories requiring elevated permissions
    // This way it only loads config file and not skills/plugins/commands
    if (existsSync(managedConfigDir)) {
      for (const file of ["opencode.jsonc", "opencode.json"]) {
        finalResult = mergeConfigConcatArrays(finalResult, await loadFile(path.join(managedConfigDir, file)))
      }
    }

    // Migrate deprecated mode field to agent field
    const withMigratedModes = Object.entries(finalResult.mode ?? {}).reduce(
      (acc, [name, mode]) => ({
        ...acc,
        agent: mergeDeep(acc.agent ?? {}, {
          [name]: {
            ...(mode as any),
            mode: "primary" as const,
          },
        }),
      }),
      finalResult,
    )

    const withPermissions = Flag.OPENCODE_PERMISSION
      ? {
          ...withMigratedModes,
          permission: mergeDeep(
            withMigratedModes.permission ?? {},
            JSON.parse(Flag.OPENCODE_PERMISSION),
          ),
        }
      : withMigratedModes

    // Backwards compatibility: legacy top-level `tools` config
    const withLegacyTools = withPermissions.tools
      ? {
          ...withPermissions,
          permission: mergeDeep(
            Object.entries(withPermissions.tools).reduce((acc, [tool, enabled]) => {
              const action: Config.PermissionAction = enabled ? "allow" : "deny"
              return tool === "write" || tool === "edit" || tool === "patch" || tool === "multiedit"
                ? { ...acc, edit: action }
                : { ...acc, [tool]: action }
            }, {} as Record<string, Config.PermissionAction>),
            withPermissions.permission ?? {},
          ),
        }
      : withPermissions

    const finalConfig = {
      ...withLegacyTools,
      username: withLegacyTools.username || os.userInfo().username,
      share:
        withLegacyTools.autoshare === true && !withLegacyTools.share
          ? ("auto" as const)
          : withLegacyTools.share,
      keybinds: withLegacyTools.keybinds || Info.shape.keybinds.parse({}),
      compaction: {
        ...withLegacyTools.compaction,
        ...(Flag.OPENCODE_DISABLE_AUTOCOMPACT ? { auto: false } : {}),
        ...(Flag.OPENCODE_DISABLE_PRUNE ? { prune: false } : {}),
      },
      plugin: Array.from(new Set(withLegacyTools.plugin ?? [])),
    }

    return {
      config: finalConfig,
      directories,
    }
  })

  export async function installDependencies(dir: string) {
    const pkg = path.join(dir, "package.json")
    const targetVersion = Installation.isLocal() ? "latest" : Installation.VERSION

    if (!(await Bun.file(pkg).exists())) {
      await Bun.write(pkg, "{}")
    }

    const gitignore = path.join(dir, ".gitignore")
    const hasGitIgnore = await Bun.file(gitignore).exists()
    if (!hasGitIgnore) await Bun.write(gitignore, ["node_modules", "package.json", "bun.lock", ".gitignore"].join("\n"))

    await BunProc.run(["add", `@opencode-ai/plugin@${targetVersion}`, "--exact"], {
      cwd: dir,
    }).catch(() => {})

    // Install any additional dependencies defined in the package.json
    // This allows local plugins and custom tools to use external packages
    await BunProc.run(["install"], { cwd: dir }).catch(() => {})
  }

  async function needsInstall(dir: string) {
    const nodeModules = path.join(dir, "node_modules")
    if (!existsSync(nodeModules)) return true

    const pkg = path.join(dir, "package.json")
    const pkgFile = Bun.file(pkg)
    const pkgExists = await pkgFile.exists()
    if (!pkgExists) return true

    const parsed = await pkgFile.json().catch(() => null)
    const dependencies = parsed?.dependencies ?? {}
    const depVersion = dependencies["@opencode-ai/plugin"]
    if (!depVersion) return true

    const targetVersion = Installation.isLocal() ? "latest" : Installation.VERSION
    if (targetVersion === "latest") {
      const isOutdated = await PackageRegistry.isOutdated("@opencode-ai/plugin", depVersion, dir)
      if (!isOutdated) return false
      log.info("Cached version is outdated, proceeding with install", {
        pkg: "@opencode-ai/plugin",
        cachedVersion: depVersion,
      })
      return true
    }
    if (depVersion === targetVersion) return false
    return true
  }

  function rel(item: string, patterns: string[]) {
    const pattern = patterns.find((p) => item.includes(p))
    return pattern ? item.slice(item.indexOf(pattern) + pattern.length) : undefined
  }

  function trim(file: string) {
    const ext = path.extname(file)
    return ext.length ? file.slice(0, -ext.length) : file
  }

  const COMMAND_GLOB = new Bun.Glob("{command,commands}/**/*.md")
  async function loadCommand(dir: string) {
    const items = await Array.fromAsync(
      COMMAND_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: true,
        cwd: dir,
      }),
    )

    return (
      await Promise.all(
        items.map(async (item) => {
          const md = await ConfigMarkdown.parse(item).catch(async (err) => {
            const message = ConfigMarkdown.FrontmatterError.isInstance(err)
              ? err.data.message
              : `Failed to parse command ${item}`
            const { Session } = await import("@/session")
            Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
            log.error("failed to load command", { command: item, err })
            return undefined
          })

          return md
            ? (() => {
                const patterns = [
                  "/.opencode/command/",
                  "/.opencode/commands/",
                  "/command/",
                  "/commands/",
                ]
                const file = rel(item, patterns) ?? path.basename(item)
                const name = trim(file)
                const config = {
                  name,
                  ...md.data,
                  template: md.content.trim(),
                }
                const parsed = Command.safeParse(config)
                return parsed.success
                  ? { name: config.name, data: parsed.data }
                  : (() => {
                      throw new InvalidError(
                        { path: item, issues: parsed.error.issues },
                        { cause: parsed.error },
                      )
                    })()
              })()
            : undefined
        }),
      )
    ).reduce(
      (acc, item) => (item ? { ...acc, [item.name]: item.data } : acc),
      {} as Record<string, Command>,
    )
  }

  const AGENT_GLOB = new Bun.Glob("{agent,agents}/**/*.md")
  async function loadAgent(dir: string) {
    const items = await Array.fromAsync(
      AGENT_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: true,
        cwd: dir,
      }),
    )

    return (
      await Promise.all(
        items.map(async (item) => {
          const md = await ConfigMarkdown.parse(item).catch(async (err) => {
            const message = ConfigMarkdown.FrontmatterError.isInstance(err)
              ? err.data.message
              : `Failed to parse agent ${item}`
            const { Session } = await import("@/session")
            Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
            log.error("failed to load agent", { agent: item, err })
            return undefined
          })

          return md
            ? (() => {
                const patterns = ["/.opencode/agent/", "/.opencode/agents/", "/agent/", "/agents/"]
                const file = rel(item, patterns) ?? path.basename(item)
                const agentName = trim(file)
                const config = {
                  name: agentName,
                  ...md.data,
                  // TODO: This should be parsed by the agent schema
                  model: md.data.model,
                  system: md.content.trim(),
                }
                const parsed = Agent.safeParse(config)
                return parsed.success
                  ? { name: config.name, data: parsed.data }
                  : (() => {
                      throw new InvalidError(
                        { path: item, issues: parsed.error.issues },
                        { cause: parsed.error },
                      )
                    })()
              })()
            : undefined
        }),
      )
    ).reduce(
      (acc, item) => (item ? { ...acc, [item.name]: item.data } : acc),
      {} as Record<string, Agent>,
    )
  }

  const MODE_GLOB = new Bun.Glob("{mode,modes}/**/*.json")
  async function loadMode(dir: string) {
    const items = await Array.fromAsync(
      MODE_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: true,
        cwd: dir,
      }),
    )

    return (
      await Promise.all(
        items.map(async (item) => {
          const content = await Bun.file(item).text()
          const parsed = parseJsonc(content)
          // TODO: validate schema
          const name = path.basename(item, path.extname(item))
          return { name, data: parsed }
        }),
      )
    ).reduce(
      (acc, item) => ({ ...acc, [item.name]: item.data }),
      {} as Record<string, any>,
    )
  }

  const PLUGIN_GLOB = new Bun.Glob("{plugin,plugins}/**/*.json")
  async function loadPlugin(dir: string) {
    const items = await Array.fromAsync(
      PLUGIN_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: true,
        cwd: dir,
      }),
    )

    return (
      await Promise.all(
        items.map(async (item) => {
          const content = await Bun.file(item).text()
          const parsed = parseJsonc(content)
          const result = z.any().safeParse(parsed)
          return result.success
            ? result.data
            : (() => {
                throw new InvalidError(
                  { path: item, issues: result.error.issues },
                  { cause: result.error },
                )
              })()
        }),
      )
    ).flat()
  }

  export const InvalidError = NamedError.create(
    "ConfigInvalidError",
    z.object({
      path: z.string(),
      issues: z.array(z.any()),
    }),
  )

  async function loadFile(filepath: string): Promise<Info> {
    const file = Bun.file(filepath)
    if (!(await file.exists())) return {}

    const content = await file.text()
    if (!content.trim()) return {}

    const errors: any[] = []
    const parsed = parseJsonc(content, errors, { allowTrailingComma: true })

    if (errors.length > 0) {
      const error = errors[0]
      const { line, column } = getLineColumn(content, error.offset)
      throw new NamedError.ConfigParse({
        path: filepath,
        line,
        column,
        message: printParseErrorCode(error.error),
      })
    }

    // Validate schema
    const result = Info.safeParse(parsed)
    if (!result.success) {
      throw new InvalidError({
        path: filepath,
        issues: result.error.issues,
      })
    }

    return result.data
  }

  async function load(content: string, source: string): Promise<Info> {
    if (!content.trim()) return {}

    const errors: any[] = []
    const parsed = parseJsonc(content, errors, { allowTrailingComma: true })

    if (errors.length > 0) {
      const error = errors[0]
      const { line, column } = getLineColumn(content, error.offset)
      throw new NamedError.ConfigParse({
        path: source,
        line,
        column,
        message: printParseErrorCode(error.error),
      })
    }

    const result = Info.safeParse(parsed)
    if (!result.success) {
      throw new InvalidError({
        path: source,
        issues: result.error.issues,
      })
    }

    return result.data
  }

  function getLineColumn(text: string, offset: number) {
    let line = 1
    let column = 1
    for (let i = 0; i < offset; i++) {
      if (text[i] === "\n") {
        line++
        column = 1
      } else {
        column++
      }
    }
    return { line, column }
  }

  async function global(): Promise<Info> {
    const locations = [
      path.join(Global.Path.config, "opencode.json"),
      path.join(Global.Path.config, "opencode.jsonc"),
    ]

    for (const location of locations) {
      if (await Bun.file(location).exists()) {
        log.debug("loaded global config", { path: location })
        return loadFile(location)
      }
    }

    return {}
  }

  export async function get() {
    return (await state()).config
  }

  export const Info = z.object({
    $schema: z.string().optional(),
    username: z.string().optional(),
    share: z.enum(["auto", "yes", "no"]).optional(),
    autoshare: z.boolean().optional(), // deprecated
    keybinds: z.record(z.string(), z.string()).optional(),
    compaction: z
      .object({
        auto: z.boolean().optional(),
        prune: z.boolean().optional(),
      })
      .optional(),
    agent: z.record(z.string(), z.any()).optional(),
    mode: z.record(z.string(), z.any()).optional(), // deprecated
    plugin: z.array(z.string()).optional(),
    instructions: z.array(z.string()).optional(),
    permission: z.record(z.string(), z.union([z.literal("allow"), z.literal("deny")])).optional(),
    tools: z.record(z.string(), z.boolean()).optional(), // deprecated
    provider: z.record(z.string(), z.any()).optional(),
  })
  export type Info = z.infer<typeof Info>

  export const Command = z.object({
    description: z.string().optional(),
    parameters: z.any().optional(),
    template: z.string(),
  })
  export type Command = z.infer<typeof Command>

  export const Agent = z.object({
    description: z.string().optional(),
    model: z.string().optional(),
    system: z.string(),
    temperature: z.number().optional(),
  })
  export type Agent = z.infer<typeof Agent>

  export type PermissionAction = "allow" | "deny"
}
