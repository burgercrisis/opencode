/**
 * Cross-platform and runtime detection utilities
 * Works across: Mac, Linux, Windows; Bun, Node.js; PowerShell, Git Bash, CMD, Zsh, Bash
 */

export type Platform = "darwin" | "linux" | "win32"
export type Runtime = "bun" | "node"
export type Shell = "powershell" | "cmd" | "git-bash" | "wsl" | "zsh" | "bash" | "sh"

export interface PlatformInfo {
  platform: Platform
  arch: string
  isWsl: boolean
  isGitHubCodespaces: boolean
  isVSCode: boolean
  isCI: boolean
}

export interface ShellInfo {
  type: Shell
  executable: string
  flags: string[]
  isPosix: boolean
  supportsLogin: boolean
}

export interface RuntimeInfo {
  type: Runtime
  version: string
  isBun: boolean
  isNode: boolean
}

/**
 * Detect current platform
 */
export function getPlatform(): Platform {
  return process.platform as Platform
}

/**
 * Detect current runtime (Bun or Node.js)
 */
export function getRuntime(): RuntimeInfo {
  if (typeof Bun !== "undefined" && (Bun as unknown as { version?: string }).version) {
    return {
      type: "bun",
      version: (Bun as unknown as { version?: string }).version || "unknown",
      isBun: true,
      isNode: false,
    }
  }
  return {
    type: "node",
    version: process.version,
    isBun: false,
    isNode: true,
  }
}

/**
 * Detect current shell type
 */
export function getShell(): ShellInfo {
  const platform = getPlatform()
  const shellEnv = process.env.SHELL || ""
  
  if (platform === "win32") {
    // Windows shell detection
    const comSpec = process.env.ComSpec || ""
    const wslDistro = process.env.WSL_DISTRO_NAME
    
    if (wslDistro) {
      return {
        type: "wsl",
        executable: "bash",
        flags: ["-c"],
        isPosix: true,
        supportsLogin: true,
      }
    }
    
    if (shellEnv.includes("powershell") || shellEnv.includes("pwsh")) {
      return {
        type: "powershell",
        executable: "powershell.exe",
        flags: ["-NoLogo", "-Command"],
        isPosix: false,
        supportsLogin: true,
      }
    }
    
    if (comSpec.includes("cmd.exe")) {
      return {
        type: "cmd",
        executable: "cmd.exe",
        flags: ["/c"],
        isPosix: false,
        supportsLogin: false,
      }
    }
    
    // Default to Git Bash if available
    if (shellEnv.includes("bash") || process.env.GIT_BASH) {
      return {
        type: "git-bash",
        executable: "bash",
        flags: ["-c"],
        isPosix: true,
        supportsLogin: true,
      }
    }
    
    // Fallback
    return {
      type: "cmd",
      executable: "cmd.exe",
      flags: ["/c"],
      isPosix: false,
      supportsLogin: false,
    }
  }
  
  // Unix/Linux/macOS
  if (shellEnv.includes("zsh")) {
    return {
      type: "zsh",
      executable: "zsh",
      flags: ["-c"],
      isPosix: true,
      supportsLogin: true,
    }
  }
  
  if (shellEnv.includes("bash")) {
    return {
      type: "bash",
      executable: "bash",
      flags: ["-c"],
      isPosix: true,
      supportsLogin: true,
    }
  }
  
  // Default
  return {
    type: "sh",
    executable: "sh",
    flags: ["-c"],
    isPosix: true,
    supportsLogin: true,
  }
}

/**
 * Get full platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform: getPlatform(),
    arch: process.arch,
    isWsl: !!process.env.WSL_DISTRO_NAME,
    isGitHubCodespaces: !!process.env.GITHUB_CODESPACES,
    isVSCode: !!process.env.VSCODE_INJECTION || !!process.env.TERM_PROGRAM?.includes("vscode"),
    isCI: !!process.env.CI || !!process.env.GITHUB_ACTIONS,
  }
}

/**
 * Check if running in Bun runtime
 */
export function isBunRuntime(): boolean {
  return typeof Bun !== "undefined" && (Bun as unknown as { version?: string }).version !== undefined
}

/**
 * Check if running in Node.js runtime
 */
export function isNodeRuntime(): boolean {
  return !isBunRuntime()
}

/**
 * Universal sleep function (works in both Bun and Node.js)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Cross-platform file operations with Bun/Node compatibility
 */
export async function readFile(filepath: string): Promise<string> {
  if (isBunRuntime()) {
    const file = Bun.file(filepath)
    return await file.text()
  }
  const fs = await import("fs/promises")
  return await fs.readFile(filepath, "utf-8")
}

/**
 * Cross-platform file write with Bun/Node compatibility
 */
export async function writeFile(filepath: string, content: string): Promise<void> {
  if (isBunRuntime()) {
    await Bun.write(filepath, content)
  } else {
    const fs = await import("fs/promises")
    await fs.writeFile(filepath, content, "utf-8")
  }
}

/**
 * Cross-platform JSON file read
 */
export async function readJson<T>(filepath: string): Promise<T> {
  const content = await readFile(filepath)
  return JSON.parse(content) as T
}

/**
 * Cross-platform JSON file write
 */
export async function writeJson<T>(filepath: string, data: T): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await writeFile(filepath, content)
}
