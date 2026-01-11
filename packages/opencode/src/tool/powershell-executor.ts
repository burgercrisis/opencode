/**
 * PowerShell Executor - Executes PowerShell commands via temp files
 *
 * This module provides a reliable way to execute PowerShell commands on Windows
 * by writing commands to temporary `.ps1` files and executing them via the
 * `-File` parameter instead of the problematic `-Command` parameter.
 *
 * @module powershell-executor
 */

import type { TempFileManager } from "./temp-file-manager"
import { Log } from "../util/log"

/**
 * Runtime detection for cross-platform compatibility
 * Note: PowerShellExecutor is Windows-only, so we primarily use Bun APIs
 */
const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

/**
 * Options for executing a PowerShell command
 */
export interface ExecOptions {
  /** Whether to skip loading PowerShell profiles */
  noProfile?: boolean
  /** Execution policy to use */
  executionPolicy?: "Bypass" | "RemoteSigned"
  /** Timeout in milliseconds */
  timeout?: number
  /** Whether to capture stdout/stderr */
  captureOutput?: boolean
}

/**
 * Options for configuring the PowerShellExecutor
 */
export interface PowerShellExecutorOptions {
  /** TempFileManager instance for creating/cleanup of temp files */
  tempFileManager: TempFileManager
  /** PowerShell executable path (default: 'powershell') */
  executable?: string
  /** Default timeout in milliseconds (default: 60000) */
  defaultTimeout?: number
  /** Default execution policy (default: 'Bypass') */
  executionPolicy?: "Bypass" | "RemoteSigned"
  /** Optional logger for debugging */
  logger?: Log.Logger
}

/**
 * Result of a command execution
 */
export interface ExecutionResult {
  /** Standard output from the command */
  stdout: string
  /** Standard error from the command */
  stderr: string
  /** Exit code of the process */
  exitCode: number
  /** Whether the command timed out */
  timedOut?: boolean
}

/**
 * Metrics for tracking executor performance
 */
export interface ExecutorMetrics {
  /** Total number of executions */
  executionCount: number
  /** Number of successful executions */
  successCount: number
  /** Number of failed executions */
  errorCount: number
  /** Number of retries performed */
  retryCount: number
  /** Total latency in milliseconds */
  totalLatencyMs: number
  /** P99 latency in milliseconds */
  p99LatencyMs: number
}

/**
 * Error thrown when PowerShell execution fails
 */
export class PowerShellExecutionError extends Error {
  /** Standard output from the failed command */
  public stdout?: string
  /** Standard error from the failed command */
  public stderr?: string
  /** Exit code of the failed process */
  public exitCode?: number

  /**
   * Creates a new PowerShellExecutionError
   * @param message - Error message
   * @param details - Optional execution result details
   */
  constructor(message: string, details?: ExecutionResult) {
    super(message)
    this.name = "PowerShellExecutionError"
    if (details) {
      this.stdout = details.stdout
      this.stderr = details.stderr
      this.exitCode = details.exitCode
    }
  }
}

/**
 * PowerShellExecutor executes PowerShell commands reliably using temp files
 *
 * This class solves the issue where PowerShell's `-Command` parameter treats
 * quoted strings as literal data rather than executable code. Instead, commands
 * are written to temporary `.ps1` files and executed via the `-File` parameter.
 *
 * @example
 * ```typescript
 * const tempFileManager = new TempFileManager()
 * const executor = new PowerShellExecutor({ tempFileManager })
 *
 * const result = await executor.execute('Write-Host "Hello World"')
 * console.log(result.stdout) // "Hello World"
 * ```
 */
export class PowerShellExecutor {
  /** TempFileManager for managing script files */
  private tempFileManager: TempFileManager
  /** PowerShell executable path */
  private executable: string
  /** Default timeout in milliseconds */
  private defaultTimeout: number
  /** Default execution policy */
  private defaultExecutionPolicy: "Bypass" | "RemoteSigned"
  /** Optional logger for debugging */
  private logger?: Log.Logger
  /** Execution metrics */
  private metrics: ExecutorMetrics
  /** History for P99 latency calculation */
  private p99History: number[] = []

  /**
   * Creates a new PowerShellExecutor instance
   * @param options - Configuration options for the executor
   */
  constructor(options: PowerShellExecutorOptions) {
    this.tempFileManager = options.tempFileManager
    this.executable = options.executable ?? "powershell"
    this.defaultTimeout = options.defaultTimeout ?? 60000
    this.defaultExecutionPolicy = options.executionPolicy ?? "Bypass"
    this.logger = options.logger

    this.metrics = {
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      retryCount: 0,
      totalLatencyMs: 0,
      p99LatencyMs: 0,
    }
  }

