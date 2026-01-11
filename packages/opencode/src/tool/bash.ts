import z from "zod"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"

import { resolvePath } from "./bash-helpers"
import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"
import { buildGitEnv } from "./git-env"
// PowerShell modules loaded dynamically - see getPowerShellExecutor()

import { BashArity } from "@/permission/arity"
import { spawn, type ChildProcess } from "child_process"
import { Truncate } from "./truncation"
import { UnixToWindowsTranslator } from "./unix-to-windows-translator"
import { SignalHandlerFactory } from "./cross-platform-signal-handler"
import { PathHandlerFactory } from "./cross-platform-path"
import { EnvironmentHandlerFactory } from "./environment-handler"
import { HereDocumentHandlerFactory } from "./here-document-translator"
import { PersistentShell } from "./persistent-shell"
import { UnicodeHandler, unicodeHandler } from "./unicode-handler"

/**
 * Detect if running under Bun runtime for cross-platform compatibility
 */
const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000
const USE_PERSISTENT_SHELL = process.env.OPENCODE_EXPERIMENTAL_PERSISTENT_SHELL !== "false"

export const log = Log.create({ service: "bash-tool" })

// Unix to Windows translator singleton (Windows only)
let translator: UnixToWindowsTranslator | null = null

function getTranslator(): UnixToWindowsTranslator | null {
  if (process.platform !== "win32") {
    return null
  }

  if (!translator) {
    translator = new UnixToWindowsTranslator()
  }

  return translator
}

// Cross-platform handlers
const signalHandler = SignalHandlerFactory.create()
const pathHandler = PathHandlerFactory.create()
const environmentHandler = EnvironmentHandlerFactory.create()
const hereDocumentHandler = HereDocumentHandlerFactory.create()

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

// Shell built-ins that require shell wrapper
const SHELL_BUILTINS = new Set([
  // Bash built-ins
  "echo",
  "pwd",
  "ls",
  "cd",
  "type",
  "which",
  "where",
  "ver",
  "time",
  "set",
  "chcp",
  "exit",
  "history",
  "alias",
  "bg",
  "bind",
  "break",
  "builtin",
  "caller",
  "case",
  "command",
  "compgen",
  "complete",
  "continue",
  "declare",
  "dirs",
  "disown",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "eval",
  "exec",
  "export",
  "fc",
  "fg",
  "fi",
  "for",
  "function",
  "getopts",
  "hash",
  "help",
  "if",
  "in",
  "jobs",
  "kill",
  "let",
  "local",
  "logout",
  "mapfile",
  "popd",
  "pushd",
  "read",
  "readarray",
  "readonly",
  "return",
  "select",
  "shift",
  "suspend",
  "test",
  "then",
  "times",
  "trap",
  "true",
  "typeset",
  "ulimit",
  "umask",
  "unalias",
  "unset",
  "until",
  "wait",
  "while",
  // Windows-specific patterns
  "%[^%]+%", // Environment variable expansion
])

// Commands that look like shell built-ins (start with special characters)
const SHELL_PATTERN = /^%\w+%|\$\w+|\\$\{\w+\}/

