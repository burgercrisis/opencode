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
    // Check for -Debug and -Verbose flags in the arguments string
    const debugMatch = argsString.match(/(^|\s)-Debug(\s|$)/i)
    const verboseMatch = argsString.match(/(^|\s)-Verbose(\s|$)/i)

    const errorActionMatch = argsString.match(/-ErrorAction\s+(\w+)/i)
    const errorAction = errorActionMatch ? errorActionMatch[1] : undefined

    const warningActionMatch = argsString.match(/-WarningAction\s+(\w+)/i)
    const warningAction = warningActionMatch ? warningActionMatch[1] : undefined

    return { 
      hasDebug: !!debugMatch, 
      hasVerbose: !!verboseMatch, 
      errorAction, 
      warningAction 
    }
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
    
    const preferences = [
      hasDebug ? "$DebugPreference='Continue';" : "",
      hasVerbose ? "$VerbosePreference='Continue';" : "",
      errorAction ? `$ErrorActionPreference='${errorAction}';` : "",
      warningAction ? `$WarningActionPreference='${warningAction}';` : "",
    ].filter(Boolean).join(" ")

    const args: string[] = ["-NoProfile"]
    let current = argsString.trim()

    // Robust parsing loop for PowerShell arguments
    while (current.length > 0) {
      // Check for -Command or -c flag - everything after is a single argument
      const commandFlagMatch = current.match(/^(-Command|-c)(?:\s+|$)/i)
      if (commandFlagMatch) {
        const flag = commandFlagMatch[1]
        args.push(flag)
        current = current.slice(commandFlagMatch[0].length).trim()
        
        // Everything remaining is the command argument
        if (current.length > 0) {
          let commandArg = current
          // Remove surrounding quotes if present to inject preferences inside
          if ((commandArg.startsWith('"') && commandArg.endsWith('"')) ||
              (commandArg.startsWith("'") && commandArg.endsWith("'"))) {
            commandArg = commandArg.slice(1, -1)
          }

          args.push(preferences ? `${preferences} ${commandArg}` : commandArg)
        }
        break
      }

      // Match other flags (starts with -)
      const flagMatch = current.match(/^(-\w+)(?:\s+|$)/)
      if (flagMatch) {
        args.push(flagMatch[1])
        current = current.slice(flagMatch[0].length).trim()
        continue
      }

      // Match quoted string (double quotes)
      const quotedMatch = current.match(/^"((?:[^"\\]|\\.)*)"/s)
      if (quotedMatch) {
        args.push(quotedMatch[1])
        current = current.slice(quotedMatch[0].length).trim()
        continue
      }

      // Match single quoted string
      const singleQuotedMatch = current.match(/^'((?:[^'\\]|\\.)*)'/s)
      if (singleQuotedMatch) {
        args.push(singleQuotedMatch[1])
        current = current.slice(singleQuotedMatch[0].length).trim()
        continue
      }

      // Match unquoted word
      const wordMatch = current.match(/^(\S+)/)
      if (wordMatch) {
        args.push(wordMatch[1])
        current = current.slice(wordMatch[0].length).trim()
        continue
      }

      break
    }

    // If no arguments were parsed (empty string), but we have preferences,
    // we might need to add a default -Command if that's what was intended.
    // However, if we didn't find a -Command and didn't find other args,
    // we should check if the original string was actually a command that should have been wrapped.
    if (args.length === 1 && args[0] === "-NoProfile" && argsString.trim().length > 0) {
      // Fallback for simple commands that don't start with a flag
      const cleaned = argsString
        .replace(/-(?:Debug|d)(?:\s+|$)/gi, " ")
        .replace(/-(?:Verbose|v)(?:\s+|$)/gi, " ")
        .replace(/-ErrorAction\s+\w+/gi, " ")
        .replace(/-WarningAction\s+\w+/gi, " ")
        .trim()
      
      args.push("-Command", preferences ? `${preferences} ${cleaned}` : cleaned)
    }

    return args
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

        const psArgs = getPowerShellArgs(argsString)

        // Ensure UTF-8 output by prepending [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
        // to the command if it's a -Command or -c
        const commandArgIndex = psArgs.findIndex(arg => arg === "-Command" || arg === "-c")
        if (commandArgIndex !== -1 && commandArgIndex + 1 < psArgs.length) {
          const originalCmd = psArgs[commandArgIndex + 1]
          if (!originalCmd.includes("[Console]::OutputEncoding")) {
            psArgs[commandArgIndex + 1] = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${originalCmd}`
          }
        }

        return {
          executable,
          args: psArgs,
          useShellFlag: false,
          windowsVerbatimArguments: true,
        }
      }

      // Handle cases where powershell.exe is missing but arguments look like PowerShell
      if (command.startsWith("-ExecutionPolicy") || command.startsWith("-Command") || command.startsWith("-File")) {
        return {
          executable: "powershell.exe",
          args: getPowerShellArgs(command),
          useShellFlag: false,
          windowsVerbatimArguments: true,
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
        let finalToExecute = useVOn ? convertToDelayedExpansion(rawToExecute) : rawToExecute

        // After extracting commandToExecute (around line 258)
        // For CMD commands, ensure the entire command string is passed correctly
        // Do NOT parse pipes, quotes, or other shell syntax - CMD.exe handles that

        // Verify proper quoting for echo commands
        if (/^\s*echo\s+/i.test(finalToExecute)) {
          // Push the full command as a single argument
          cmdArgs.push(finalToExecute)
          return {
            executable: process.env.COMSPEC || "cmd.exe",
            args: cmdArgs,
            useShellFlag: false,
            windowsVerbatimArguments: true,
          }
        }
        
        if (finalToExecute.includes('|') || finalToExecute.includes('"')) {
          cmdArgs.push(finalToExecute);
          return {
            executable: process.env.COMSPEC || "cmd.exe",
            args: cmdArgs,
            useShellFlag: false,
            windowsVerbatimArguments: true,
          };
        }

        cmdArgs.push(finalToExecute)

        return {
          executable: process.env.COMSPEC || "cmd.exe",
          args: cmdArgs,
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
