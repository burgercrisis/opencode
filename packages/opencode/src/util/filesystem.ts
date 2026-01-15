import { realpathSync } from "fs"
import { Flag } from "@/flag/flag"
import path from "path"

export namespace Filesystem {
  export const exists = (p: string) =>
    Bun.file(p)
      .stat()
      .then(() => true)
      .catch(() => false)

  export const isDir = (p: string) =>
    Bun.file(p)
      .stat()
      .then((s) => s.isDirectory())
      .catch(() => false)
  /**
   * On Windows, normalize a path to its canonical casing using the filesystem.
   * This is needed because Windows paths are case-insensitive but LSP servers
   * may return paths with different casing than what we send them.
   */
  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    try {
      return nativePath(realpathSync.native(p))
    } catch {
      return p
    }
  }

  /**
   * On Windows, convert a path to its shell-native format.
   * This is needed to match worktree path (`git rev-parse --show-toplevel`)
   * and escaping issues in MSYS based shells (e.g. git bash).
   */
  export function nativePath(p: string): string {
    if (process.platform !== "win32") return p
    if (Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS) {
      // Convert MSYS format /c/foo to C:/foo and normalize all separators to forward slashes
      return p.replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`).replace(/\\+/g, "/")
    }
    // Convert to backslashes for native Windows
    // First handle MSYS format /c/foo -> C:\foo, then convert all forward slashes
    return p.replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:\\`).replace(/\//g, "\\")
  }

  export function relativePath(from: string, to: string) {
    return nativePath(path.relative(nativePath(from), nativePath(to)))
  }

  export function resolvePath(...segments: string[]) {
    return nativePath(path.resolve(...segments))
  }

  export function join(...segments: string[]) {
    return nativePath(path.join(...segments))
  }

  export function dirname(p: string) {
    return nativePath(path.dirname(p))
  }

  export function overlaps(a: string, b: string) {
    const relA = relativePath(a, b)
    const relB = relativePath(b, a)
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..")
  }

  export function contains(parent: string, child: string) {
    const path = relativePath(parent, child)
    return !/^\.\.|.:/.test(path)
  }

  export async function findUp(target: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      const search = join(current, target)
      if (await exists(search)) result.push(search)
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }

  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    const { targets, start, stop } = options
    let current = start
    while (true) {
      for (const target of targets) {
        const search = join(current, target)
        if (await exists(search)) yield search
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }

  export async function globUp(pattern: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      try {
        const glob = new Bun.Glob(pattern)
        for await (const match of glob.scan({
          cwd: current,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        })) {
          result.push(match)
        }
      } catch {
        // Skip invalid glob patterns
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }
}
