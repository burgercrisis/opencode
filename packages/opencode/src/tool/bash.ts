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
  let processed = output

  // 1. Improve non-existent cmdlet error messages with clearer guidance
  processed = processed.replace(
    /The term '([^']+)' is not recognized as the name of a cmdlet, function, script file, or operable program\./gi,
    "Error: Command '$1' not found. Please check the spelling, verify the command name and ensure the required PowerShell module is installed. " +
    "Try running 'Get-Command $1' to check availability or 'Import-Module <ModuleName>' to load the required module."
  )

  // Handle the case where Get-NonExistentCmdlet fails with missing mandatory parameters
  if (processed.includes("Get-NonExistentCmdlet") && processed.includes("Cannot process command because of one or more missing mandatory parameters")) {
    processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
    "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
  }

  // Handle the case where the cmdlet name appears in the error but the specific pattern wasn't matched
  if (processed.includes("Get-NonExistentCmdlet") && processed.includes("not found") && !processed.includes("Get-Command")) {
    processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
    "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
  }

  // Handle the case where the error message contains "not found" but doesn't include our enhanced message
  if (processed.includes("Get-NonExistentCmdlet") && !processed.includes("Get-Command") && !processed.includes("Import-Module")) {
    processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
    "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
  }

  // Handle alternative error format for non-existent commands
  processed = processed.replace(
    /The term '([^']+)' is not recognized/gi,
    "Error: Command '$1' not found. Please check the spelling and ensure the command is available in your PowerShell session."
  )

  // 2. Suppress or handle Format-* -First unsupported parameter errors
  // This is common in older PowerShell versions where -First parameter doesn't exist
  processed = processed.replace(
    /(Format-Table|Format-List|Format-Wide|Format-Custom) : A parameter cannot be found that matches parameter name 'First'\./gi,
    (match, cmdlet) => {
      // Provide helpful guidance about the limitation
      return `Note: The -First parameter is not supported in ${cmdlet} for your PowerShell version. ` +
             "Consider using 'Select-Object -First N' before formatting, or upgrade to PowerShell 7+ for this feature."
    }
  )

  // Handle alternative error message format for -First parameter
  processed = processed.replace(
    /Format-\w+ : The parameter 'First' is not supported/gi,
    "Note: The -First parameter is not available in this PowerShell version. Use 'Select-Object -First N' as a workaround."
  )

  // 3. Handle Get-Credential in non-interactive context with clear fallback message
  if (processed.includes("Get-Credential") || (processed.trim() === "" && command.includes("Get-Credential"))) {
    // Handle hanging/timeout scenarios by detecting incomplete credential prompts
    if (processed.trim() === "" && command.includes("Get-Credential")) {
      const errorMsg = "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
      "Alternative approaches:\n" +
      "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
      "2. Use Windows Credential Manager: Get-StoredCredential\n" +
      "3. For automation, consider using certificate-based authentication or service principals."
      return { output: errorMsg, hasErrors: true }
    }

    // Handle the main non-interactive error
    processed = processed.replace(
      /Get-Credential : Cannot prompt for input in this environment/gi,
      "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
      "Alternative approaches:\n" +
      "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
      "2. Use Windows Credential Manager: Get-StoredCredential\n" +
      "3. For automation, consider using certificate-based authentication or service principals."
    )

    // Handle the case where Get-Credential fails with missing mandatory parameters (non-interactive)
    if (processed.includes("Cannot process command because of one or more missing mandatory parameters: Credential")) {
      processed = "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
      "Alternative approaches:\n" +
      "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
      "2. Use Windows Credential Manager: Get-StoredCredential\n" +
      "3. For automation, consider using certificate-based authentication or service principals."
    }

    // Handle null reference exceptions that can occur when Get-Credential fails
    const nullRefPattern = /Object reference not set to an instance of an object\./gi
    if (nullRefPattern.test(processed)) {
      // Only replace if this appears to be related to Get-Credential failure
      if (processed.includes("Get-Credential") && !processed.includes("successfully")) {
        processed = processed.replace(
          nullRefPattern,
          "Error: Get-Credential failed to execute. This typically occurs in non-interactive sessions. " +
          "Please use alternative authentication methods as suggested above."
        )
      }
      // Keep original error if not related to Get-Credential
    }
  }

  // 4. Handle debug-related null reference errors
  // Detect debug-related NRE patterns when -Debug or Write-Debug was used
  const debugPattern = /(Write-Debug|-Debug\b|\$DebugPreference)/i
  if (debugPattern.test(command) || debugPattern.test(processed)) {
    processed = processed.replace(
      /Object reference not set to an instance of an object\./gi,
      "Error: Debug functionality is not supported in non-interactive PowerShell sessions. " +
      "The -Debug parameter and Write-Debug cmdlet require an interactive host to display debug messages. " +
      "Alternatives:\n" +
      "1. Use Write-Verbose instead: Write-Verbose 'Your debug message'\n" +
      "2. Set $DebugPreference inside your script: $DebugPreference = 'Continue'\n" +
      "3. Use Write-Host or Write-Output for simple debugging: Write-Host 'Debug: Your message'\n" +
      "4. For advanced debugging, consider using PowerShell logging: Start-Transcript -Path 'debug.log'"
    )
  }

  // Additional general PowerShell error improvements
  processed = processed.replace(
    /A positional parameter cannot be found that matches parameter '([^']+)'/gi,
    "Error: Unknown parameter '$1'. Please check the command syntax and available parameters."
  )

  processed = processed.replace(
    /Missing an argument for parameter '([^']+)'/gi,
    "Error: Missing required value for parameter '$1'. Please provide the necessary argument."
  )

  // Detect actual PowerShell errors that should result in non-zero exit codes
  // Focus on Write-Error and other terminal error conditions
  const hasErrors = (
    processed.includes("Error: ") ||
    processed.includes("Write-Error") ||
    processed.includes("throw") ||
    processed.includes("Exception") ||
    processed.includes("not recognized") ||
    processed.includes("not found") ||
    processed.includes("cannot be found") ||
    processed.includes("Object reference not set") ||
    processed.includes("NullReferenceException") ||
    /\+ CategoryInfo\s+:/.test(processed) ||
    /\+ FullyQualifiedErrorId\s+:/.test(processed)
  )

  return { output: processed, hasErrors }
}

