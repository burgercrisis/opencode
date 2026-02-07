import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import path from "path"
import { spawn, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  /**
   * Kills a process tree, including all child processes.
   * On Windows, uses taskkill. On Unix-like systems, sends SIGTERM then SIGKILL if needed.
   * @param proc - The child process to kill
   * @param opts - Options object
   * @param opts.exited - Optional function to check if the process has already exited
   * @returns Promise that resolves when the process tree is killed
   */
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    const kill = (sig: "SIGTERM" | "SIGKILL") => {
      try {
        process.kill(-pid, sig)
      } catch {
        proc.kill(sig)
      }
    }

    kill("SIGTERM")
    await Bun.sleep(SIGKILL_TIMEOUT_MS)
    if (!opts?.exited?.()) kill("SIGKILL")
  }

  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      const bash = Bun.which("bash")
      if (bash) return bash

      if (Flag.OPENCODE_GIT_BASH_PATH && Bun.file(Flag.OPENCODE_GIT_BASH_PATH).size) {
        return Flag.OPENCODE_GIT_BASH_PATH
      }

      const git = Bun.which("git")
      if (git) {
        const paths = [
          path.join(git, "..", "..", "bin", "bash.exe"),
          path.join(git, "..", "bash.exe"),
          path.join(git, "..", "..", "bin", "sh.exe"),
          path.join(git, "..", "sh.exe"),
        ]
        const found = paths.find(p => Bun.file(p).size > 0)
        if (found) return found
      }

      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    return Bun.which("bash") || "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) return s
    return fallback()
  })

  /**
   * Returns the appropriate shell arguments for a given shell and command.
   * Ensures login profiles are sourced for bash and zsh.
   */
  export function getShellArgs(shell: string, command: string): string[] {
    const shellName = path.basename(shell).toLowerCase()

    if (shellName.includes("zsh")) {
      return [
        "-c",
        "-l",
        `[[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true; [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true; ${command}`,
      ]
    }

    if (shellName.includes("bash")) {
      return [
        "-c",
        "-l",
        `[[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true; ${command}`,
      ]
    }

    if (shellName.includes("pwsh") || shellName.includes("powershell")) {
      return ["-NoProfile", "-Command", command]
    }

    if (shellName.includes("fish") || shellName.includes("nu")) {
      return ["-c", command]
    }

    // Default fallback for other shells - try to use login shell to source profiles
    return ["-c", "-l", command]
  }

  /**
   * Detects if a command is a PowerShell command
   */
  export function isPowerShellCommand(command: string): boolean {
    const trimmed = command.trim()
    const result = /^(?:powershell|pwsh)(\.exe)?\s/i.test(trimmed)

    return result
  }

  /**
   * Detects if PowerShell arguments contain common parameters that should be moved to preferences
   * @param argsString - The PowerShell arguments string to analyze
   */
  function detectCommonPreferences(argsString: string): {
    hasDebug: boolean
    hasVerbose: boolean
    errorAction?: string
    warningAction?: string
  } {
    const hasDebug = /-(?:Debug|d)(?:\s+|$)/i.test(argsString)
    const hasVerbose = /-(?:Verbose|v)(?:\s+|$)/i.test(argsString)

    const errorActionMatch = argsString.match(/-ErrorAction\s+(\w+)/i)
    const errorAction = errorActionMatch ? errorActionMatch[1] : undefined

    const warningActionMatch = argsString.match(/-WarningAction\s+(\w+)/i)
    const warningAction = warningActionMatch ? warningActionMatch[1] : undefined

    return { hasDebug, hasVerbose, errorAction, warningAction }
  }

  /**
   * Detects if a command is a CMD command
   */
  export function isCmdCommand(command: string): boolean {
    const trimmed = command.trim()
    return /^cmd(\.exe)?\s/i.test(trimmed)
  }

  /**
   * Detects if a CMD command string contains dynamic environment variables
   * that might change during command execution (e.g., %cd%, %temp%, %random%)
   */
  export function hasDynamicEnvVars(command: string): boolean {
    return /%(cd|temp|tmp|random|time|date)%/i.test(command)
  }

  /**
   * Set of CMD builtin commands
   */
  const CMD_BUILTINS = new Set([
    'assoc', 'attrib', 'break', 'call', 'cd', 'chcp', 'chdir', 'cls', 'cmd', 'color',
    'copy', 'date', 'del', 'dir', 'echo', 'endlocal', 'erase', 'exit', 'for', 'ftype',
    'goto', 'if', 'md', 'mkdir', 'mklink', 'move', 'path', 'pause', 'popd', 'prompt',
    'pushd', 'rd', 'rem', 'ren', 'rmdir', 'set', 'setlocal', 'shift', 'start', 'time',
    'title', 'type', 'ver', 'verify', 'vol'
  ])

  /**
   * Checks if the first word of a command is a CMD builtin command or if it contains pipes
   * @param {string} command - The command string to check
   * @returns {boolean} True if the command starts with a builtin or contains pipes
   */
  export function isCmdBuiltin(command: string): boolean {
    const trimmed = command.trim()
    const firstWord = trimmed.split(/\s+/)[0]
    
    // Check if this is an explicit CMD command (e.g., "cmd /c dir")
    // These should not be considered bare builtins
    if (firstWord && /^cmd$/i.test(firstWord)) {
      // Check if it's followed by /c or /k flags
      const cmdPattern = /^cmd(\.exe)?\s+(\/[ck])\s+/i
      if (cmdPattern.test(trimmed)) {
        return false
      }
    }
    
    const isBuiltin = firstWord ? CMD_BUILTINS.has(firstWord.toLowerCase()) : false
    const hasPipes = command.includes('|')
    
    return isBuiltin || hasPipes
  }

  /**
   * Converts CMD immediate expansion syntax (%var%) to delayed expansion syntax (!var!)
   * for dynamic environment variables
   */
  function convertToDelayedExpansion(command: string): string {
    return command.replace(/%(cd|temp|tmp|random|time|date|errorlevel|pid|ppid|username|computername)%/gi, (match) => {
      const varName = match.slice(1, -1)
      return `!${varName}!`
    })
  }



  /**
   * Configuration for spawning a command
   */
  export interface SpawnConfig {
    /** The executable to spawn (e.g., "powershell.exe", "cmd.exe", or the original command) */
    executable: string
    /** Arguments to pass to the executable (empty array if using shell flag) */
    args: string[]
    /** Whether to use the shell option in spawn */
    useShellFlag: boolean
    /** The shell to use if useShellFlag is true */
    shell?: string
    /** Optional environment variables to merge into the process environment */
    env?: Record<string, string>
    windowsVerbatimArguments?: boolean
  }

  /**
   * Parses a PowerShell argument string into an array of arguments,
   * specifically handling the -Command/-c flag and injecting preferences.
   */
  function getPowerShellArgs(argsString: string): string[] {
    const { hasDebug, hasVerbose, errorAction, warningAction } = detectCommonPreferences(argsString)
    
    // Find the -Command or -c flag and its content
    const commandMatch = argsString.match(/(-Command|-c)(?:\s+|$)(.*)$/i)
    
    const preferences = [
      hasDebug ? "$DebugPreference='Continue';" : "",
      hasVerbose ? "$VerbosePreference='Continue';" : "",
      errorAction ? `$ErrorActionPreference='${errorAction}';` : "",
      warningAction ? `$WarningActionPreference='${warningAction}';` : "",
    ].filter(Boolean).join(" ")

    if (commandMatch) {
      const flag = commandMatch[1]
      const rawBody = commandMatch[2].trim()
      
      // Remove surrounding quotes if present to inject preferences inside
      const body = ((rawBody.startsWith('"') && rawBody.endsWith('"')) ||
                    (rawBody.startsWith("'") && rawBody.endsWith("'")))
        ? rawBody.slice(1, -1)
        : rawBody

      // Extract flags BEFORE the -Command flag
      const beforeCommand = argsString.slice(0, commandMatch.index).trim()
      const resultArgs: string[] = ["-NoProfile"]
      
      if (beforeCommand) {
        // Clean and split flags. This is a simple split, but usually enough for PS flags
        const cleanedBefore = beforeCommand
          .replace(/-(?:Debug|d)(?:\s+|$)/gi, " ")
          .replace(/-(?:Verbose|v)(?:\s+|$)/gi, " ")
          .replace(/-ErrorAction\s+\w+/gi, " ")
          .replace(/-WarningAction\s+\w+/gi, " ")
          .split(/\s+/)
          .filter(Boolean)
        resultArgs.push(...cleanedBefore)
      }

      resultArgs.push(flag, preferences ? `${preferences} ${body}` : body)
      return resultArgs
    }

    // If no -Command flag found, wrap everything in -Command
    const cleaned = argsString
      .replace(/-(?:Debug|d)(?:\s+|$)/gi, " ")
      .replace(/-(?:Verbose|v)(?:\s+|$)/gi, " ")
      .replace(/-ErrorAction\s+\w+/gi, " ")
      .replace(/-WarningAction\s+\w+/gi, " ")
      .trim()

    return ["-NoProfile", "-Command", preferences ? `${preferences} ${cleaned}` : cleaned]
  }

  /**
   * Determines the correct spawn configuration for a command on Windows.
   * Routes PowerShell and CMD commands directly to their executables to avoid
   * variable corruption when passing through Git Bash.
   */
  export function getSpawnConfig(command: string, configShell?: string): SpawnConfig {
    // Only apply special handling on Windows
    if (process.platform !== "win32") {
      const shellPath = configShell || acceptable()
      return {
        executable: shellPath,
        args: getShellArgs(shellPath, command),
        useShellFlag: false,
      }
    }

    // Check for PowerShell commands first
    if (isPowerShellCommand(command)) {
      const match = command.match(/^(powershell|pwsh)(?:\.exe)?\s+(.*)$/i)
      if (match) {
        const requestedShell = match[1]
        const argsString = match[2]
        const isPwsh = requestedShell.toLowerCase() === "pwsh"
        const executable = isPwsh
          ? (Bun.which("pwsh.exe") || Bun.which("pwsh") || "powershell.exe")
          : "powershell.exe"

        return {
          executable,
          args: getPowerShellArgs(argsString),
          useShellFlag: false,
          windowsVerbatimArguments: false,
        }
      }
    }

    // Check for CMD commands
    if (isCmdCommand(command)) {
      const match = command.match(/^(cmd(?:\.exe)?)\s+(.*)$/i)
      if (match) {
        const argsString = match[2]
        const cmdMatch = argsString.match(/^(\/[ck])\s+(.*)$/i)
        const initialArgs = cmdMatch ? [cmdMatch[1]] : []
        const rawToExecute = cmdMatch ? cmdMatch[2] : argsString
        
        const isChained = /(&&|\|\|)/.test(rawToExecute)
        const hasVOn = argsString.match(/\/V:ON/i)
        const useVOn = isChained && hasDynamicEnvVars(rawToExecute) && !hasVOn
        
        const cmdArgs = useVOn ? ["/V:ON", ...initialArgs] : initialArgs
        const finalToExecute = useVOn ? convertToDelayedExpansion(rawToExecute) : rawToExecute

        return {
          executable: process.env.COMSPEC || "cmd.exe",
          args: [...cmdArgs, finalToExecute],
          useShellFlag: false,
          windowsVerbatimArguments: true,
        }
      }
    }

    // Check for bare CMD builtin commands
    if (isCmdBuiltin(command)) {
      const finalCommand = command.trim() === "dir" ? "dir /a" : command
      return {
        executable: process.env.COMSPEC || "cmd.exe",
        args: ["/c", finalCommand],
        useShellFlag: false,
        windowsVerbatimArguments: true,
      }
    }
 
    const shellPath = configShell || acceptable()
    return {
      executable: shellPath,
      args: getShellArgs(shellPath, command),
      useShellFlag: false,
    }
  }

  /**
   * Normalizes the exit code based on the raw exit code and error status
   */
  export function normalizeExitCode(exitCode: number | null | undefined, hasErrors: boolean): number {
    if (exitCode === 0 && hasErrors) return 1
    if (exitCode !== null && exitCode !== undefined) return exitCode
    return hasErrors ? 1 : 0
  }
}
