import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import path from "path"
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"

const SIGKILL_TIMEOUT_MS = 200

/**
 * Detect if running under Bun runtime for platform-specific optimizations
 */
const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

/**
 * Cross-platform sleep utility
 * Uses setTimeout for universal compatibility
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
const crossPlatformSleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Cross-platform which utility
 * Finds executable in PATH
 * @param cmd - Command to find
 * @returns Full path to executable or null if not found
 */
function whichSync(cmd: string): string | null {
  if (isBunRuntime) {
    return Bun.which(cmd)
  }
  // Node.js fallback using require
  try {
    const { which } = require("which")
    return which.sync(cmd)
  } catch {
    return null
  }
}

/**
 * Cross-platform file existence check
 * @param filepath - Path to file
 * @returns true if file exists and is accessible
 */
function fileExistsSync(filepath: string): boolean {
  if (isBunRuntime) {
    return Bun.file(filepath).size > 0
  }
  // Node.js fallback
  try {
    return fs.existsSync(filepath)
  } catch {
    return false
  }
}

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      const taskkillArgs = ["/pid", String(pid), "/f", "/t"]

      if (isBunRuntime) {
        // Bun-native implementation for Windows
        // Uses Bun.spawn with Promise.race for timeout handling
        try {
          const killer = Bun.spawn(["taskkill", ...taskkillArgs], {
            stdio: ["ignore", "ignore", "ignore"],
          })
          await Promise.race([
            killer.exited, // Resolve when taskkill completes
            crossPlatformSleep(SIGKILL_TIMEOUT_MS).then(() => {
              // Timeout: forcibly terminate the taskkill process
              // This prevents hanging if taskkill hangs on a stubborn process
              try {
                ;(killer as any).terminate()
              } catch {
                // Ignore - taskkill may have already exited or been cleaned up
              }
            }),
          ])
        } catch {
          // taskkill execution failed (missing binary, permission denied, etc.)
          // Silently continue - the goal is to ensure the target process is dead
          // If this fails, the original process may still be running
        }
      } else {
        // Node.js implementation for Windows
        // Uses Node's spawn with event-based resolution and timeout cleanup
        await new Promise<void>((resolve) => {
          const killer = spawn("taskkill", taskkillArgs, { stdio: "ignore" })

          // Timeout mechanism: ensures we never hang indefinitely
          // This mirrors Bun's Promise.race timeout behavior
          const timeout = setTimeout(() => {
            // Cleanup: kill the taskkill process to prevent orphaning
            // Without this, a hung taskkill would leave an orphaned process
            try {
              killer.kill("SIGTERM") // Graceful termination attempt
              // Follow-up with SIGKILL after short delay to ensure cleanup
              setTimeout(() => {
                try {
                  killer.kill("SIGKILL")
                } catch {
                  // Ignore - taskkill may have already exited
                }
              }, 50)
            } catch {
              // Ignore - killer process may already be dead
            }
            resolve()
          }, SIGKILL_TIMEOUT_MS)

          // Event handlers: resolve when taskkill completes (success or failure)
          killer.once("exit", () => {
            clearTimeout(timeout) // Prevent timeout cleanup from firing
            resolve()
          })
          killer.once("error", () => {
            clearTimeout(timeout) // Prevent timeout cleanup from firing
            resolve()
          })
        })
      }
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await crossPlatformSleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await crossPlatformSleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.OPENCODE_GIT_BASH_PATH) return Flag.OPENCODE_GIT_BASH_PATH
      const git = whichSync("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (fileExistsSync(bash)) return bash
      }
      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = whichSync("bash")
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
}
