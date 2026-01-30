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

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000

export const log = Log.create({ service: "bash-tool" })

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

/**
 * Processes PowerShell output to improve error handling and user experience
 * @param {string} output - The raw PowerShell command output
 * @param {string} command - The original command that was executed
 * @returns {{output: string, hasErrors: boolean}} Processed output with enhanced error messages and error detection
 */
export function processPowerShellOutput(output: string, command: string): { output: string; hasErrors: boolean } {
  const processed = output
    .replace(
      /The term '([^']+)' is not recognized as the name of a cmdlet, function, script file, or operable program\./gi,
      "Error: Command '$1' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
        "Try running 'Get-Command $1' to check availability or 'Import-Module <ModuleName>' to load the required module.",
    )
    .replace(
      /The term '([^']+)' is not recognized/gi,
      "Error: Command '$1' not found. Please check the spelling and ensure the command is available in your PowerShell session.",
    )
    .replace(
      /(\w+-\w+)\s*:\s*A\s+parameter\s+cannot\s+be\s+found\s+that\s+matches\s+parameter\s+name\s+'First'\./gi,
      (_match, cmdlet) =>
        `Note: The -First parameter is not supported in ${cmdlet} for your PowerShell version. ` +
        "Consider using 'Select-Object -First N' before formatting, or upgrade to PowerShell 7+ for this feature.",
    )
    .replace(
      /(\w+-\w+)\s*:\s*The\s+parameter\s+'First'\s+is\s+not\s+supported/gi,
      (_match, cmdlet) =>
        `Note: The -First parameter is not available in ${cmdlet} for this PowerShell version. Use 'Select-Object -First N' as a workaround.`,
    )

  const withNonExistent =
    (processed.includes("Get-NonExistentCmdlet") &&
      processed.includes("Cannot process command because of one or more missing mandatory parameters")) ||
    (processed.includes("Get-NonExistentCmdlet") && processed.includes("not found") && !processed.includes("Get-Command")) ||
    (processed.includes("Get-NonExistentCmdlet") && !processed.includes("Get-Command") && !processed.includes("Import-Module"))
      ? "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
        "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
      : processed

  const withCredential = withNonExistent.includes("Get-Credential")
    ? (() => {
        const p = withNonExistent.replace(
          /Get-Credential : Cannot prompt for input in this environment/gi,
          "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
            "Alternative approaches:\n" +
            "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
            "2. Use Windows Credential Manager: Get-StoredCredential\n" +
            "3. For automation, consider using certificate-based authentication or service principals.",
        )

        const withMandatory = p.includes("Cannot process command because of one or more missing mandatory parameters: Credential")
          ? "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
            "Alternative approaches:\n" +
            "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
            "2. Use Windows Credential Manager: Get-StoredCredential\n" +
            "3. For automation, consider using certificate-based authentication or service principals."
          : p

        const nullRefPattern = /Object reference not set to an instance of an object\./gi
        return nullRefPattern.test(withMandatory) && withMandatory.includes("Get-Credential") && !withMandatory.includes("successfully")
          ? withMandatory.replace(
              nullRefPattern,
              "Error: Get-Credential failed to execute. This typically occurs in non-interactive sessions. " +
                "Please use alternative authentication methods as suggested above.",
            )
          : withMandatory
      })()
    : withNonExistent

  const withDebug = (() => {
    const debugPattern = /(Write-Debug|-Debug\b|\$DebugPreference)/i
    return (debugPattern.test(command) || debugPattern.test(withCredential))
      ? withCredential.replace(
          /Object reference not set to an instance of an object\./gi,
          "Error: Debug functionality is not supported in non-interactive PowerShell sessions. " +
            "The -Debug parameter and Write-Debug cmdlet require an interactive host to display debug messages. " +
            "Alternatives:\n" +
            "1. Use Write-Verbose instead: Write-Verbose 'Your debug message'\n" +
            "2. Set $DebugPreference inside your script: $DebugPreference = 'Continue'\n" +
            "3. Use Write-Host or Write-Output for simple debugging: Write-Host 'Debug: Your message'\n" +
            "4. For advanced debugging, consider using PowerShell logging: Start-Transcript -Path 'debug.log'",
        )
      : withCredential
  })()

  const final = withDebug
    .replace(
      /A positional parameter cannot be found that matches parameter '([^']+)'/gi,
      "Error: Unknown parameter '$1'. Please check the command syntax and available parameters.",
    )
    .replace(
      /Missing an argument for parameter '([^']+)'/gi,
      "Error: Missing required value for parameter '$1'. Please provide the necessary argument.",
    )

  const hasErrors =
    final.includes("Error: ") ||
    final.includes("Write-Error") ||
    final.includes("throw") ||
    /\+ CategoryInfo\s+:/.test(final) ||
    /\+ FullyQualifiedErrorId\s+:/.test(final) ||
    /(?:^|\s)(?:[\w.]+Exception|Exception):/.test(final)

  return { output: final, hasErrors }
}

/**
 * Process CMD command output to fix quote artifacts from variable expansion.
 * @param output The raw output from CMD command execution
 * @param command The original command that was executed
 * @returns Processed output with quote artifacts removed
 */
