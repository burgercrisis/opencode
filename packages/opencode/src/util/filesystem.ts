import { realpathSync } from "fs"
import path, { 
  dirname as pathDirname, 
  join as pathJoin, 
  relative as pathRelative, 
  isAbsolute as pathIsAbsolute, 
  resolve as pathResolve, 
  normalize as pathNormalize 
} from "path"
import { Flag } from "@/flag/flag"

import { normalize as _normalize } from "@opencode-ai/util/path"

export namespace Filesystem {
  export const normalize = _normalize
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
    const normalized = normalize(p)
    if (process.platform !== "win32") return normalized
    if (Flag.OPENCODE_EXPERIMENTAL_MSYS_PATHS) {
      return normalized
    }
    return normalized.replace(/\//g, "\\")
  }

  export function relativePath(from: string, to: string) {
    return nativePath(path.relative(nativePath(from), nativePath(to)))
  }

  export function resolvePath(...segments: string[]) {
    return nativePath(path.resolve(...segments))
  }

  export function join(...segments: string[]) {
    // Filter out undefined segments before joining
    const validSegments = segments.filter(segment => segment !== undefined && segment !== null)
    if (validSegments.length === 0) return ""
    return nativePath(path.join(...validSegments))
  }

  export function dirname(p: string) {
    return nativePath(path.dirname(p))
  }

  /**
   * Cross-platform path normalization for git operations.
   * Ensures consistent path handling across Windows, Linux, and Mac.
   * 
   * @param path - The path to normalize
   * @param forGit - If true, converts to forward slashes for git compatibility
   * @returns Normalized path suitable for the target platform and use case
   */
  export function normalizeGitPath(p: string, forGit: boolean = true): string {
    if (!p) return p
    
    // Resolve to absolute path to eliminate relative components
    const absolute = pathIsAbsolute(p) ? p : pathResolve(p)
    
    // Normalize path separators for consistency
    const normalized = pathNormalize(absolute)
    
    // For git commands, always use forward slashes regardless of platform
    // Git internally always uses forward slashes
    if (forGit) {
      return normalized.replace(/\\/g, "/")
    }
    
    return normalized
  }
  