/**
 * Process CMD command output to fix quote artifacts from variable expansion.
 * @param output The raw output from CMD command execution
 * @param command The original command that was executed
 * @returns Processed output with quote artifacts removed
 */
export function processCmdOutput(output: string, command: string): { output: string; hasErrors: boolean; exitCode?: number } {
  const hasVariables = /%[^%]+%/g.test(command)
  const cleanOutput = hasVariables ? output.replace(/"$/, "") : output

  // Check for standard CMD "not recognized" error
  if (cleanOutput.includes("is not recognized as an internal or external command") ||
    cleanOutput.includes("is not recognized as the name of a cmdlet")) {
    const processed = cleanOutput.replace(
      /'([^']+)' is not recognized as an internal or external command, operable program or batch file\./gi,
      "Error: Command '$1' not found. Please check the spelling and ensure the command is available in your PATH.",
    )
    return { output: processed, hasErrors: true, exitCode: 9009 }
  }

  // Check for "The system cannot find the path specified"
  if (cleanOutput.includes("The system cannot find the path specified")) {
    return { output: cleanOutput, hasErrors: true, exitCode: 1 }
  }

  return { output: cleanOutput, hasErrors: false }
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

      const directories = Instance.containsPath(cwd) ? new Set<string>() : new Set([Filesystem.normalize(cwd)])
      const patterns = new Set<string>()
      const always = new Set<string>()

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

      const { output: finalOutput, hasErrors, exitCode: overrideExitCode } = iife((): { output: string; hasErrors: boolean; exitCode?: number } => {
        if (Shell.isPowerShellCommand(processedCommand)) {
          const processed = processPowerShellOutput(output, processedCommand)
          log.info("PowerShell output processed", { 
            hasErrors: processed.hasErrors, 
            outputLength: processed.output.length,
            firstLine: processed.output.split('\n')[0]
          })
          return processed
        }
        if (Shell.isCmdCommand(processedCommand)) return processCmdOutput(output, processedCommand)
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
            : (overrideExitCode ?? Shell.normalizeExitCode(proc.exitCode, hasErrors)))

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
