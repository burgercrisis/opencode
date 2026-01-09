import z from "zod"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"

import { $ } from "bun"
import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"
import { buildGitEnv } from "./git-env"
import { PowerShellExecutor } from './powershell-executor'
import { TempFileManager } from './temp-file-manager'

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

// Shell built-ins that require shell wrapper
const SHELL_BUILTINS = new Set([
  // Bash built-ins
  "echo", "pwd", "ls", "cd", "type", "which", "where",
  "ver", "time", "set", "chcp", "exit", "history", "alias",
  "bg", "bind", "break", "builtin", "caller", "case", "command",
  "compgen", "complete", "continue", "declare", "dirs", "disown",
  "do", "done", "elif", "else", "esac", "eval", "exec", "export",
  "fc", "fg", "fi", "for", "function", "getopts", "hash", "help",
  "if", "in", "jobs", "kill", "let", "local", "logout", "mapfile",
  "popd", "pushd", "read", "readarray", "readonly", "return",
  "select", "shift", "suspend", "test", "then", "times", "trap",
  "true", "typeset", "ulimit", "umask", "unalias", "unset", "until",
  "wait", "while",
  // Windows-specific patterns
  "%[^%]+%",  // Environment variable expansion
])

// Commands that look like shell built-ins (start with special characters)
const SHELL_PATTERN = /^%\w+%|\$\w+|\\$\{\w+\}/

