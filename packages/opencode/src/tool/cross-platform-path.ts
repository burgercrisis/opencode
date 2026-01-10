import path from "path"
import os from "os"
import { Log } from "../util/log"

const log = Log.create({ service: "cross-platform-path" })

/**
 * Path handler interface for cross-platform path management
 */
export interface PathHandler {
  /** Convert path to platform-specific format */
  toPlatform(inputPath: string): string
  /** Expand user home directory (~) */
  expandUser(inputPath: string): string
  /** Normalize path for current platform */
  normalize(inputPath: string): string
}

/**
 * Factory for creating platform-appropriate path handlers
 */
export class PathHandlerFactory {
  static create(): PathHandler {
    return process.platform === "win32" ? new WindowsPathHandler() : new UnixPathHandler()
  }
}

/**
 * Windows path handler implementation
 */
class WindowsPathHandler implements PathHandler {
  toPlatform(inputPath: string): string {
    // Convert Unix-style paths to Windows
    let result = inputPath

    // Handle /c/ style paths (Git Bash, WSL)
    result = result.replace(/^\/([a-z])\//i, (_, drive) => `${drive.toUpperCase()}:\\`)

    // Handle /tmp -> %TEMP%
    if (result.startsWith("/tmp")) {
      const tempDir = process.env.TEMP || process.env.TMP || "C:\\Windows\\Temp"
      result = result.replace(/^\/tmp/, tempDir.replace(/\\/g, "/"))
    }

    // Convert forward slashes to backslashes for Windows paths
    // But preserve forward slashes in URLs or special cases
    if (!result.includes("://") && !result.startsWith("\\\\")) {
      result = result.replace(/\//g, "\\")
    }

    return result
  }

  expandUser(inputPath: string): string {
    let result = inputPath

    // Expand ~ to %USERPROFILE%
    if (result.startsWith("~")) {
      const homeDir = process.env.USERPROFILE || os.homedir()
      result = result.replace(/^~/, homeDir.replace(/\\/g, "/"))
    }

    // Expand ~/ in paths
    const homeDir = process.env.USERPROFILE || os.homedir()
    result = result.replace(/(^|\s)~\//g, `$1${homeDir.replace(/\\/g, "/")}/`)

    return result
  }

  normalize(inputPath: string): string {
    // First expand user directory
    let result = this.expandUser(inputPath)

    // Then convert to platform format
    result = this.toPlatform(result)

    // Use Node.js path.normalize for final normalization
    return path.normalize(result)
  }
}

/**
 * Unix path handler implementation
 */
class UnixPathHandler implements PathHandler {
  toPlatform(inputPath: string): string {
    // Unix paths are already in the correct format
    // Just normalize any Windows-style paths that might have snuck in
    let result = inputPath

    // Convert Windows drive letters back to Unix style if needed
    result = result.replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`)

    // Convert backslashes to forward slashes
    result = result.replace(/\\/g, "/")

    return result
  }

  expandUser(inputPath: string): string {
    let result = inputPath

    // Expand ~ to $HOME
    if (result.startsWith("~")) {
      const homeDir = process.env.HOME || os.homedir()
      result = result.replace(/^~/, homeDir)
    }

    // Expand ~/ in paths
    const homeDir = process.env.HOME || os.homedir()
    result = result.replace(/(^|\s)~\//g, `$1${homeDir}/`)

    return result
  }

  normalize(inputPath: string): string {
    // First expand user directory
    let result = this.expandUser(inputPath)

    // Then convert to platform format
    result = this.toPlatform(result)

    // Use Node.js path.normalize for final normalization
    return path.normalize(result)
  }
}
