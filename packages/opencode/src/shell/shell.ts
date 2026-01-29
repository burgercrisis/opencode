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

    try {
      process.kill(-pid, "SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }

  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      // First try to find bash in PATH (most reliable)
      const bashInPath = Bun.which("bash")
      if (bashInPath) {
        if (Flag.OPENCODE_DEBUG_SHELL) {
          console.log(`[Shell Fallback] Found bash in PATH: ${bashInPath}`)
        }
        return bashInPath
      }

      // Then try explicit flag if set
      if (Flag.OPENCODE_GIT_BASH_PATH) {
        try {
          if (Bun.file(Flag.OPENCODE_GIT_BASH_PATH).size) {
            if (Flag.OPENCODE_DEBUG_SHELL) {
              console.log(`[Shell Fallback] Using explicit flag path: ${Flag.OPENCODE_GIT_BASH_PATH}`)
            }
            return Flag.OPENCODE_GIT_BASH_PATH
          }
        } catch (e) {
          // File doesn't exist, continue with fallback
          if (Flag.OPENCODE_DEBUG_SHELL) {
            console.log(`[Shell Fallback] Explicit flag path invalid: ${Flag.OPENCODE_GIT_BASH_PATH}`)
          }
        }
      }

      // Try to find Git Bash via git.exe location
      const git = Bun.which("git")
      if (git) {
        // Try multiple possible locations for bash
        const possibleBashPaths = [
          // Standard location: git.exe at cmd/, bash.exe at bin/
          path.join(git, "..", "..", "bin", "bash.exe"),
          // Alternative: git.exe at bin/, bash.exe at bin/
          path.join(git, "..", "bash.exe"),
          // git.exe at root, bash.exe at root
          path.join(git, "..", "bash.exe"),
          // Also try sh.exe as fallback
          path.join(git, "..", "..", "bin", "sh.exe"),
          path.join(git, "..", "sh.exe"),
        ]

        for (const bashPath of possibleBashPaths) {
          try {
            if (Bun.file(bashPath).size > 0) {
              if (Flag.OPENCODE_DEBUG_SHELL) {
                console.log(`[Shell Fallback] Found bash via git location: ${bashPath}`)
              }
              return bashPath
            }
          } catch (e) {
            // Continue to next path
          }
        }

        if (Flag.OPENCODE_DEBUG_SHELL) {
          console.log(`[Shell Fallback] No valid bash found at git locations`)
        }
      }

      // Graceful fallback to CMD.exe when Git Bash is unavailable
      const cmdPath = process.env.COMSPEC || "cmd.exe"
      if (Flag.OPENCODE_DEBUG_SHELL) {
        console.log(`[Shell Fallback] Using CMD fallback: ${cmdPath}`)
      }
      return cmdPath
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = Bun.which("bash")
    if (bash) return bash
    return "/bin/sh"
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
      const args = getShellArgs(shellPath, command)
      return {
        executable: shellPath,
        args: args,
        useShellFlag: false,
      }
    }

    // Check for PowerShell commands first
    if (isPowerShellCommand(command)) {
      const match = command.match(/^(powershell|pwsh)(?:\.exe)?\s+(.*)$/i)
      if (match) {
        const [, requestedShell, argsString] = match

        const isPwsh = requestedShell.toLowerCase() === "pwsh"
        const executable = isPwsh
          ? (Bun.which("pwsh.exe") || Bun.which("pwsh") || "powershell.exe")
          : "powershell.exe"

        // Get array of arguments for PowerShell
        const psArgs = getPowerShellArgs(argsString)

        return {
          executable,
          args: psArgs,
          useShellFlag: false,
          windowsVerbatimArguments: false, // Use standard quoting for PS
        }
      }
    }

    // Check for CMD commands
    if (isCmdCommand(command)) {
      // Extract the cmd executable and arguments
      // Match pattern: cmd[.exe] <args>
      const match = command.match(/^(cmd(?:\.exe)?)\s+(.*)$/i)
      if (match) {
        const [, , argsString] = match
        // For CMD, we want to split on /c or /k but keep the rest as a single argument
        // e.g., "cmd /c echo hello" -> ["/c", "echo hello"]
        const cmdArgs: string[] = []
        const cmdMatch = argsString.match(/^(\/[ck])\s+(.*)$/i)
        let commandToExecute = argsString

        if (cmdMatch) {
          cmdArgs.push(cmdMatch[1])
          commandToExecute = cmdMatch[2]
        }
        // After extracting commandToExecute (around line 258)
        // For CMD commands, ensure the entire command string is passed correctly
        // Do NOT parse pipes, quotes, or other shell syntax - CMD.exe handles that

        // Verify proper quoting for echo commands
        if (/^\s*echo\s+/i.test(commandToExecute)) {
          // Push the full command as a single argument
          cmdArgs.push(commandToExecute)
          return {
            executable: process.env.COMSPEC || "cmd.exe",
            args: cmdArgs,
            useShellFlag: false,
          }
        }
        if (commandToExecute.includes('|') || commandToExecute.includes('"')) {
          cmdArgs.push(commandToExecute);
          return {
            executable: process.env.COMSPEC || "cmd.exe",
            args: cmdArgs,
            useShellFlag: false,
          };
        }

        // Fix for chained commands (&& or ||) with dynamic environment variables (e.g., %cd%)
        // CMD expands %variables% at parse time, not execution time, which breaks `cd /d %temp% && echo %cd%`
        // We enable delayed expansion (/V:ON) and convert %var% to !var! for dynamic variables.
        const isChained = /(&&|\|\|)/.test(commandToExecute)
        const hasDynamicVars = hasDynamicEnvVars(commandToExecute)
        const hasVOn = argsString.match(/\/V:ON/i)

        if (isChained && hasDynamicVars && !hasVOn) {
          // Add /V:ON flag for delayed expansion
          cmdArgs.unshift("/V:ON")
          // Convert dynamic variables to delayed expansion syntax
          commandToExecute = convertToDelayedExpansion(commandToExecute)
        }



        cmdArgs.push(commandToExecute)

        return {
          executable: process.env.COMSPEC || "cmd.exe",
          args: cmdArgs,
          useShellFlag: false,
        }
      }
    }

    // Check for bare CMD builtin commands that should be executed via CMD.exe
    if (isCmdBuiltin(command) && process.platform === "win32") {
      // For bare CMD builtins, wrap them in cmd /c to ensure proper execution
      // Special case: bare "dir" command should show all files including hidden ones
      let finalCommand = command
      if (command.trim() === "dir") {
        finalCommand = "dir /a"
      }

      if (Flag.OPENCODE_DEBUG_SHELL) {
        console.log(`[Bare CMD Builtin] Command: "${command}" -> "${finalCommand}"`)
      }

      return {
        executable: process.env.COMSPEC || "cmd.exe",
        args: ["/c", finalCommand],
        useShellFlag: false,
      }
    }
 
    // For all other commands (git, npm, etc.), use the shell
    const shellPath = configShell || acceptable()
    const args = getShellArgs(shellPath, command)

    if (Flag.OPENCODE_DEBUG_SHELL) {
      console.log(`[Spawn Config] Using shell for command "${command}": ${shellPath}`)
    }

    return {
      executable: shellPath,
      args: args,
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