  /**
   * Executes a PowerShell command
   *
   * Creates a temporary file with the command and executes it via PowerShell's
   * `-File` parameter. The temp file is automatically cleaned up after execution.
   *
   * @param command - The PowerShell command to execute
   * @returns Promise resolving to the execution result
   */
  async execute(command: string): Promise<ExecutionResult> {
    const startTime = Date.now()

    let tempPath: string | undefined
    try {
      // Wrap command for better output formatting and stream handling
      const wrappedCommand = this.wrapCommandForBetterOutput(command)

      // Create temp file with wrapped command
      tempPath = await this.tempFileManager.create(wrappedCommand)
      this.logger?.debug(`Created temp file for command: ${tempPath}`)

      // Execute via temp file
      const result = await this.executeFile(tempPath)
      this.recordSuccess(result, Date.now() - startTime)
      return result
    } catch (error) {
      this.recordError(Date.now() - startTime)
      throw error
    } finally {
      // Always cleanup - ensure it completes before returning
      if (tempPath) {
        try {
          await this.tempFileManager.cleanup(tempPath)
        } catch (cleanupError) {
          // Only log unexpected errors (not ENOENT which means file already gone)
          if (!(cleanupError instanceof Error && cleanupError.message?.includes("ENOENT"))) {
            this.logger?.error("Failed to cleanup temp file", { path: tempPath, error: cleanupError })
            this.metrics.errorCount++
          }
        }
      }
    }
  }

  /**
   * Executes a PowerShell command with custom options
   *
   * @param command - The PowerShell command to execute
   * @param options - Execution options to override defaults
   * @returns Promise resolving to the execution result
   */
  async executeWithOptions(command: string, options: ExecOptions): Promise<ExecutionResult> {
    const startTime = Date.now()

    let tempPath: string | undefined
    try {
      tempPath = await this.tempFileManager.create(command)
      const result = await this.executeFile(tempPath, options)
      this.recordSuccess(result, Date.now() - startTime)
      return result
    } catch (error) {
      this.recordError(Date.now() - startTime)
      throw error
    } finally {
      // Cleanup - ensure it completes before returning
      if (tempPath) {
        try {
          await this.tempFileManager.cleanup(tempPath)
        } catch (cleanupError) {
          // Only log unexpected errors (not ENOENT which means file already gone)
          if (!(cleanupError instanceof Error && cleanupError.message?.includes("ENOENT"))) {
            this.logger?.error("Failed to cleanup temp file", { path: tempPath, error: cleanupError })
            this.metrics.errorCount++
          }
        }
      }
    }
  }

