import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import { Filesystem } from "@/util/filesystem"
import path from "path"
import { spawn, type ChildProcess } from "child_process"
import { setTimeout as sleep } from "node:timers/promises"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
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
      await sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }

  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.OPENCODE_GIT_BASH_PATH) return Flag.OPENCODE_GIT_BASH_PATH
      const git = Bun.which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (Filesystem.stat(bash)?.size) return bash
      }
      return process.env.COMSPEC || "cmd.exe"
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

  // Dynamic environment variables in cmd.exe that change between evaluations
  const DYNAMIC_ENV_VARS = new Set([
    "cd", "date", "time", "random", "errorlevel", "cmdextversion",
    "cmdcmdline", "highestnumanodenumber"
  ])

  export function hasDynamicEnvVars(command: string): boolean {
    // Match %VAR% patterns and check if they're dynamic
    const matches = command.match(/%([^%]+)%/g)
    if (!matches) return false
    for (const match of matches) {
      const varName = match.slice(1, -1).toLowerCase()
      if (DYNAMIC_ENV_VARS.has(varName)) return true
    }
    return false
  }

  export function isCmdCommand(command: string): boolean {
    const trimmed = command.trim().toLowerCase()
    return trimmed.startsWith("cmd ") || trimmed.startsWith("cmd.exe ") || trimmed === "cmd" || trimmed === "cmd.exe"
  }

  export function normalizeExitCode(code: number | undefined | null, error: boolean): number {
    if (error) return 1
    return code ?? 0
  }

  export function getShellArgs(shell: string, command: string): string[] {
    const basename = path.basename(shell).toLowerCase()

    // PowerShell
    if (basename === "pwsh.exe" || basename === "powershell.exe" || basename === "pwsh" || basename === "powershell") {
      return ["-NoProfile", "-Command", command]
    }

    // Fish doesn't support -l flag
    if (basename === "fish") {
      return ["-c", command]
    }

    // Zsh and bash support -l for login shell
    if (basename === "zsh" || basename === "bash" || basename === "sh") {
      return ["-l", "-c", command]
    }

    // Default for other shells
    return ["-c", "-l", command]
  }

  export interface SpawnConfig {
    executable: string
    args: string[]
    useShellFlag: boolean
  }

  export function getSpawnConfig(command: string): SpawnConfig {
    const shell = acceptable()
    const args = getShellArgs(shell, command)

    return {
      executable: shell,
      args,
      useShellFlag: true
    }
  }

  export function isPowerShellCommand(command: string): boolean {
    const trimmed = command.trim().toLowerCase()
    return trimmed.startsWith("powershell ") ||
      trimmed.startsWith("powershell.exe ") ||
      trimmed.startsWith("pwsh ") ||
      trimmed.startsWith("pwsh.exe ") ||
      trimmed === "powershell" ||
      trimmed === "powershell.exe" ||
      trimmed === "pwsh" ||
      trimmed === "pwsh.exe"
  }

  export function isCmdBuiltin(command: string): boolean {
    const cmdBuiltins = new Set([
      "assoc", "break", "call", "cd", "chcp", "chdir", "cls", "color", "copy", "date", "del", "dir",
      "echo", "endlocal", "erase", "exit", "for", "ftype", "goto", "if", "md", "mkdir", "mklink",
      "move", "path", "pause", "popd", "prompt", "pushd", "rd", "rem", "ren", "rename", "rmdir",
      "set", "setlocal", "shift", "start", "time", "title", "type", "ver", "verify", "vol"
    ])

    const firstWord = command.trim().split(/\s+/)[0].toLowerCase()
    return cmdBuiltins.has(firstWord)
  }
}