function needsShellExecution(command: string): boolean {
  // Extract first word (handle quotes)
  const firstWord =
    command
      .trim()
      .match(/^(["']?)(\S+)\1/)?.[2]
      ?.toLowerCase() ?? ""

  // Check if it's a known shell built-in
  if (SHELL_BUILTINS.has(firstWord)) {
    return true
  }

  // Check if command contains shell-specific syntax
  if (SHELL_PATTERN.test(command)) {
    return true
  }

  // Check for shell operators
  if (/[;&|]/.test(command)) {
    return true
  }

  // git and npm always need shell wrapper on Windows
  if (
    command.trim().startsWith("git ") ||
    command.trim().startsWith("git.") ||
    command.trim().startsWith("npm ") ||
    command.trim().startsWith("npm.")
  ) {
    return true
  }

  return false
}

function resolveWindowsCommand(command: string, shell: string): { cmd: string[]; useShell: boolean } {
  const shellType = detectShellType(command)

  // Native Windows commands bypass shell wrapper - pass as parsed arguments
  if (shellType === "powershell" || shellType === "pwsh" || shellType === "cmd") {
    const parts = parseShellArgs(command.trim())
    return { cmd: parts, useShell: false }
  }

  // For other commands, use shell wrapper to handle built-ins
  const flag = shell.toLowerCase().includes("cmd") ? "/c" : "-c"
  return { cmd: [shell, flag, command], useShell: true }
}

/**
 * Detects cmd.exe built-in patterns that require shell wrapper
 * @param command - The command to check
 * @returns true if command contains cmd.exe built-in syntax
 */
export function hasCmdBuiltInSyntax(command: string): boolean {
  const trimmed = command.trim()

  // Check for command chaining operators first (covers most cases)
  if (/[;&|]/.test(command)) {
    return true
  }

  // Check for cmd.exe built-in patterns that need shell parsing
  // Look for patterns anywhere in the command, not just at the start
  const builtInPatterns = [
    /for\s+\/l/i, // for /l loops
    /for\s+\/f/i, // for /f file parsing
    /for\s+\/r/i, // for /r recursive
    /for\s+\/d/i, // for /d directory matching
    /if\s+/i, // if statements
    /set\s+\/a/i, // set /a arithmetic
    /set\s+\/p/i, // set /p prompt
    /echo\s+on/i, // echo on
    /echo\s+off/i, // echo off
    /goto\s+/i, // goto statements
    /call\s+/i, // call statements
    /^shift/i, // shift command
  ]

  return builtInPatterns.some((pattern) => pattern.test(trimmed))
}

/**
 * Detects the shell type from a command string
 * Returns: 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'other'
 */
export function detectShellType(command: string): "powershell" | "pwsh" | "cmd" | "bash" | "other" {
  return detectCommandShell(command)
}

/**
 * Detects the shell type from a command string
 * Returns: 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'other'
 * @deprecated Use detectShellType instead
 */
export function detectCommandShell(command: string): "powershell" | "pwsh" | "cmd" | "bash" | "other" {
  const trimmed = (command || "").trim().toLowerCase()
  if (!trimmed) return "other"

  // PowerShell detection
  if (trimmed.startsWith("powershell.exe") || trimmed.startsWith("powershell") || trimmed.startsWith("pwsh")) {
    return trimmed.startsWith("pwsh") ? "pwsh" : "powershell"
  }

  // CMD detection - be more flexible to catch command chains
  if (trimmed.startsWith("cmd.exe") || trimmed.startsWith("cmd ") || trimmed.startsWith("cmd /")) {
    return "cmd"
  }

  // Bash detection
  if (
    trimmed.startsWith("bash") ||
    trimmed.startsWith("sh") ||
    trimmed.startsWith("/bin/bash") ||
    trimmed.startsWith("/bin/sh")
  ) {
    return "bash"
  }

  return "other"
}

/**
 * Parses command to extract executable and arguments
 * Returns: { executable: string, args: string[], shouldBypassShell: boolean }
 */
export function parseCommand(command: string): { executable: string; args: string[]; shouldBypassShell: boolean } {
  const trimmed = (command || "").trim()
  if (!trimmed) {
    return { executable: "", args: [], shouldBypassShell: true }
  }

  const shellType = detectShellType(trimmed)

  // CMD commands: Parse executable and args separately for direct execution
  if (shellType === "cmd") {
    const parts = parseShellArgs(trimmed)
    const executable = parts[0] || "cmd.exe"
    const args = parts.slice(1)

    // Check if this is a batch file
    const isBatchFile = executable.endsWith(".bat") || executable.endsWith(".cmd")

    // Check if cmd command has built-in syntax that needs shell wrapper
    let needsWrapper = hasCmdBuiltInSyntax(trimmed) || hasCmdBuiltInSyntax(args.join(" "))
    if (SHELL_BUILTINS.has(executable.toLowerCase())) {
      needsWrapper = true
    }

    if (isBatchFile && process.platform === "win32") {
      // Route through PowerShell wrapper with argument quoting
      const batchArgs =
        args.length > 0 ? ` ${args.map((arg) => (/^[a-zA-Z0-9_\-\.]+$/.test(arg) ? arg : `'${arg}'`)).join(" ")}` : ""
      return {
        executable: "powershell.exe",
        args: ["-NoProfile", "-Command", `& '${executable}'${batchArgs}; exit $LASTEXITCODE`],
        shouldBypassShell: false,
      }
    }

    // For cmd.exe commands with built-in syntax, route through PowerShell
    if (needsWrapper && process.platform === "win32") {
      // Build the cmd command - include /c flag if not already present
      let cmdArgs = args
      if (args.length === 0 || args[0] !== "/c") {
        cmdArgs = ["/c", ...args]
      }
      // Escape quotes properly for PowerShell -Command parameter
      const escapedCommand = `"${args.join(" ").replace(/"/g, '\"')}"`
      return {
        executable: "powershell.exe",
        args: ["-NoProfile", "-Command", `cmd ${escapedCommand}; exit $LASTEXITCODE`],
        shouldBypassShell: false,
      }
    }

    return {
      executable,
      args,
      shouldBypassShell: !needsWrapper, // Direct execution for simple cmd commands
    }
  }

  // PowerShell commands: Use shell wrapper for proper argument parsing
  if (shellType === "powershell" || shellType === "pwsh") {
    const parts = parseShellArgs(trimmed)
    const executable = shellType === "pwsh" ? "pwsh" : "powershell.exe"
    const args = parts.slice(1)

    // Handle external commands that conflict with PowerShell aliases
    const firstArg = args[0]?.toLowerCase()
    const externalCommands = ["sc", "net", "tasklist", "taskkill", "findstr", "where", "whoami"]
    if (firstArg && externalCommands.includes(firstArg)) {
      // Route through cmd.exe for external commands that conflict with PowerShell
      return {
        executable: "cmd.exe",
        args: ["/c", trimmed],
        shouldBypassShell: false,
      }
    }

    return {
      executable,
      args,
      // Use shell wrapper for PowerShell commands to avoid quote corruption
      shouldBypassShell: false,
    }
  }

  // Handle external commands that conflict with PowerShell aliases
  const parts = parseShellArgs(trimmed)
  const firstWord = parts[0]?.toLowerCase()
  const externalCommands = ["sc", "net", "tasklist", "taskkill", "findstr", "where", "whoami"]
  if (firstWord && externalCommands.includes(firstWord)) {
    // Route through cmd.exe for external commands that conflict with PowerShell
    return {
      executable: "cmd.exe",
      args: ["/c", trimmed],
      shouldBypassShell: false,
    }
  }

  // For shell built-ins, git, npm, and commands with special syntax, use shell wrapper
  if (
    needsShellExecution(trimmed) ||
    trimmed.startsWith("git ") ||
    trimmed.startsWith("git.") ||
    trimmed.startsWith("npm ") ||
    trimmed.startsWith("npm.")
  ) {
    return {
      executable: trimmed,
      args: [],
      shouldBypassShell: false,
    }
  }

  // Simple commands can be executed directly
  return {
    executable: trimmed,
    args: [],
    shouldBypassShell: true,
  }
}

/**
 * Builds a command wrapper that captures exit codes properly
 * @param cmd - The command array to execute
 * @param shellType - The type of shell being used
 * @returns Modified command array with exit code capture
 */
function buildExitCodeCaptureCommand(cmd: string[], shellType: string): string[] {
  if (shellType === "powershell" || shellType === "pwsh") {
    // Check if this is already a properly formatted PowerShell command
    const hasCommandFlag = cmd.includes("-Command") || cmd.includes("-c")
    if (hasCommandFlag) {
      // Find the command content (everything after -Command)
      const commandIndex = cmd.findIndex(arg => arg === "-Command" || arg === "-c")
      if (commandIndex !== -1 && commandIndex + 1 < cmd.length) {
        const commandContent = cmd[commandIndex + 1]
        // Wrap the command content in & { } for proper execution
        const wrappedCommand = `& { ${commandContent}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`
        return [cmd[0], "-NoProfile", "-Command", wrappedCommand]
      }
    }

    // Fallback: wrap the entire command line
    const commandPart = cmd.slice(1).join(" ")
    // If already wrapped in & { }, add exit check inside
    if (commandPart.includes("& {") && commandPart.endsWith("}")) {
      const modified = commandPart.replace(/}$/, `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`)
      return [cmd[0], "-NoProfile", "-Command", modified]
    } else {
      // Wrap in & { } for proper execution
      return [cmd[0], "-NoProfile", "-Command", `& { ${commandPart}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`]
    }
  }

  if (shellType === "cmd") {
    // For cmd.exe, we need to wrap to capture exit codes from chained commands
    const cmdArgs = cmd.slice(1).join(" ")
    return ["powershell.exe", "-NoProfile", "-Command", `cmd /c "${cmdArgs.replace(/"/g, '\\"')}"; exit $LASTEXITCODE`]
  }

  return cmd
}

// TODO: we may wanna rename this tool so it works better on other shells

/**
 * Parses shell arguments from a command string, properly handling quotes and escapes.
 * Supports both single and double quotes, escape sequences, and arguments with spaces.
 *
 * @param command - The command string to parse
 * @returns Array of parsed arguments
 */
function parseShellArgs(command: string): string[] {
  const args: string[] = []
  let current = ""
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    const nextChar = command[i + 1]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\" && (inDoubleQuote || !inSingleQuote)) {
      escaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        args.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    args.push(current)
  }

  return args
}

/**
 * Strips outer matching quotes from a string if present.
 * Handles both single and double quotes.
 *
 * @param str - The string to strip quotes from
 * @returns The string with outer quotes removed, or original if no matching outer quotes
 */
function stripOuterQuotes(str: string): string {
  const trimmed = str.trim()
  if (trimmed.length < 2) {
    return str
  }

  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]

  // Check for matching outer quotes
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    // Check if quote is escaped or if there's a matching quote inside
    let escaped = false
    let hasInnerQuote = false

    for (let i = 1; i < trimmed.length - 1; i++) {
      if (trimmed[i] === "\\" && !escaped) {
        escaped = true
        continue
      }
      if (trimmed[i] === first && !escaped) {
        hasInnerQuote = true
        break
      }
      escaped = false
    }

    // Only strip if no unescaped matching quote inside
    if (!hasInnerQuote) {
      return trimmed.slice(1, -1)
    }
  }

  return str
}

