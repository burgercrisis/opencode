import { spawn } from "child_process"
import { Log } from "../util/log"

const log = Log.create({ service: "cross-platform-signal-handler" })

/**
 * Signal handler interface for cross-platform signal management
 */
export interface SignalHandler {
  /** Send interrupt signal (SIGINT) */
  sendInterrupt(pid: number): Promise<void>
  /** Send terminate signal (SIGTERM) */
  sendTerminate(pid: number): Promise<void>
  /** Send kill signal (SIGKILL) */
  sendKill(pid: number): Promise<void>
}

/**
 * Factory for creating platform-appropriate signal handlers
 */
export class SignalHandlerFactory {
  static create(): SignalHandler {
    return process.platform === "win32" ? new WindowsSignalHandler() : new UnixSignalHandler()
  }
}

/**
 * Windows signal handler implementation using taskkill and Stop-Process
 */
class WindowsSignalHandler implements SignalHandler {
  async sendInterrupt(pid: number): Promise<void> {
    try {
      // Try PowerShell Stop-Process first (more reliable)
      await this.executePowerShellCommand(`Stop-Process -Id ${pid} -ErrorAction Stop`)
      log.debug("Sent interrupt signal via PowerShell", { pid })
    } catch (error) {
      // Fallback to taskkill
      try {
        await this.executeCommand("taskkill", ["/F", "/PID", pid.toString()])
        log.debug("Sent interrupt signal via taskkill", { pid })
      } catch (fallbackError) {
        log.error("Failed to send interrupt signal", { pid, error: fallbackError })
        throw fallbackError
      }
    }
  }

  async sendTerminate(pid: number): Promise<void> {
    try {
      // Use taskkill for terminate (equivalent to SIGTERM)
      await this.executeCommand("taskkill", ["/PID", pid.toString()])
      log.debug("Sent terminate signal", { pid })
    } catch (error) {
      log.error("Failed to send terminate signal", { pid, error })
      throw error
    }
  }

  async sendKill(pid: number): Promise<void> {
    try {
      // Force kill with taskkill
      await this.executeCommand("taskkill", ["/F", "/PID", pid.toString()])
      log.debug("Sent kill signal", { pid })
    } catch (error) {
      log.error("Failed to send kill signal", { pid, error })
      throw error
    }
  }

  private async executeCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })

      let stderr = ""
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      proc.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`))
        }
      })

      proc.on("error", (error) => {
        reject(error)
      })
    })
  }

  private async executePowerShellCommand(command: string): Promise<void> {
    return this.executeCommand("powershell.exe", ["-NoProfile", "-Command", command])
  }
}

/**
 * Unix signal handler implementation using standard signals
 */
class UnixSignalHandler implements SignalHandler {
  async sendInterrupt(pid: number): Promise<void> {
    try {
      process.kill(pid, "SIGINT")
      log.debug("Sent SIGINT signal", { pid })
    } catch (error) {
      log.error("Failed to send SIGINT signal", { pid, error })
      throw error
    }
  }

  async sendTerminate(pid: number): Promise<void> {
    try {
      process.kill(pid, "SIGTERM")
      log.debug("Sent SIGTERM signal", { pid })
    } catch (error) {
      log.error("Failed to send SIGTERM signal", { pid, error })
      throw error
    }
  }

  async sendKill(pid: number): Promise<void> {
    try {
      process.kill(pid, "SIGKILL")
      log.debug("Sent SIGKILL signal", { pid })
    } catch (error) {
      log.error("Failed to send SIGKILL signal", { pid, error })
      throw error
    }
  }
}
