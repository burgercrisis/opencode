import z from "zod"
import { spawn } from "child_process"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { iife } from "@/util/iife"
import { Language } from "web-tree-sitter"

import { $ } from "bun"
import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"
import { Config } from "../config/config"

import { BashArity } from "@/permission/arity"
import { Truncate } from "./truncation"
import { Plugin } from "@/plugin"
import { TOOL } from "../constants"
import { createUnifiedErrorProcessor, detectShellType } from "./error-processors"
import type { ShellType } from "./error-processor"

export const log = Log.create({ service: "bash-tool" })

// Unified error processor for all shell types
const unifiedErrorProcessor = createUnifiedErrorProcessor()

export const _resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

/**
 * Fallback parser for complex shell constructs when tree-sitter fails
 * Uses simple string parsing to extract basic command information
 */
async function parseCommandWithFallback(command: string, cwd: string): Promise<{
  directories: Set<string>
  patterns: Set<string>
  always: Set<string>
}> {
  const directories = new Set<string>()
  const patterns = new Set<string>()
  const always = new Set<string>()

  try {
    // Split on common shell operators to extract individual commands
    const commands = command.split(/(?:&&|\|\||;|\n|\|)/).map(cmd => cmd.trim()).filter(Boolean)

    for (const cmd of commands) {
      // Simple tokenization - split on whitespace but respect quotes
      const tokens = cmd.match(/(?:[^\s"'`]|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)+/g) || []

      if (tokens.length === 0) continue

      const [commandName, ...args] = tokens

      // Handle common file system commands
      if (commandName && ["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(commandName)) {
        for (const arg of args) {
          // Skip flags and options
          if (arg.startsWith("-") || (commandName === "chmod" && arg.startsWith("+"))) continue

          // Remove surrounding quotes if present
          const cleanArg = arg.replace(/^["'`]|["'`]$/g, '').replace(/\\(.)/g, '$1')

          try {
            const resolved = path.resolve(cwd, cleanArg)
            const normalized = Filesystem.normalize(resolved)
            if (!Instance.containsPath(normalized)) {
              const dir = (await Filesystem.isDir(normalized)) ? normalized : Filesystem.dirname(normalized)
              directories.add(dir)
            }
          } catch {
            // If path resolution fails, skip this argument
            continue
          }
        }
      }

      // Add pattern for non-cd commands
      if (commandName && commandName !== "cd") {
        patterns.add(cmd)
        always.add(commandName + " *")
      }
    }
  } catch (error) {
    log.warn("Fallback parsing failed", { error, command })
  }

  return { directories, patterns, always }
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = _resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = _resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

/**
 * Process command output using the unified error processing framework
 * @param output - The raw command output
 * @param command - The original command that was executed
 * @param shellType - The type of shell that executed the command
 * @returns Processed output with enhanced error messages and error detection
 */
export function processCommandOutput(
  output: string,
  command: string,
  shellType?: ShellType
): { output: string; hasErrors: boolean; exitCode?: number } {
  // Detect shell type if not provided
  const detectedShellType = shellType || detectShellType(command)

  // Process using unified framework
  const result = unifiedErrorProcessor.process(output, command, detectedShellType)

  return {
    output: result.output,
    hasErrors: result.hasErrors,
    exitCode: result.exitCode
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use processCommandOutput instead
 */
export function processPowerShellOutput(output: string, command: string): { output: string; hasErrors: boolean } {
  const result = processCommandOutput(output, command, 'powershell')
  return { output: result.output, hasErrors: result.hasErrors }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use processCommandOutput instead
 */
export function processCmdOutput(output: string, command: string): { output: string; hasErrors: boolean; exitCode?: number } {
  return processCommandOutput(output, command, 'cmd')
}



// TODO: we may wanna rename this tool so it works better on other shells
const parameters = z.object({
  command: z.string().describe("The command to execute"),
  timeout: z.number().describe("Optional timeout in milliseconds").optional(),
  workdir: z
    .string()
    .describe(
      "The working directory to run the command in. Defaults to the current project directory. Use this instead of 'cd' commands.",
    )
    .optional(),
  description: z
    .string()
    .describe(
      "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
    ),
})

export const BashTool = Tool.define<
  typeof parameters,
  {
    exit: number
    output: string
    description: string
    truncated: boolean
    outputPath?: string
  }
>("bash", async () => {
  const dir = iife(() => {
    try {
      return Instance.directory
    } catch {
      return "current directory"
    }
  })
  return {
    description: DESCRIPTION.replaceAll("${directory}", dir)
      .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
      .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
    parameters,
    async execute(params, ctx) {
      const cwd = params.workdir ? Filesystem.normalize(params.workdir) : Instance.directory
      const timeout = (() => {
        if (params.timeout !== undefined && params.timeout < 0) {
          throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
        }
        const powershellJobCmdlets = /(Start-Job|Receive-Job|Wait-Job|Get-Job|Stop-Job|Remove-Job)/i
        return powershellJobCmdlets.test(params.command)
          ? Math.max(params.timeout ?? TOOL.BASH_DEFAULT_TIMEOUT, 10 * 60 * 1000)
          : params.timeout ?? TOOL.BASH_DEFAULT_TIMEOUT
      })()

      // Initialize directories, patterns, and always sets
      const directories = Instance.containsPath(cwd) ? new Set<string>() : new Set([Filesystem.normalize(cwd)])
      const patterns = new Set<string>()
      const always = new Set<string>()

      // Try tree-sitter parsing first, fallback to simple string parsing if it fails
      try {
        const tree = await parser().then((p) => p.parse(params.command))
        const _tree = !tree ? (() => { throw new Error("Failed to parse command") })() : tree

        for (const node of _tree.rootNode.descendantsOfType("command")) {
          if (!node) continue

          // Get full command text including redirects if present
          const commandText = node.parent?.type === "redirected_statement" ? node.parent.text : node.text

          const command = Array.from({ length: node.childCount })
            .map((_, i) => node.child(i))
            .filter(
              (child): child is NonNullable<typeof child> =>
                !!child && ["command_name", "word", "string", "raw_string", "concatenation"].includes(child.type),
            )
            .map((child) => child.text)

          if (command.length === 0) continue

          // not an exhaustive list, but covers most common cases
          if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(command[0])) {
            for (const arg of command.slice(1)) {
              if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue

              const resolved = await (async () => {
                try {
                  // Try shell realpath first as it handles Git Bash paths better
                  const shellPath = await $`realpath ${arg}`
                    .cwd(cwd)
                    .quiet()
                    .nothrow()
                    .text()
                    .then((x) => x.trim())
                  if (shellPath) return shellPath
                } catch {
                  // Fallback to node-native resolution
                }
                try {
                  return Filesystem.getCanonicalPath(path.resolve(cwd, arg))
                } catch {
                  return path.resolve(cwd, arg)
                }
              })()

              const normalized = Filesystem.normalize(resolved)
              if (!Instance.containsPath(normalized)) {
                const dir = (await Filesystem.isDir(normalized)) ? normalized : Filesystem.dirname(normalized)
                directories.add(dir)
              }
            }
          }

          if (command.length && command[0] !== "cd") {
            patterns.add(commandText)
            always.add(BashArity.prefix(command).join(" ") + " *")
          }
        }
      } catch (parsingError) {
        log.warn("Tree-sitter parsing failed, using fallback parser", {
          command: params.command,
          error: parsingError instanceof Error ? parsingError.message : String(parsingError)
        })

        // Use fallback parser for complex shell constructs
        const fallbackResult = await parseCommandWithFallback(params.command, cwd)

        // Merge fallback results with existing sets
        for (const dir of fallbackResult.directories) {
          directories.add(dir)
        }
        for (const pattern of fallbackResult.patterns) {
          patterns.add(pattern)
        }
        for (const alwaysPattern of fallbackResult.always) {
          always.add(alwaysPattern)
        }
      }

      if (directories.size > 0) {
        await ctx.ask({
          permission: "external_directory",
          patterns: Array.from(directories).map((x) => Filesystem.join(x, "*")),
          always: Array.from(directories).map((x) => Filesystem.join(x, "*")),
          metadata: {},
        })
      }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      const baseEnv = iife(() => {
        const initial = { ...process.env }
        if (process.platform !== "win32") return initial
        return Object.entries(initial).reduce((acc, [key, value]) => {
          const newKey = key.toUpperCase()
          const newValue = value ? value.replace(/%([^%]+)%/g, (_, name) => {
            const val = initial[name] || initial[name.toUpperCase()]
            return val !== undefined ? val : `%${name}%`
          }) : value
          if (newValue === undefined) return acc
          return { ...acc, [newKey]: newValue }
        }, {} as Record<string, string>)
      })

      const { processedCommand, finalEnv } = iife(() => {
        let initialProcessedCommand = params.command
        const initialEnv = baseEnv

        if (process.platform !== "win32") return { processedCommand: initialProcessedCommand, finalEnv: initialEnv }

        // Handle CMD-style variable expansion for chained commands
        // This fixes issues like: set TEST_VAR=test && cmd /c echo %TEST_VAR%
        if (Shell.isCmdCommand(initialProcessedCommand) && initialProcessedCommand.includes("&&")) {
          // For chained commands with variables, ensure they execute in the same shell context
          // by wrapping them properly
          const match = initialProcessedCommand.match(/^(cmd(?:\.exe)?)\s+(\/[ck])\s+(.*)$/i)
          if (match) {
            const [, cmdExe, cmdSwitch, rest] = match
            // If we have chained commands with variables, ensure proper expansion
            if (rest.includes("&&") && /%\w+%/.test(rest)) {
              // Convert to delayed expansion if needed, or at least handle the quoting
              // The shell.ts getSpawnConfig will handle /V:ON if it sees && and dynamic vars
              initialProcessedCommand = `${cmdExe} ${cmdSwitch} ${rest}`
            }
          }
        }

        const step2 =
          initialProcessedCommand.includes("set") && initialProcessedCommand.includes("&&") && Shell.isCmdCommand(initialProcessedCommand)
            ? iife(() => {
              const setMatch = initialProcessedCommand.match(/set\s+(\w+)=([^&]+)/i)
              return setMatch
                ? { cmd: initialProcessedCommand, env: { ...initialEnv, [setMatch[1]]: setMatch[2] } }
                : { cmd: initialProcessedCommand, env: initialEnv }
            })
            : { cmd: initialProcessedCommand, env: initialEnv }

        log.info("BashTool processed command", {
          original: params.command,
          processed: step2.cmd
        })

        return { processedCommand: step2.cmd, finalEnv: step2.env }
      })

      const config = await Config.get()
      const spawnConfig = Shell.getSpawnConfig(processedCommand, config.shell)
      const mergedEnv = { ...finalEnv, ...spawnConfig.env } as Record<string, string>

      Shell.isCmdBuiltin(processedCommand) && log.info("Detected bare CMD builtin, automatically wrapping", {
        command: processedCommand.substring(0, 100),
      })

      const shellEnv = await Plugin.trigger("shell.env", { cwd }, { env: {} })
      const proc = Bun.spawn([spawnConfig.executable, ...spawnConfig.args], {
        cwd,
        env: {
          ...mergedEnv,
          ...shellEnv.env,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
        windowsVerbatimArguments: spawnConfig.windowsVerbatimArguments,
      })

      const decoder = new TextDecoder()
      const read = async (reader: ReadableStreamDefaultReader<Uint8Array>, acc: string): Promise<string> => {
        const result = await reader.read()
        const chunk = result.value ? decoder.decode(result.value) : ""
        const newAcc = acc + chunk
        ctx.metadata({
          metadata: {
            output: newAcc.length > TOOL.MAX_METADATA_LENGTH
              ? newAcc.slice(0, TOOL.MAX_METADATA_LENGTH) + "\n\n..."
              : newAcc,
            description: params.description,
          } as any,
        })
        if (result.done) return acc
        return read(reader, newAcc)
      }

      const kill = () => Shell.killTree(proc as any)

      const [output, status] = await Promise.all([
        Promise.all([
          read(proc.stdout.getReader(), ""),
          read(proc.stderr.getReader(), ""),
        ]).then(([out, err]) => out + err),
        new Promise<{ timedOut: boolean; aborted: boolean; exited: boolean }>((resolve, reject) => {
          const timeoutTimer = setTimeout(() => {
            kill().then(() => resolve({ timedOut: true, aborted: false, exited: true }))
          }, timeout + 100)

          const abortHandler = () => {
            clearTimeout(timeoutTimer)
            kill().then(() => resolve({ timedOut: false, aborted: true, exited: true }))
          }

          ctx.abort.addEventListener("abort", abortHandler, { once: true })

          proc.exited.then(() => {
            clearTimeout(timeoutTimer)
            ctx.abort.removeEventListener("abort", abortHandler)
            resolve({ timedOut: false, aborted: false, exited: true })
          }).catch(reject)
        }),
      ])

      const { output: finalOutput, hasErrors, exitCode: overrideExitCode } = iife((): { output: string; hasErrors: boolean; exitCode?: number } => {
        // Use unified error processing framework
        const shellType = detectShellType(processedCommand)
        const result = processCommandOutput(output, processedCommand, shellType)

        log.info("Command output processed with unified framework", {
          shellType,
          hasErrors: result.hasErrors,
          outputLength: result.output.length,
          firstLine: result.output.split('\n')[0],
          exitCode: result.exitCode
        })

        return result
      })

      const resultMetadata = [
        status.timedOut ? `bash tool terminated command after exceeding timeout ${timeout} ms` : null,
        status.aborted ? "User aborted the command" : null,
      ].filter((x): x is string => x !== null)

      const outputWithMetadata =
        resultMetadata.length > 0
          ? finalOutput + "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
          : finalOutput

      const normalizedOutput = outputWithMetadata.replace(/\r\n/g, "\n")
      const exitCode = status.timedOut
        ? 124
        : (status.aborted
          ? 130
          : (overrideExitCode ?? Shell.normalizeExitCode(proc.exitCode, hasErrors)))

      const truncated = await Truncate.output(normalizedOutput, {}, undefined)

      return {
        title: params.description,
        metadata: {
          output:
            truncated.content.length > TOOL.MAX_METADATA_LENGTH
              ? truncated.content.slice(0, TOOL.MAX_METADATA_LENGTH) + "\n\n..."
              : truncated.content,
          exit: exitCode,
          description: params.description,
          truncated: truncated.truncated,
          outputPath: truncated.truncated ? (truncated as any).outputPath : undefined,
        },
        output: truncated.content,
      }
    },
  }
})