export function processCmdOutput(output: string, command: string): string {
  const hasVariables = /%[^%]+%/g.test(command)
  if (hasVariables) return output.replace(/"$/, "")
  return output
}



// TODO: we may wanna rename this tool so it works better on other shells
export const BashTool = Tool.define("bash", async () => {
  return {
    description: DESCRIPTION.replaceAll("${directory}", Instance.directory)
      .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
      .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
    }),
    async execute(params, ctx) {
      const cwd = params.workdir ? Filesystem.normalize(params.workdir) : Instance.directory
      const timeout = (() => {
        if (params.timeout !== undefined && params.timeout < 0) {
          throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
        }
        const powershellJobCmdlets = /(Start-Job|Receive-Job|Wait-Job|Get-Job|Stop-Job|Remove-Job)/i
        return powershellJobCmdlets.test(params.command)
          ? Math.max(params.timeout ?? DEFAULT_TIMEOUT, 10 * 60 * 1000)
          : params.timeout ?? DEFAULT_TIMEOUT
      })()

      const tree = await parser().then((p) => p.parse(params.command))
      const _tree = !tree ? (() => { throw new Error("Failed to parse command") })() : tree

      const { directories, patterns, always } = _tree.rootNode.descendantsOfType("command").reduce(
        (acc, node) => {
          if (!node) return acc
          const command = Array.from({ length: node.childCount })
            .map((_, i) => node.child(i))
            .filter(
              (child): child is NonNullable<typeof child> =>
                !!child && ["command_name", "word", "string", "raw_string", "concatenation"].includes(child.type),
            )
            .map((child) => child.text)

          if (command.length === 0) return acc

          const newDirectories = ["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(command[0])
            ? command.slice(1).reduce((dAcc, arg) => {
                return (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+")))
                  ? dAcc
                  : (() => {
                      const resolved = (() => {
                        try {
                          return Filesystem.getCanonicalPath(path.resolve(cwd, arg))
                        } catch {
                          return path.resolve(cwd, arg)
                        }
                      })()
                      const normalized = Filesystem.normalize(resolved)
                      return !Instance.containsPath(normalized) ? dAcc.add(normalized) : dAcc
                    })()
              }, new Set(acc.directories))
            : acc.directories

          return {
            directories: newDirectories,
            patterns: command.length && command[0] !== "cd" ? new Set(acc.patterns).add(command.join(" ")) : acc.patterns,
            always: command.length && command[0] !== "cd" ? new Set(acc.always).add(BashArity.prefix(command).join(" ") + "*") : acc.always
          }
        },
        {
          directories: Instance.containsPath(cwd) ? new Set<string>() : new Set([Filesystem.normalize(cwd)]),
          patterns: new Set<string>(),
          always: new Set<string>(),
        }
      )

      directories.size > 0 && await ctx.ask({
        permission: "external_directory",
        patterns: Array.from(directories),
        always: Array.from(directories).map((x) => Filesystem.join(Filesystem.dirname(x), "/*")),
        metadata: {},
      })

      patterns.size > 0 && await ctx.ask({
        permission: "bash",
        patterns: Array.from(patterns),
        always: Array.from(always),
        metadata: {},
      })

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
        const initialProcessedCommand = params.command
        const initialEnv = baseEnv

        if (process.platform !== "win32") return { processedCommand: initialProcessedCommand, finalEnv: initialEnv }

        const step2 =
          initialProcessedCommand.includes("set") && initialProcessedCommand.includes("&&") && Shell.isCmdCommand(initialProcessedCommand)
            ? iife(() => {
                const setMatch = initialProcessedCommand.match(/set\s+(\w+)=([^&]+)/i)
                return setMatch
                  ? { cmd: initialProcessedCommand, env: { ...initialEnv, [setMatch[1]]: setMatch[2] } }
                  : { cmd: initialProcessedCommand, env: initialEnv }
              })
            : { cmd: initialProcessedCommand, env: initialEnv }

        return { processedCommand: step2.cmd, finalEnv: step2.env }
      })

      const config = await Config.get()
      const spawnConfig = Shell.getSpawnConfig(processedCommand, config.shell)
      const mergedEnv = { ...finalEnv, ...spawnConfig.env } as Record<string, string>

      Shell.isCmdBuiltin(processedCommand) && log.info("Detected bare CMD builtin, automatically wrapping", {
        command: processedCommand.substring(0, 100),
      })

      const proc = Bun.spawn([spawnConfig.executable, ...spawnConfig.args], {
        cwd,
        env: mergedEnv,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      })

      const decoder = new TextDecoder()
      const read = async (reader: ReadableStreamDefaultReader<Uint8Array>, acc: string): Promise<string> => {
        const result = await reader.read()
        const chunk = result.value ? decoder.decode(result.value) : ""
        const newAcc = acc + chunk
        ctx.metadata({
          metadata: {
            output: newAcc.length > MAX_METADATA_LENGTH
              ? newAcc.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
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

      const { output: finalOutput, hasErrors } = iife(() => {
        if (Shell.isPowerShellCommand(processedCommand)) return processPowerShellOutput(output, processedCommand)
        if (Shell.isCmdCommand(processedCommand)) return { output: processCmdOutput(output, processedCommand), hasErrors: false }
        return { output, hasErrors: false }
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
            : Shell.normalizeExitCode(proc.exitCode, hasErrors))

      const truncated = await Truncate.output(normalizedOutput, {}, undefined)

      return {
        title: params.description,
        metadata: {
          output:
            truncated.content.length > MAX_METADATA_LENGTH
              ? truncated.content.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
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
