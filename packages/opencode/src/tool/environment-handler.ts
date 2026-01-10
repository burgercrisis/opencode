import { spawn } from "child_process"
import { Log } from "../util/log"

const log = Log.create({ service: "environment-handler" })

/**
 * Environment variable handler interface for cross-platform env management
 */
export interface EnvironmentHandler {
  /** Set an environment variable */
  set(key: string, value: string): Promise<void>
  /** Get an environment variable */
  get(key: string): Promise<string | undefined>
  /** Unset an environment variable */
  unset(key: string): Promise<void>
  /** Convert environment variable syntax to platform format */
  convertSyntax(input: string): string
  /** Get all environment variables */
  getAll(): Promise<Record<string, string>>
}

/**
 * Factory for creating platform-appropriate environment handlers
 */
export class EnvironmentHandlerFactory {
  static create(): EnvironmentHandler {
    return process.platform === "win32" ? new WindowsEnvironmentHandler() : new UnixEnvironmentHandler()
  }
}

/**
 * Windows environment handler implementation
 */
class WindowsEnvironmentHandler implements EnvironmentHandler {
  async set(key: string, value: string): Promise<void> {
    try {
      // Use PowerShell to set environment variable persistently
      const command = `$env:${key} = "${value.replace(/"/g, '""')}"`
      await this.executePowerShellCommand(command)
      // Also set in current process
      process.env[key] = value
      log.debug("Set environment variable", { key, value })
    } catch (error) {
      log.error("Failed to set environment variable", { key, error })
      throw error
    }
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const command = `Write-Output $env:${key}`
      const result = await this.executePowerShellCommand(command)
      const value = result.trim()
      return value || undefined
    } catch (error) {
      log.error("Failed to get environment variable", { key, error })
      return undefined
    }
  }

  async unset(key: string): Promise<void> {
    try {
      const command = `Remove-Item Env:\\${key} -ErrorAction SilentlyContinue`
      await this.executePowerShellCommand(command)
      // Also remove from current process
      delete process.env[key]
      log.debug("Unset environment variable", { key })
    } catch (error) {
      log.error("Failed to unset environment variable", { key, error })
      throw error
    }
  }

  convertSyntax(input: string): string {
    // Convert Unix-style $VAR to Windows $env:VAR
    return input.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => {
      // Skip if already in Windows format
      if (input.includes(`$env:${varName}`)) {
        return match
      }
      return `$env:${varName}`
    })
  }

  async getAll(): Promise<Record<string, string>> {
    try {
      const command = "Get-ChildItem Env: | ConvertTo-Json"
      const result = await this.executePowerShellCommand(command)
      const envVars = JSON.parse(result)

      const env: Record<string, string> = {}
      for (const item of envVars) {
        env[item.Key] = item.Value
      }

      return env
    } catch (error) {
      log.error("Failed to get all environment variables", { error })
      // Fallback to process.env
      return { ...process.env } as Record<string, string>
    }
  }

  private async executePowerShellCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })

      let stdout = ""
      let stderr = ""

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString()
      })

      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`PowerShell command failed with exit code ${code}: ${stderr}`))
        }
      })

      proc.on("error", (error) => {
        reject(error)
      })
    })
  }
}

/**
 * Unix environment handler implementation
 */
class UnixEnvironmentHandler implements EnvironmentHandler {
  async set(key: string, value: string): Promise<void> {
    try {
      // Use export command
      const command = `export ${key}="${value.replace(/"/g, '\\"')}"`
      await this.executeShellCommand(command)
      // Also set in current process
      process.env[key] = value
      log.debug("Set environment variable", { key, value })
    } catch (error) {
      log.error("Failed to set environment variable", { key, error })
      throw error
    }
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const command = `echo "$${key}"`
      const result = await this.executeShellCommand(command)
      const value = result.trim()
      return value || undefined
    } catch (error) {
      log.error("Failed to get environment variable", { key, error })
      return undefined
    }
  }

  async unset(key: string): Promise<void> {
    try {
      const command = `unset ${key}`
      await this.executeShellCommand(command)
      // Also remove from current process
      delete process.env[key]
      log.debug("Unset environment variable", { key })
    } catch (error) {
      log.error("Failed to unset environment variable", { key, error })
      throw error
    }
  }

  convertSyntax(input: string): string {
    // Unix variables are already in correct format ($VAR)
    // But ensure proper escaping
    return input.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => {
      return `$${varName}`
    })
  }

  async getAll(): Promise<Record<string, string>> {
    try {
      const command = "env"
      const result = await this.executeShellCommand(command)
      const env: Record<string, string> = {}

      for (const line of result.split("\n")) {
        const trimmed = line.trim()
        if (trimmed) {
          const [key, ...valueParts] = trimmed.split("=")
          if (key) {
            env[key] = valueParts.join("=")
          }
        }
      }

      return env
    } catch (error) {
      log.error("Failed to get all environment variables", { error })
      // Fallback to process.env
      return { ...process.env } as Record<string, string>
    }
  }

  private async executeShellCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const shell = process.env.SHELL || "/bin/bash"
      const proc = spawn(shell, ["-c", command], {
        stdio: ["ignore", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString()
      })

      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Shell command failed with exit code ${code}: ${stderr}`))
        }
      })

      proc.on("error", (error) => {
        reject(error)
      })
    })
  }
}
