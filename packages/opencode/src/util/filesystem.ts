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
    let normalized = path.isAbsolute(p) ? p : path.resolve(p)

    // Normalize path separators for consistency
    normalized = path.normalize(normalized)
    
    // For git commands, always use forward slashes regardless of platform
    // Git internally always uses forward slashes
    if (forGit) {
      normalized = normalized.replace(/\\/g, "/")
    }
    
    return normalized
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

  /**
   * Normalize path for platform-native file operations.
   * Uses backslashes on Windows, forward slashes elsewhere.
   */
  export function normalizeNativePath(p: string): string {
    if (!p) return p

    const normalized = path.normalize(p)

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
  export function getCanonicalPath(p: string): string {
    if (!p) return p

    try {
      // Resolve to absolute path and get real path (resolves symlinks, case, etc.)
      const absolute = path.resolve(p)

      if (process.platform === "win32") {
        // On Windows, use realpath to get canonical casing and resolve symlinks
        return realpathSync.native(absolute)
      } else {
        // On Unix systems, realpath also resolves symlinks
        return realpathSync(absolute)
      }
    } catch {
      // If realpath fails, fall back to absolute normalized path
      return path.resolve(p)
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
    
    // Check length limits (255 is common limit)
    if (filename.length > 255) return false
    
    // Check for reserved names on Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
    const baseName = filename.split(/[\\/]/).pop() || ''
    const baseNameUpper = baseName.toUpperCase()
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
  export async function isBinaryFile(filepath: string): Promise<boolean> {
    try {
      const file = Bun.file(filepath)
      if (!(await file.exists())) return true // Fail safe
      
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      
      // Check first 8000 bytes for binary indicators
      let nullCount = 0
      const sampleSize = Math.min(bytes.length, 8000)
      
      for (let i = 0; i < sampleSize; i++) {
        // Null bytes are strong binary indicators
        if (bytes[i] === 0) {
          nullCount++
          if (nullCount > 2) return true // More than 2 null bytes = binary
        }
        
        // Check for high concentration of non-printable characters
        if (bytes[i] < 32 && bytes[i] !== 9 && bytes[i] !== 10 && bytes[i] !== 13) {
          // Allow tabs, newlines, carriage returns
          return true
        }
      }
      
      return false
    } catch {
      return true // Fail safe - assume binary if we can't read
    }
  }
  
  /**
   * Validate that a filepath is safe and within project boundaries.
   * Prevents directory traversal attacks and validates path format.
   */
  export function validateFilepath(filepath: string, projectRoot: string): { valid: boolean; reason?: string } {
    if (!filepath) {
      return { valid: false, reason: 'Empty filepath' }
    }
    
    // Check for null bytes
    if (filepath.includes('\0')) {
      return { valid: false, reason: 'Null bytes in filepath' }
    }
    
    // Convert to absolute path
    const absolutePath = path.isAbsolute(filepath) ? filepath : path.resolve(projectRoot, filepath)

    // Check if path is within project root (prevent directory traversal)
    if (!contains(absolutePath, projectRoot)) {
      return { valid: false, reason: 'Path outside project directory' }
    }

    // Check for symbolic link loops (simplified check)
    if (filepath.includes('..')) {
      // Normalize and check again
      const normalized = path.normalize(absolutePath)
      if (!contains(normalized, projectRoot)) {
        return { valid: false, reason: 'Symbolic link or path traversal detected' }
      }
    }
    
    return { valid: true }
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