  /**
   * Normalize path for platform-native file operations.
   * Uses backslashes on Windows, forward slashes elsewhere.
   */
  export function normalizeNativePath(path: string): string {
    if (!path) return path
    
    const normalized = pathNormalize(path)
    
    // Convert to platform-native separators
    if (process.platform === "win32") {
      return normalized.replace(/\//g, "\\")
    }
    
    return normalized
  }
  
  /**
   * Get canonical project directory path for consistent project ID generation.
   * Handles different path representations (relative, absolute, network paths).
   */
  export function getCanonicalPath(path: string): string {
    if (!path) return path
    
    try {
      // Resolve to absolute path and get real path (resolves symlinks, case, etc.)
      const absolute = pathResolve(path)
      
      if (process.platform === "win32") {
        // On Windows, use realpath to get canonical casing and resolve symlinks.
        // realpathSync.native returns \\?\ prefix for long paths, which we strip
        // for consistent project ID generation and git compatibility.
        const result = realpathSync.native(absolute)
        return result.startsWith("\\\\?\\") ? result.slice(4) : result
      }
      // On Unix systems, realpath also resolves symlinks
      return realpathSync(absolute)
    } catch {
      // If realpath fails, fall back to absolute normalized path
      return pathResolve(path)
    }
  }
  
  /**
   * Validate filename for Unicode and special character safety.
   * Returns true if filename is safe across all platforms.
   */
  export function isValidFilename(filename: string): boolean {
    if (!filename || typeof filename !== 'string') return false
    
    // Check for null bytes and control characters
    if (filename.includes('\0')) return false
    if (/[\x00-\x1f\x7f]/.test(filename)) return false // Control characters
    
    // Check for path separators (filename should not be a path)
    if (/[\\/]/.test(filename)) return false

    // Check length limits (255 is common limit)
    if (filename.length > 255) return false
    
    // Check for reserved names on Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
    const baseName = filename.split(/[\\/]/).pop() || ''
    const baseNameWithoutExt = baseName.split('.')[0]
    const baseNameUpper = baseNameWithoutExt.toUpperCase()
    if (reservedNames.includes(baseNameUpper)) return false
    
    // Check for trailing spaces or periods on Windows (not allowed)
    if (process.platform === "win32") {
      if (baseName.endsWith(' ') || baseName.endsWith('.')) return false
    }
    
    // Test UTF-8 encoding/decoding roundtrip
    try {
      const encoded = Buffer.from(filename, 'utf-8').toString('utf-8')
      if (encoded !== filename) return false
    } catch {
      return false
    }
    
    return true
  }
  
  /**
   * Check if a file is likely binary based on its content.
   * Returns true if file appears to be binary data.
   */
  export async function isBinaryFile(p: string): Promise<boolean> {
    const file = Bun.file(p)
    if (!(await file.exists())) return true // Fail safe
    
    const bytes = new Uint8Array(await file.arrayBuffer())
    
    // Check first 8000 bytes for binary indicators
    const sample = Math.min(bytes.length, 8000)
    
    const check = (i: number, nulls: number): boolean => {
      if (i >= sample) return false
      if (bytes[i] === 0) {
        if (nulls + 1 > 2) return true
        return check(i + 1, nulls + 1)
      }
      if (bytes[i] < 32 && bytes[i] !== 9 && bytes[i] !== 10 && bytes[i] !== 13) return true
      return check(i + 1, nulls)
    }
    
    return check(0, 0)
  }
  
  /**
   * Validate that a filepath is safe and within project boundaries.
   * Prevents directory traversal attacks and validates path format.
   */
  export function validateFilepath(p: string, root: string): { valid: boolean; reason?: string } {
    if (!p) return { valid: false, reason: 'Empty filepath' }
    if (p.includes('\0')) return { valid: false, reason: 'Null bytes in filepath' }
    
    const abs = pathIsAbsolute(p) ? p : pathResolve(root, p)
    if (!contains(root, abs)) return { valid: false, reason: 'Path outside project directory' }
    
    if (p.includes('..') && !contains(root, pathNormalize(abs))) {
      return { valid: false, reason: 'Symbolic link or path traversal detected' }
    }
    
    return { valid: true }
  }

  export function overlaps(a: string, b: string) {
    const relA = relativePath(a, b)
    const relB = relativePath(b, a)
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..")
  }

  export function contains(parent: string, child: string) {
    const parentPath = getCanonicalPath(parent)
    const childPath = getCanonicalPath(child)
    const rel = path.relative(parentPath, childPath)
    return !rel.startsWith("..") && !path.isAbsolute(rel)
  }

  export async function findUp(target: string, start: string, stop?: string): Promise<string[]> {
    const find = async (curr: string, acc: string[]): Promise<string[]> => {
      const search = join(curr, target)
      const existsResult = await exists(search)
      const nextAcc = existsResult ? [...acc, search] : acc
      const stopAt = stop || process.env.OPENCODE_TEST_HOME
      if (stopAt && nativePath(stopAt) === nativePath(curr)) return nextAcc
      const next = dirname(curr)
      if (nativePath(next) === nativePath(curr)) return nextAcc
      return find(next, nextAcc)
    }
    return find(start, [])
  }

  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    const { targets, start, stop } = options
    const iterate = async function* (curr: string): AsyncGenerator<string> {
      const matches = await Promise.all(
        targets.map(async (target) => {
          const search = join(curr, target)
          return (await exists(search)) ? search : undefined
        }),
      )

      yield* matches.filter((x): x is string => !!x)

      const stopAt = stop || process.env.OPENCODE_TEST_HOME
      if (stopAt && nativePath(stopAt) === nativePath(curr)) return
      const next = dirname(curr)
      if (nativePath(next) === nativePath(curr)) return
      yield* iterate(next)
    }
    yield* iterate(start)
  }

  export async function globUp(pattern: string, start: string, stop?: string): Promise<string[]> {
    const glob = new Bun.Glob(pattern)
    const scan = async (curr: string, acc: string[]): Promise<string[]> => {
      const matches = await Array.fromAsync(
        glob.scan({
          cwd: curr,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        }),
      )
      const nextAcc = [...acc, ...matches]
      if (stop && normalize(stop) === normalize(curr)) return nextAcc
      const next = dirname(curr)
      if (normalize(next) === normalize(curr)) return nextAcc
      return scan(next, nextAcc)
    }
    return scan(start, [])
  }
}