function needsShellExecution(command: string): boolean {
  // Extract first word (handle quotes)
  const firstWord = command.trim().match(/^(["']?)(\S+)\1/)?.[2]?.toLowerCase() ?? ""

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
  if (command.trim().startsWith('git ') || 
      command.trim().startsWith('git.') ||
      command.trim().startsWith('npm ') ||
      command.trim().startsWith('npm.')) {
    return true
  }

  return false
}

function resolveWindowsCommand(command: string, shell: string): { cmd: string[]; useShell: boolean } {
  const shellType = detectCommandShell(command)
  
  // Native Windows commands bypass shell wrapper - pass as parsed arguments
  if (shellType === 'powershell' || shellType === 'pwsh' || shellType === 'cmd') {
    const parts = command.trim().split(/\s+/).map(arg => stripOuterQuotes(arg))
    return { cmd: parts, useShell: false }
  }
  
  // For other commands, use shell wrapper to handle built-ins
  const flag = shell.toLowerCase().includes('cmd') ? '/c' : '-c'
  return { cmd: [shell, flag, command], useShell: true }
}

/**
 * Detects the shell type from a command string
 * Returns: 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'other'
 */
export function detectCommandShell(command: string): 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'other' {
  const trimmed = command.trim().toLowerCase()

  // PowerShell detection
  if (trimmed.startsWith('powershell.exe') || trimmed.startsWith('powershell') || trimmed.startsWith('pwsh')) {
    return trimmed.startsWith('pwsh') ? 'pwsh' : 'powershell'
  }

  // CMD detection
  if (trimmed.startsWith('cmd.exe') || trimmed.startsWith('cmd ')) {
    return 'cmd'
  }

  // Bash detection
  if (trimmed.startsWith('bash') || trimmed.startsWith('sh') || trimmed.startsWith('/bin/bash') || trimmed.startsWith('/bin/sh')) {
    return 'bash'
  }

  return 'other'
}

/**
 * Parses command to extract executable and arguments
 * Returns: { executable: string, args: string[], shouldBypassShell: boolean }
 */
export function parseCommand(command: string): { executable: string; args: string[]; shouldBypassShell: boolean } {
  const trimmed = command.trim()
  const shellType = detectCommandShell(trimmed)

  // CMD commands: Parse executable and args separately for direct execution
  if (shellType === 'cmd') {
    const parts = trimmed.split(/\s+/)
    const executable = parts[0] || 'cmd.exe'
    const args = parts.slice(1)
    
    // Check if this is a batch file
    const isBatchFile = executable.endsWith('.bat') || executable.endsWith('.cmd')
    
    if (isBatchFile && process.platform === "win32") {
      // Route through PowerShell wrapper with argument quoting
      const batchArgs = args.length > 0 
        ? ` ${args.map(arg => /^[a-zA-Z0-9_\-\.]+$/.test(arg) ? arg : `'${arg}'`).join(' ')}`
        : ''
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-Command', `& '${executable}'${batchArgs}`],
        shouldBypassShell: false
      }
    }
    
    return {
      executable,
      args,
      shouldBypassShell: true  // Direct execution for cmd.exe
    }
  }

  // PowerShell commands: Use shell wrapper for proper argument parsing
  if (shellType === 'powershell' || shellType === 'pwsh') {
    const parts = trimmed.split(/\s+/)
    const executable = shellType === 'pwsh' ? 'pwsh' : 'powershell.exe'
    const args = parts.slice(1)

    return {
      executable,
      args,
      // Use shell wrapper for PowerShell commands to avoid quote corruption
      shouldBypassShell: false
    }
  }

  // For shell built-ins, git, npm, and commands with special syntax, use shell wrapper
  if (needsShellExecution(trimmed) || 
      trimmed.startsWith('git ') || 
      trimmed.startsWith('git.') || 
      trimmed.startsWith('npm ') || 
      trimmed.startsWith('npm.')) {
    return {
      executable: command,
      args: [],
      shouldBypassShell: false
    }
  }

  // Simple commands can be executed directly
  return {
    executable: command,
    args: [],
    shouldBypassShell: true
  }
}

// TODO: we may wanna rename this tool so it works better on other shells

/**
 * Strips outer matching quotes from a string if present.
 * Handles both single and double quotes.
 * 
 * @param str - The string to strip quotes from
 * @returns The string with outer quotes removed, or original if no matching outer quotes
 */
function stripOuterQuotes(str: string): string {
  const trimmed = str.trim();
  if (trimmed.length < 2) {
    return str;
  }
  
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  
  // Check for matching outer quotes
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    // Check if quote is escaped or if there's a matching quote inside
    let escaped = false;
    let hasInnerQuote = false;
    
    for (let i = 1; i < trimmed.length - 1; i++) {
      if (trimmed[i] === '\\' && !escaped) {
        escaped = true;
        continue;
      }
      if (trimmed[i] === first && !escaped) {
        hasInnerQuote = true;
        break;
      }
      escaped = false;
    }
    
    // Only strip if no unescaped matching quote inside
    if (!hasInnerQuote) {
      return trimmed.slice(1, -1);
    }
  }
  
  return str;
}

/**
 * PowerShell executor singleton for Windows PowerShell command execution.
 * Uses temp files to avoid the -Command quote corruption issue.
 */
let psExecutor: PowerShellExecutor | undefined;

function getPowerShellExecutor(): PowerShellExecutor {
  if (!psExecutor) {
    const tempFileManager = new TempFileManager()
    psExecutor = new PowerShellExecutor({ tempFileManager })
  }
  return psExecutor
}

/**
 * Unified PowerShell command routing (v2.0)
 * Handles -Command, -File, script blocks, and arguments
 */
function routePowerShellCommand(command: string): { 
  cmd: string[]; 
  useExecutor: boolean; 
  direct?: boolean;
  tempCommand?: string;
} {
  // Extract PowerShell executable
  const parts = command.trim().split(/\s+/)
  const executable = parts[0] || 'powershell.exe'
  
  // Check for -Command parameter
  const commandMatch = command.match(/-Command\s+["'](.+?)["']/s);
  if (commandMatch) {
    const commandContent = commandMatch[1];
    
    // Detect bare script block (needs & wrapper)
    if (/^\s*\{/.test(commandContent) && !/^\s*&\s*\{/.test(commandContent)) {
      const wrappedCommand = `& ${commandContent}`;
      return {
        cmd: [executable, '-NoProfile', '-Command', wrappedCommand],
        useExecutor: false,
        direct: true
      };
    }
    
    // Use PowerShellExecutor for complex commands - writes to temp file
    return { 
      cmd: [commandContent], 
      useExecutor: true,
      tempCommand: commandContent 
    };
  }
  
  // Check for -File parameter
  const fileMatch = command.match(/-File\s+["'](.+?)["']/s);
  if (fileMatch) {
    const filePath = fileMatch[1];
    return {
      cmd: [executable, '-NoProfile', '-File', filePath],
      useExecutor: false,
      direct: true
    };
  }
  
  // For simple args like -NoProfile, keep as array
  const args = parts.slice(1);
  return {
    cmd: [executable, ...args],
    useExecutor: false,
    direct: true
  };
}

export const BashTool = Tool.define("bash", async () => {
  // Temporarily force cmd.exe on Windows for testing
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
      const tree = await parser().then((p) => p.parse(params.command))
      if (!tree) {
        throw new Error("Failed to parse command")
      }
      const directories = new Set<string>()
      if (!Filesystem.contains(Instance.directory, cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

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

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(cwd)
              .quiet()
              .nothrow()
              .text()
              .then((x) => x.trim())
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              // Git Bash on Windows returns Unix-style paths like /c/Users/...
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              if (!Filesystem.contains(Instance.directory, normalized)) directories.add(normalized)
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(command.join(" "))
          always.add(BashArity.prefix(command).join(" ") + "*")
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

      // Resolve command for Windows compatibility
      // Use parseCommand to detect native Windows commands and bypass shell wrapping
      const parsed = parseCommand(params.command)
      const shellType = detectCommandShell(params.command)
      let cmd: string[] | undefined = undefined
      let psExecutorUsed = false

      // PowerShell routing (Windows only)
      if (process.platform === "win32" && (shellType === 'powershell' || shellType === 'pwsh')) {
        const routing = routePowerShellCommand(params.command)
        
        if (routing.useExecutor) {
          // Use PowerShellExecutor for -Command
          const executor = getPowerShellExecutor()
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
        }
      }

      // CMD/batch file routing
      if (!cmd) {
        if (process.platform === "win32" && parsed.shouldBypassShell) {
          cmd = [parsed.executable, ...parsed.args]
        } else {
          const { cmd: shellCmd } = resolveWindowsCommand(params.command, shell)
          cmd = shellCmd
        }
      }

      const proc = Bun.spawn(cmd, {
        cwd,
        env: buildGitEnv(),
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      }) as any

      let output = ""

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      // Combined append function - supports multiple types and truncates metadata
      const append = (chunk: Buffer | Uint8Array | string) => {
        const text = chunk instanceof Buffer || chunk instanceof Uint8Array
          ? new TextDecoder().decode(chunk)
          : chunk
        output += text
        ctx.metadata({
          metadata: {
            // truncate the metadata to avoid GIANT blobs of data (has nothing to do w/ what agent can access)
            output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
            description: params.description,
          },
        })
      }

      // Stream reader approach for cross-platform compatibility
      const stdoutReader = proc.stdout?.getReader()
      const stderrReader = proc.stderr?.getReader()

      const readOutput = async (reader: ReadableStreamDefaultReader | undefined): Promise<void> => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            append(value)
          }
        } catch {
          // Stream reading ended (abort or natural completion)
        }
      }

      let timedOut = false
      let aborted = false
      let exited = false

      const kill = () => Shell.killTree(proc as any, { exited: () => exited })

      // Handle abort before starting
      if (ctx.abort.aborted) {
        aborted = true
        await kill()
      }

      const abortHandler = () => {
        aborted = true
        void kill()
      }

      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      const timeoutTimer = setTimeout(() => {
        timedOut = true
        void kill()
      }, timeout + 100)

      // Start reading streams
      const stdoutPromise = readOutput(stdoutReader)
      const stderrPromise = readOutput(stderrReader)

      // Wait for process exit
      await proc.exited

      // Guarantee streams drain before returning (Issue #17 fix)
      // This prevents data loss when proc.exited resolves before streams finish
      await Promise.all([stdoutPromise, stderrPromise]).catch(() => {})

      exited = true

      // Cleanup
      clearTimeout(timeoutTimer)
      ctx.abort.removeEventListener("abort", abortHandler)

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

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: proc.exitCode,
          description: params.description,
        },
        output,
      }
    },
  }
})
