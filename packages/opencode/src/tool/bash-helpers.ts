/**
 * Cross-platform path resolution helper for bash.ts
 * Provides compatibility between Bun and Node.js runtimes
 */

/** Detect if running under Bun runtime for cross-platform compatibility */
export const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

/**
 * Cross-platform path resolution with graceful fallback
 * Uses realpath if available, falls back to path.resolve
 */
export async function resolvePath(arg: string, cwd: string): Promise<string | undefined> {
  if (!arg) return undefined

  // Try realpath first (resolves symlinks and absolute paths)
  try {
    if (isBunRuntime) {
      const result = await Bun.$`realpath ${arg}`.cwd(cwd).quiet().nothrow().text()
      const trimmed = (result || "").trim()
      if (trimmed) return trimmed
    } else {
      const { execSync } = require("child_process")
      const result = execSync(`realpath ${arg}`, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      const trimmed = (result || "").trim()
      if (trimmed) return trimmed
    }
  } catch {
    // ignore error and fallback
  }

  // Fallback: use path.resolve (doesn't resolve symlinks but always works)
  try {
    const { resolve } = require("path")
    return resolve(cwd, arg)
  } catch {
    return undefined
  }
}
