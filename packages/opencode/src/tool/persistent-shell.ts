import { spawn, type ChildProcess } from "child_process"
import { Log } from "../util/log"
import { buildGitEnv } from "./git-env"

const log = Log.create({ service: "persistent-shell" })

/**
 * Represents a persistent shell session with connection pooling and lifecycle management.
 * Targets <100ms per command execution by reusing shell sessions.
 */
export class PersistentShell {
  private static instances = new Map<string, PersistentShell>()
  private sessions = new Map<string, ShellSession>()
  private maxSessions = 5
  private sessionTimeout = 30000 // 30 seconds idle timeout

  /**
   * Get or create a PersistentShell instance for a specific working directory
   */
  static getInstance(cwd: string): PersistentShell {
    if (!this.instances.has(cwd)) {
      this.instances.set(cwd, new PersistentShell(cwd))
    }
    return this.instances.get(cwd)!
  }

  /**
   * Clean up all persistent shell instances
   */
  static disposeAll(): void {
    for (const instance of Array.from(this.instances.values())) {
      instance.dispose()
    }
    this.instances.clear()
  }

  constructor(private cwd: string) {
    // Register cleanup on process exit
    if (typeof process !== "undefined") {
      process.once("beforeExit", () => this.dispose())
      process.once("exit", () => this.dispose())
    }
  }

  /**
   * Execute a command using a persistent shell session
   */
  async execute(
    command: string,
    options: {
      shell?: "powershell" | "pwsh" | "cmd" | "bash"
      timeout?: number
      env?: Record<string, string>
    } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { shell = this.detectShell(command), timeout = 30000 } = options

    try {
      // Get or create session
      const session = await this.getSession(shell)
      return await session.execute(command, { timeout })
    } catch (error) {
      log.warn("Command execution failed, falling back to non-persistent", { error, command })

      // Fallback to non-persistent execution
      return this.executeNonPersistent(command, { shell, timeout, env: options.env })
    }
  }

  /**
   * Dispose of this persistent shell instance
   */
  dispose(): void {
    for (const session of Array.from(this.sessions.values())) {
      session.dispose()
    }
    this.sessions.clear()
  }

  private detectShell(command: string): "powershell" | "pwsh" | "cmd" | "bash" {
    const trimmed = command.trim().toLowerCase()

    if (trimmed.startsWith("powershell") || trimmed.startsWith("pwsh")) {
      return "powershell"
    }

    if (trimmed.startsWith("cmd")) {
      return "cmd"
    }

    // Default to cmd on Windows, bash on Unix
    return process.platform === "win32" ? "cmd" : "bash"
  }

  private async getSession(shell: "powershell" | "pwsh" | "cmd" | "bash"): Promise<ShellSession> {
    const sessionKey = shell

    // Check if we have an available session
    let session = this.sessions.get(sessionKey)
    if (session && session.isHealthy()) {
      session.lastUsed = Date.now()
      return session
    }

    // Clean up unhealthy sessions
    if (session) {
      session.dispose()
      this.sessions.delete(sessionKey)
    }

    // Check session pool limits
    if (this.sessions.size >= this.maxSessions) {
      await this.evictOldestSession()
    }

    // Create new session
    session = new ShellSession(shell, this.cwd)
    await session.initialize()
    this.sessions.set(sessionKey, session)

    return session
  }

  private async evictOldestSession(): Promise<void> {
    let oldestSession: ShellSession | null = null
    let oldestTime = Date.now()

    for (const session of Array.from(this.sessions.values())) {
      if (session.lastUsed < oldestTime) {
        oldestTime = session.lastUsed
        oldestSession = session
      }
    }

    if (oldestSession) {
      oldestSession.dispose()
      // Remove from map by finding the key
      for (const [key, session] of Array.from(this.sessions.entries())) {
        if (session === oldestSession) {
          this.sessions.delete(key)
          break
        }
      }
    }
  }