/**
 * PowerShell executor singleton for Windows PowerShell command execution.
 * Uses temp files to avoid the -Command quote corruption issue.
 * Only loaded on Windows platforms via dynamic import.
 */
let psExecutor: any | undefined
let psExecutorCleanup: (() => void) | undefined

async function getPowerShellExecutor(): Promise<any | null> {
  // Platform check - return null on non-Windows
  if (process.platform !== "win32") {
    return null
  }

  // Return cached instance if available
  if (psExecutor) {
    return psExecutor
  }

  // Dynamic import - only loads on Windows
  const { PowerShellExecutor: PSExec } = await import("./powershell-executor")
  const { TempFileManager } = await import("./temp-file-manager")

  const tempFileManager = new TempFileManager()
  psExecutor = new PSExec({ tempFileManager })

  // Register cleanup on process exit
  psExecutorCleanup = () => {
    try {
      if (tempFileManager && typeof tempFileManager.dispose === "function") {
        tempFileManager.dispose()
      }
    } catch (error) {
      log.warn("Error disposing PowerShell temp file manager", { error })
    }
  }

  if (typeof process !== "undefined") {
    process.once("beforeExit", psExecutorCleanup)
    process.once("exit", psExecutorCleanup)
  }

  return psExecutor
}

export function disposePowerShellExecutor(): void {
  if (psExecutorCleanup) {
    psExecutorCleanup()
    psExecutorCleanup = undefined
    psExecutor = undefined
  }
}