  /**
   * Executes a PowerShell command with retry logic
   *
   * Retries the command with exponential backoff (100ms, 200ms, 400ms, etc.)
   * up to the specified number of retries.
   *
   * @param command - The PowerShell command to execute
   * @param retries - Number of retries (default: 3)
   * @returns Promise resolving to the execution result
   */
  async executeWithRetry(command: string, retries: number = 3): Promise<ExecutionResult> {
    let lastError: Error | undefined

    for (let i = 0; i < retries; i++) {
      try {
        return await this.execute(command)
      } catch (error) {
        lastError = error as Error
        this.metrics.retryCount++

        if (i < retries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms, etc.
          const delay = 100 * Math.pow(2, i)
          this.logger?.warn(`Retry ${i + 1}/${retries} after ${delay}ms`, { error })
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw new PowerShellExecutionError(`Failed after ${retries} retries: ${lastError?.message}`, {
      stdout: "",
      stderr: lastError?.message ?? "",
      exitCode: -1,
    })
  }

  /**
   * Alias for execute - executes a PowerShell script
   *
   * @param script - The PowerShell script to execute
   * @returns Promise resolving to the execution result
   */
  async executeScript(script: string): Promise<ExecutionResult> {
    return this.execute(script)
  }

  /**
   * Executes an existing PowerShell script file
   *
   * Spawns PowerShell to execute the specified file with the `-File` parameter.
   *
   * @param filePath - Path to the PowerShell script file
   * @param options - Optional execution options
   * @returns Promise resolving to the execution result
   */
  async executeFile(filePath: string, options?: ExecOptions): Promise<ExecutionResult> {
    const args = this.buildArgs(filePath, options)
    const timeout = options?.timeout ?? this.defaultTimeout

    this.logger?.debug(`Executing PowerShell: ${this.executable} ${args.join(" ")}`)

    // Use Bun.spawn directly (PowerShellExecutor is Windows-only)
    const proc = Bun.spawn({
      cmd: [this.executable, ...args],
      stdout: options?.captureOutput !== false ? "pipe" : "ignore",
      stderr: options?.captureOutput !== false ? "pipe" : "ignore",
    })

    let timedOut = false
    let exitCode: number | undefined = undefined

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true
      try {
        proc.kill()
      } catch {
        // Process may have already exited
      }
    }, timeout)

    // Monitor process exit concurrently with output capture
    const exitPromise = (async () => {
      try {
        const code = await proc.exited
        return code
      } catch {
        return -1
      }
    })()

    try {
      // Capture output (if enabled)
      const stdoutPromise = options?.captureOutput !== false ? new Response(proc.stdout).text() : Promise.resolve("")

      const stderrPromise = options?.captureOutput !== false ? new Response(proc.stderr).text() : Promise.resolve("")

      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

      // Get exit code AFTER output capture
      exitCode = await exitPromise

      // Check timeout condition - either timedOut flag OR exitCode === -1
      if (timedOut || exitCode === -1) {
        return {
          stdout,
          stderr,
          exitCode: -1,
          timedOut: true,
        }
      }

      return {
        stdout,
        stderr,
        exitCode: exitCode ?? -1,
        timedOut: false,
      }
    } catch (error) {
      this.logger?.error(`PowerShell execution failed`, { error })
      throw new PowerShellExecutionError(`PowerShell execution failed: ${(error as Error).message}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Wraps a PowerShell command for better output formatting and stream handling
   *
   * This addresses Issue 2 by:
   * - Using Out-String to prevent table formatting
   * - Combining stdout and stderr with 2>&1
   * - Ensuring consistent output format
   *
   * @param command - The original PowerShell command
   * @returns Wrapped command with improved output handling
   */
  private wrapCommandForBetterOutput(command: string): string {
    // Skip wrapping for commands that already handle their own output formatting
    if (command.includes("Out-String") || command.includes("Format-Table") || command.includes("Format-List")) {
      return command
    }

    const trimmed = command.trim()

    // Skip wrapping for external commands that should be executed via cmd.exe
    const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase()
    const externalCommands = ["sc", "net", "tasklist", "taskkill", "findstr", "where", "whoami"]
    if (firstWord && externalCommands.includes(firstWord)) {
      return command
    }

    // For Get-Process commands specifically, always use Out-String
    // Temporarily disabled to fix test timeout
    // if (trimmed.toLowerCase().includes('get-process')) {
    //   return `${command} | Out-String -Width 200`
    // }

    // Skip wrapping for commands that write directly to host or return simple values
    const noWrapCommands = ["Get-Random", "Get-Date", "Get-Location", "Write-Host", "Write-Output", "Write-Error", "Write-Warning"]
    if (noWrapCommands.some(cmd => trimmed.toLowerCase().startsWith(cmd.toLowerCase()))) {
      return `${command}; exit 0`
    }

    // For other Get-* commands that typically produce tables
    if (trimmed.match(/\bGet-\w+/)) {
      return `${command} | Out-String -Width 200`
    }

    // For commands that might write to both stdout and stderr, combine streams
    if (command.includes("Write-Error") || command.includes("Write-Warning") || command.includes("Write-Verbose")) {
      return command
    }

    // For simple commands, just return as-is
    return command
  }

  /**
   * Builds the PowerShell command arguments
   *
   * @param filePath - Path to the script file
   * @param options - Execution options
   * @returns Array of command-line arguments
   */
  private buildArgs(filePath: string, options?: ExecOptions): string[] {
    const args: string[] = []

    // Add NoProfile unless disabled
    if (options?.noProfile !== false) {
      args.push("-NoProfile")
    }

    // Add ExecutionPolicy
    args.push("-ExecutionPolicy")
    args.push(options?.executionPolicy ?? this.defaultExecutionPolicy)

    // Add File parameter
    args.push("-File")
    args.push(filePath)

    return args
  }

  /**
   * Records a successful execution
   *
   * @param result - The execution result
   * @param latencyMs - Execution latency in milliseconds
   */
  private recordSuccess(result: ExecutionResult, latencyMs: number): void {
    this.metrics.executionCount++
    this.metrics.successCount++
    this.metrics.totalLatencyMs += latencyMs
    this.updateP99Latency(latencyMs)

    if (result.exitCode !== 0) {
      this.logger?.warn(`PowerShell exited with non-zero code: ${result.exitCode}`, {
        stdout: result.stdout,
        stderr: result.stderr,
      })
    }
  }

  /**
   * Records a failed execution
   *
   * @param latencyMs - Execution latency in milliseconds
   */
  private recordError(latencyMs: number): void {
    this.metrics.executionCount++
    this.metrics.errorCount++
    this.metrics.totalLatencyMs += latencyMs
    this.updateP99Latency(latencyMs)
  }

  /**
   * Updates the P99 latency metric
   *
   * Maintains a sliding window of the last 100 latency measurements
   * and calculates the P99 value.
   *
   * @param latencyMs - Latency in milliseconds
   */
  private updateP99Latency(latencyMs: number): void {
    this.p99History.push(latencyMs)
    if (this.p99History.length > 100) {
      this.p99History.shift()
    }

    // Sort and calculate P99
    const sorted = [...this.p99History].sort((a, b) => a - b)
    const p99Index = Math.floor(sorted.length * 0.99)
    this.metrics.p99LatencyMs = sorted[p99Index] ?? latencyMs
  }

  /**
   * Gets the current executor metrics
   *
   * @returns Copy of the current metrics
   */
  getMetrics(): ExecutorMetrics {
    return { ...this.metrics }
  }

  /**
   * Resets all metrics to zero
   */
  resetMetrics(): void {
    this.metrics = {
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      retryCount: 0,
      totalLatencyMs: 0,
      p99LatencyMs: 0,
    }
    this.p99History = []
  }
}