  private async executeNonPersistent(
    command: string,
    options: { shell: "powershell" | "pwsh" | "cmd" | "bash"; timeout: number; env?: Record<string, string> },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { shell, timeout, env } = options

    return new Promise((resolve, reject) => {
      const shellCmd = this.getShellCommand(shell)
      const proc = spawn(shellCmd[0], [...shellCmd.slice(1), this.getShellFlag(shell), command], {
        cwd: this.cwd,
        env: { ...buildGitEnv(), ...env },
        stdio: ["ignore", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill("SIGTERM")
      }, timeout)

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString()
      })

      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      proc.on("close", (code) => {
        clearTimeout(timer)
        resolve({
          stdout,
          stderr,
          exitCode: code ?? (timedOut ? 143 : 1), // 143 = 128 + 15 (SIGTERM)
        })
      })

      proc.on("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  private getShellCommand(shell: "powershell" | "pwsh" | "cmd" | "bash"): string[] {
    switch (shell) {
      case "powershell":
        return ["powershell.exe", "-NoProfile"]
      case "pwsh":
        return ["pwsh", "-NoProfile"]
      case "cmd":
        return ["cmd.exe"]
      case "bash":
        return ["bash"]
      default:
        return process.platform === "win32" ? ["cmd.exe"] : ["bash"]
    }
  }

  private getShellFlag(shell: "powershell" | "pwsh" | "cmd" | "bash"): string {
    switch (shell) {
      case "powershell":
      case "pwsh":
        return "-Command"
      case "cmd":
        return "/c"
      case "bash":
        return "-c"
      default:
        return process.platform === "win32" ? "/c" : "-c"
    }
  }
}

/**
 * Represents a single persistent shell session
 */
class ShellSession {
  public lastUsed = Date.now()
  private process: ChildProcess | null = null
  private initialized = false
  private commandQueue: Array<{
    command: string
    options: { timeout: number }
    resolve: (result: { stdout: string; stderr: string; exitCode: number }) => void
    reject: (error: Error) => void
  }> = []
  private processing = false

  constructor(
    private shell: "powershell" | "pwsh" | "cmd" | "bash",
    private cwd: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return

    const shellCmd = this.getShellCommand()
    this.process = spawn(shellCmd[0], shellCmd.slice(1), {
      cwd: this.cwd,
      env: buildGitEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    })

    // Set up session initialization - use a shorter timeout for init
    const initResult = await this.sendCommand(this.getInitCommand(), 2000)
    if (initResult.exitCode !== 0) {
      throw new Error(`Shell session initialization failed with exit code ${initResult.exitCode}`)
    }

    this.initialized = true
    log.debug("Shell session initialized", { shell: this.shell, cwd: this.cwd })
  }

  async execute(
    command: string,
    options: { timeout: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, options, resolve, reject })
      this.processQueue()
    })
  }

  isHealthy(): boolean {
    if (!this.initialized || !this.process) return false

    // Check if process is still running
    if (this.process.killed || this.process.exitCode !== null) return false

    // Check idle timeout
    const idleTime = Date.now() - this.lastUsed
    if (idleTime > 30000) return false // 30 second timeout

    return true
  }

  dispose(): void {
    if (this.process && !this.process.killed) {
      try {
        this.process.kill("SIGTERM")
      } catch (error) {
        log.warn("Error killing shell process", { error })
      }
    }
    this.process = null
    this.initialized = false

    // Reject any pending commands
    for (const item of this.commandQueue) {
      item.reject(new Error("Shell session disposed"))
    }
    this.commandQueue = []
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.commandQueue.length === 0) return

    this.processing = true

    while (this.commandQueue.length > 0) {
      const item = this.commandQueue.shift()!
      try {
        const result = await this.sendCommand(item.command, item.options.timeout)
        item.resolve(result)
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    this.processing = false
  }

  private async sendCommand(
    command: string,
    timeout = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.process) {
      throw new Error("Shell session not initialized")
    }

    return new Promise((resolve, reject) => {
      let stdout = ""
      let stderr = ""
      let exitCode = 0
      let timedOut = false

      const token = `__OPENCODE_DONE_${Math.random().toString(36).slice(2)}__`
      const delimiterCmd = this.getDelimiterCommand(token)

      const timer = setTimeout(() => {
        timedOut = true
        this.process!.kill("SIGTERM")
      }, timeout)

      const onStdout = (chunk: Buffer) => {
        const str = chunk.toString()
        stdout += str

        if (stdout.includes(token)) {
          const lines = stdout.split("\n")
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(token)) {
              const match = lines[i].match(new RegExp(`${token}\\s+(-?\\d+)`))
              if (match) {
                exitCode = parseInt(match[1], 10)
                // Keep everything before the delimiter line
                stdout = lines.slice(0, i).join("\n")
                if (stdout && !stdout.endsWith("\n")) stdout += "\n"
                cleanup()
                resolve({ stdout, stderr, exitCode })
                return
              }
            }
          }
        }
      }

      const onStderr = (chunk: Buffer) => {
        stderr += chunk.toString()
      }

      const onClose = (code: number | null) => {
        exitCode = code ?? (timedOut ? 143 : 1)
        cleanup()
        resolve({ stdout, stderr, exitCode })
      }

      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }

      const cleanup = () => {
        clearTimeout(timer)
        if (this.process) {
          this.process.stdout?.removeListener("data", onStdout)
          this.process.stderr?.removeListener("data", onStderr)
          this.process.removeListener("close", onClose)
          this.process.removeListener("error", onError)
        }
      }

      this.process!.stdout!.on("data", onStdout)
      this.process!.stderr!.on("data", onStderr)
      this.process!.once("close", onClose)
      this.process!.once("error", onError)

      // Send command followed by delimiter
      this.process!.stdin!.write(`${command}\n${delimiterCmd}\n`)
    })
  }

  private getDelimiterCommand(token: string): string {
    switch (this.shell) {
      case "powershell":
      case "pwsh":
        return `echo "${token} $LastExitCode"`
      case "cmd":
        return `echo ${token} %errorlevel%`
      case "bash":
        return `echo "${token} $?"`
      default:
        return `echo "${token} $?"`
    }
  }

  private getShellCommand(): string[] {
    switch (this.shell) {
      case "powershell":
        return ["powershell.exe", "-NoProfile", "-NoExit", "-Command", "-"]
      case "pwsh":
        return ["pwsh", "-NoProfile", "-NoExit", "-Command", "-"]
      case "cmd":
        return ["cmd.exe", "/q", "/k"]
      case "bash":
        return ["bash", "--norc", "--noprofile"]
      default:
        return process.platform === "win32" ? ["cmd.exe", "/q", "/k"] : ["bash", "--norc", "--noprofile"]
    }
  }

  private getInitCommand(): string {
    switch (this.shell) {
      case "powershell":
      case "pwsh":
        return "$host.ui.RawUI.WindowTitle = 'OpenCode Persistent Shell'"
      case "cmd":
        return "title OpenCode Persistent Shell"
      case "bash":
        return "echo 'OpenCode Persistent Shell Initialized'"
      default:
        return "echo 'OpenCode Persistent Shell Initialized'"
    }
  }
}

// Register global cleanup
if (typeof process !== "undefined") {
  const cleanup = () => PersistentShell.disposeAll()
  process.on("beforeExit", cleanup)
  process.on("exit", cleanup)
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)
}