// Register shutdown handlers for cleanup
if (typeof process !== "undefined") {
  const registerShutdownHandlers = () => {
    const cleanup = () => {
      disposePowerShellExecutor()
    }

    // Handle various shutdown signals
    process.on("beforeExit", cleanup)
    process.on("exit", cleanup)

    // Handle uncaught errors to ensure cleanup
    process.on("uncaughtException", async (error) => {
      log.error("Uncaught exception in bash tool", { error })
      await cleanup()
    })

    process.on("unhandledRejection", async (reason) => {
      log.error("Unhandled rejection in bash tool", { reason })
      await cleanup()
    })
  }

  // Use a module-level variable to ensure registration happens once
  if (!(globalThis as any).__opencode_bash_shutdown_registered) {
    ;(globalThis as any).__opencode_bash_shutdown_registered = true
    registerShutdownHandlers()
  }
}

/**
 * Unified PowerShell command routing (v2.0)
 * Handles -Command, -File, script blocks, and arguments
 */
function routePowerShellCommand(command: string): {
  cmd: string[]
  useExecutor: boolean
  direct?: boolean
  tempCommand?: string
  simple?: boolean
} {
  // Extract PowerShell executable using proper argument parsing
  const parts = parseShellArgs(command.trim())
  const executable = parts[0] || "powershell.exe"

  // Check for -Command parameter using parsed parts for better robustness than regex
  const commandIndex = parts.findIndex(p => p.toLowerCase() === "-command" || p.toLowerCase() === "-c")
  if (commandIndex !== -1 && commandIndex + 1 < parts.length) {
    const commandContent = parts[commandIndex + 1]

    // Detect bare script block (needs & wrapper)
    if (/^\s*\{/.test(commandContent) && !/^\s*&\s*\{/.test(commandContent)) {
      const wrappedCommand = `& ${commandContent}`
      return {
        cmd: [executable, "-NoProfile", "-Command", wrappedCommand],
        useExecutor: false,
        direct: true,
      }
    }

    // Check if this is a simple command that can be executed directly
    // Simple commands: Write-Host, Get-Date, Get-Location, etc.
    const trimmedContent = commandContent.trim()
    const isSimpleCommand = (() => {
      // Commands that are safe to execute directly without temp files
      const simpleCommands = ["Get-Random", "Get-Date", "Get-Location", "Write-Host", "Write-Output", "Write-Error", "Write-Warning"]
      return simpleCommands.some(cmd => trimmedContent.toLowerCase().startsWith(cmd.toLowerCase()))
    })()

    if (isSimpleCommand) {
      // Execute simple commands directly to avoid temp file overhead
      return {
        cmd: [executable, "-NoProfile", "-Command", commandContent],
        useExecutor: false,
        direct: true,
        simple: true,
      }
    }

    // Use PowerShellExecutor for complex commands - writes to temp file
    return {
      cmd: [commandContent],
      useExecutor: true,
      tempCommand: commandContent,
    }
  }

  // Check for -File parameter
  const fileIndex = parts.findIndex(p => p.toLowerCase() === "-file" || p.toLowerCase() === "-f")
  if (fileIndex !== -1 && fileIndex + 1 < parts.length) {
    const filePath = parts[fileIndex + 1]
    return {
      cmd: [executable, "-NoProfile", "-File", filePath],
      useExecutor: false,
      direct: true,
    }
  }

  // For simple args like -NoProfile, keep as array
  const args = parts.slice(1)
  return {
    cmd: [executable, ...args],
    useExecutor: false,
    direct: true,
  }
}

export const BashTool = Tool.define("bash", async () => {
  const shell = process.platform === "win32" ? "cmd.exe" : Shell.acceptable()
  log.info("bash tool using shell", { shell })

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
      const cwd = params.workdir || Instance.directory
      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
      }
      const timeout = params.timeout ?? DEFAULT_TIMEOUT

      // Preprocess command with cross-platform handlers
      let processedCommand = params.command

      // Handle here documents first
      if (hereDocumentHandler.hasHereDocuments(processedCommand)) {
        processedCommand = await hereDocumentHandler.translate(processedCommand)
        log.debug("Translated here documents", {
          original: params.command,
          processed: processedCommand,
        })
      }

      // Handle environment variable syntax
      processedCommand = environmentHandler.convertSyntax(processedCommand)

      // Handle path expansion and normalization
      processedCommand = pathHandler.expandUser(processedCommand)
      processedCommand = pathHandler.normalize(processedCommand)

      // Skip Tree-sitter parsing for PowerShell commands to prevent misinterpretation
      const shellType = detectShellType(processedCommand)
      const isPowerShellCommand = shellType === "powershell" || shellType === "pwsh"

      let tree: any = null
      if (!isPowerShellCommand) {
        tree = await parser().then((p) => p.parse(processedCommand))
        if (!tree) {
          throw new Error("Failed to parse command")
        }
      }

      const directories = new Set<string>()
      if (!Filesystem.contains(Instance.directory, cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

      // Skip Tree-sitter analysis for PowerShell commands
      if (tree) {
        for (const node of tree.rootNode.descendantsOfType("command")) {
          if (!node) continue
          const command = []
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (!child) continue
            if (
              child.type !== "command_name" &&
              child.type !== "word" &&
              child.type !== "string" &&
              child.type !== "raw_string" &&
              child.type !== "concatenation"
            ) {
              continue
            }
            command.push(child.text)
          }
          console.log(`BashTool: Tree-sitter found command: ${JSON.stringify(command)}`)

          // not an exhaustive list, but covers most common cases
          if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"].includes(command[0])) {
            for (const arg of command.slice(1)) {
              if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
              console.log(`BashTool: Resolving path for arg: ${arg}, cwd: ${cwd}`)
              const resolved = await resolvePath(arg, cwd)
              console.log(`BashTool: Resolved path: ${resolved}`)
              if (resolved) {
                // Git Bash on Windows returns Unix-style paths like /c/Users/...
                const normalized =
                  process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                    ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                    : resolved
                
                console.log(`BashTool: Checking permission for normalized path: ${normalized}, Instance.directory: ${Instance.directory}`)
                if (!Filesystem.contains(Instance.directory, normalized)) {
                  console.log(`BashTool: PATH IS OUTSIDE! Adding to directories Set: ${normalized}`)
                  directories.add(normalized)
                }
              }
            }
          }

          // cd covered by above check
          if (command.length && command[0] !== "cd") {
            patterns.add(command.join(" "))
            always.add(BashArity.prefix(command).join(" ") + "*")
          }
        }
      }

      if (directories.size > 0) {
        await ctx.ask({
          permission: "external_directory",
          patterns: Array.from(directories),
          always: Array.from(directories).map((x) => path.dirname(x) + "*"),
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

      // Check if we should use persistent shell for performance
      const shouldUsePersistentShell =
        USE_PERSISTENT_SHELL &&
        process.platform === "win32" && // Only on Windows for now
        !needsShellExecution(processedCommand) && // Only for simple commands
        !processedCommand.includes("&&") &&
        !processedCommand.includes("||") &&
        !processedCommand.includes("|") &&
        !processedCommand.includes(";") &&
        !processedCommand.trim().startsWith("cmd ") && // Exclude CMD commands from persistent shell
        !processedCommand.trim().startsWith("cmd/") &&
        !processedCommand.trim().startsWith("powershell") && // Exclude PowerShell commands from persistent shell
        !processedCommand.trim().startsWith("pwsh")

      if (shouldUsePersistentShell) {
        log.debug("Using persistent shell for command execution", { command: processedCommand.slice(0, 100) })

        try {
          const persistentShell = PersistentShell.getInstance(cwd)
          const shellType = detectShellType(processedCommand) === "other" ? "cmd" : detectShellType(processedCommand)

          const result = await persistentShell.execute(processedCommand, {
            shell: shellType as "powershell" | "cmd" | "bash",
            timeout,
          })

          // Process output with UnicodeHandler
          const processedOutput = unicodeHandler.validateAndFix(result.stdout)
          const processedStderr = unicodeHandler.validateAndFix(result.stderr)

          return {
            title: params.description,
            metadata: {
              output:
                processedOutput.length > MAX_METADATA_LENGTH
                  ? processedOutput.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
                  : processedOutput,
              exit: result.exitCode,
              description: params.description,
            },
            output: processedOutput + (processedStderr ? `\n${processedStderr}` : ""),
          }
        } catch (error) {
          log.warn("Persistent shell execution failed, falling back to standard execution", { error })
          // Fall through to standard execution
        }
      }

      // Resolve command for Windows compatibility
      // Use parseCommand to detect native Windows commands and bypass shell wrapping
      const parsed = parseCommand(processedCommand)
      let cmd: string[] | undefined = undefined
      let psExecutorUsed = false

      // PowerShell routing (Windows only)
      if (process.platform === "win32" && (shellType === "powershell" || shellType === "pwsh")) {
        // Apply Unix to Windows translation for PowerShell commands
        let translatedCommand = processedCommand
        const translator = getTranslator()
        if (translator) {
          translatedCommand = translator.translateCommand(processedCommand, { cwd, shell: shellType }) as string
          if (translatedCommand !== processedCommand) {
            log.debug("Command translated for PowerShell execution", {
              original: processedCommand,
              translated: translatedCommand,
            })
          }
        }
        const routing = routePowerShellCommand(translatedCommand)

        if (routing.useExecutor) {
          // Use PowerShellExecutor for -Command
          const executor = await getPowerShellExecutor()

          if (!executor) {
            throw new Error("PowerShell executor not available on this platform")
          }

          const result = await executor.execute(routing.tempCommand!)
          return {
            title: params.description,
            metadata: {
              output: result.stdout,
              exit: result.exitCode,
              description: params.description,
            },
            output: result.stdout,
          }
        } else if (routing.direct) {
          cmd = routing.cmd
          // Apply exit code capture for all PowerShell commands to ensure proper process termination
          if (shellType === "powershell" || shellType === "pwsh") {
            cmd = buildExitCodeCaptureCommand(cmd, shellType)
          }
        }
      }

      // CMD/batch file routing
      if (!cmd) {
        if (process.platform === "win32" && parsed.shouldBypassShell) {
          cmd = [parsed.executable, ...parsed.args]
        } else {
          const { cmd: shellCmd } = resolveWindowsCommand(processedCommand, shell)
          cmd = shellCmd
        }
      }

      let proc: ChildProcess | any
      try {
        // Cross-platform spawn with runtime detection
        if (isBunRuntime) {
          proc = Bun.spawn(cmd, {
            cwd,
            env: buildGitEnv(),
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
          })
        } else {
          // Node.js: use child_process.spawn
          proc = spawn(cmd[0], cmd.slice(1), {
            cwd,
            env: buildGitEnv(),
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
          })
        }
      } catch (spawnError) {
        throw new Error(`Failed to execute command: ${spawnError instanceof Error ? spawnError.message : spawnError}`)
      }

      let output = ""
      let timedOut = false
      let aborted = false
      let exited = false
      let metadataUpdateCounter = 0

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      const append = (chunk: Buffer | Uint8Array | string) => {
        const text =
          chunk instanceof Buffer || chunk instanceof Uint8Array
            ? unicodeHandler.decode(chunk)
            : unicodeHandler.validateAndFix(chunk)
        output += text

        // Update metadata less frequently to avoid blocking (every 1KB or every 100 chunks)
        metadataUpdateCounter++
        if (metadataUpdateCounter % 100 === 0 || output.length % 1024 === 0 || output.length < 1024) {
          ctx.metadata({
            metadata: {
              // truncate the metadata to avoid GIANT blobs of data (has nothing to do w/ what agent can access)
              output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
              description: params.description,
            },
          })
        }
      }

      const kill = async () => {
        try {
          // Try cross-platform signal handler first
          if (proc.pid) {
            await signalHandler.sendTerminate(proc.pid)
          }
        } catch (error) {
          log.warn("Cross-platform signal handler failed, falling back to Shell.killTree", { error })
          // Fallback to existing kill method
          Shell.killTree(proc as any, { exited: () => exited })
        }
      }

      // Set up abort handling before stream operations
      const abortHandler = () => {
        aborted = true
        void kill()
      }

      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      // Handle abort if already aborted
      if (ctx.abort.aborted) {
        aborted = true
        await kill()
      }

      const timeoutTimer = setTimeout(() => {
        if (!exited) {
          timedOut = true
          void kill()
        }
      }, timeout + 100)

      /**
       * Helper function to drain a stream and append its data
       */
      const drainStream = async (stream: any, appendFn: (chunk: Buffer | Uint8Array | string) => void): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (!stream) {
            return resolve()
          }

          if (isBunRuntime) {
            if (!stream?.getReader) return resolve()
            const reader = stream.getReader()
            const readLoop = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) {
                    reader.releaseLock()
                    return resolve()
                  }
                  appendFn(value)
                }
              } catch (error) {
                if (error.name !== 'AbortError') reject(error)
                else resolve()
              } finally {
                reader.releaseLock?.()
              }
            }
            readLoop()
          } else {
            // Node.js
            let ended = false
            const onData = (chunk: Buffer) => appendFn(chunk)
            const onEnd = () => {
              if (!ended) {
                ended = true
                stream.removeListener('data', onData)
                stream.removeListener('error', onError)
                resolve()
              }
            }
            const onError = (error: unknown) => {
              stream.removeListener('data', onData)
              stream.removeListener('end', onEnd)
              reject(error instanceof Error ? error : new Error(String(error)))
            }
            stream.on('data', onData)
            stream.on('end', onEnd)
            stream.on('error', onError)
          }
        })
      }

      /**
       * Unified process and stream handling - ensures proper synchronization
       */
      const waitForCompletion = async (proc: ChildProcess | any): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          // Create null streams for handling undefined streams
          const nullStream = isBunRuntime ? null : new (require('stream').Readable)({ read() {} })

          // Set up stream draining promises
          const drainStdout = drainStream(proc.stdout ?? nullStream, append)
          const drainStderr = drainStream(proc.stderr ?? nullStream, append)

          // Handle process completion
          const procCompletion = isBunRuntime 
            ? proc.exited 
            : new Promise((res, rej) => { 
                proc.once('close', res)
                proc.once('error', rej)
              })

          // Wait for all streams and process to complete
          Promise.all([drainStdout, drainStderr, procCompletion])
            .then(() => {
              exited = true
              clearTimeout(timeoutTimer)
              ctx.abort.removeEventListener("abort", abortHandler)
              resolve()
            })
            .catch((error) => {
              exited = true
              clearTimeout(timeoutTimer)
              ctx.abort.removeEventListener("abort", abortHandler)
              reject(error)
            })
        })
      }

      // Wait for both streams and process completion
      await waitForCompletion(proc)

      const resultMetadata: string[] = []

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
      }

      if (aborted) {
        resultMetadata.push("User aborted the command")
      }

      if (resultMetadata.length > 0) {
        output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
      }

      // Final Unicode validation and normalization
      output = unicodeHandler.validateAndFix(output)

      // Normalize exit code (negative codes on Unix indicate signal termination)
      let exitCode = proc.exitCode ?? proc.code
      if (exitCode < 0) {
        exitCode = 128 + Math.abs(exitCode)
      }

      // For PowerShell commands with potential sub-command failures, try to capture $LASTEXITCODE
      if (
        process.platform === "win32" &&
        (shellType === "powershell" || shellType === "pwsh" || parsed.shouldBypassShell === false)
      ) {
        // The PowerShell executor already handles this properly, but for direct spawns
        // we should ensure exit codes are propagated correctly
        if (exitCode === 0 && /\$LASTEXITCODE|\$\?/.test(output)) {
          // If output contains LASTEXITCODE references but exit was 0, this is expected
        }
      }

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: exitCode,
          description: params.description,
        },
        output,
      }
    },
  }
})
