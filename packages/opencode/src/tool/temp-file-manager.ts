import { writeFile, unlink, stat } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { Log } from '../util/log'

/**
 * Options for configuring the TempFileManager.
 */
export interface TempFileManagerOptions {
  /**
   * Directory where temporary files should be created.
   * Defaults to the system's temporary directory.
   */
  poolDir?: string

  /**
   * Maximum number of active temporary files allowed in the pool.
   * Defaults to 100 files.
   */
  maxPoolSize?: number

  /**
   * Interval in milliseconds for periodic cleanup of expired files.
   * Defaults to 60000ms (1 minute).
   */
  cleanupInterval?: number

  /**
   * Optional logger instance for debug and error output.
   */
  logger?: Log.Logger
}

/**
 * Statistics about the current state of the temporary file pool.
 */
export interface PoolStats {
  /**
   * Number of currently active temporary files.
   */
  activeFileCount: number

  /**
   * Maximum number of files allowed in the pool.
   */
  maxPoolSize: number

  /**
   * Current pool usage as a percentage (0-100).
   */
  poolUsagePercent: number
}

/**
 * Error thrown when the temporary file pool has reached its maximum size.
 */
export class TempFilePoolFullError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TempFilePoolFullError'
  }
}

/**
 * Manages temporary PowerShell script files for Windows command execution.
 * 
 * This class creates temporary `.ps1` files with secure permissions (0o600)
 * and tracks them for cleanup. It helps resolve issues with PowerShell's
 * `-Command` parameter by using `-File` instead.
 * 
 * @example
 * ```typescript
 * const manager = new TempFileManager({ maxPoolSize: 50 })
 * const path = await manager.create('Write-Host "Hello World"')
 * // Execute with: powershell -NoProfile -ExecutionPolicy Bypass -File path
 * await manager.cleanup(path)
 * ```
 */
export class TempFileManager {
  private poolDir: string
  private maxPoolSize: number
  private cleanupInterval: number
  private activeFiles = new Set<string>()
  private cleanupTimer?: ReturnType<typeof setInterval>
  private logger?: Log.Logger

  /**
   * Creates a new TempFileManager instance.
   * @param options - Configuration options for the manager
   */
  constructor(options?: TempFileManagerOptions) {
    this.poolDir = options?.poolDir ?? tmpdir()
    this.maxPoolSize = options?.maxPoolSize ?? 100
    this.cleanupInterval = options?.cleanupInterval ?? 60000
    this.logger = options?.logger

    this.startCleanupTimer()
  }

  /**
   * Creates a new temporary file with the given content.
   * 
   * @param content - The content to write to the temporary file
   * @returns The path to the created temporary file
   * @throws TempFilePoolFullError if the pool size limit is reached
   * @throws Error if file writing fails
   */
  async create(content: string): Promise<string> {
    // Check pool size limit
    if (this.activeFiles.size >= this.maxPoolSize) {
      throw new TempFilePoolFullError(
        `Pool size limit reached (${this.maxPoolSize} files)`
      )
    }

    // Generate unique filename with UUID
    const id = randomUUID()
    const filename = `opencode-ps-${id}.ps1`
    const filepath = join(this.poolDir, filename)

    // Write file with secure permissions (owner read/write only)
    await writeFile(filepath, content, {
      encoding: 'utf8',
      mode: 0o600,
    })

    // Track active file
    this.activeFiles.add(filepath)
    this.logger?.debug(`Created temp file: ${filepath}`)

    return filepath
  }

  /**
   * Cleans up a specific temporary file.
   * 
   * @param path - Path to the file to clean up
   */
  async cleanup(path: string): Promise<void> {
    try {
      await unlink(path)
      this.activeFiles.delete(path)
      this.logger?.debug(`Cleaned up temp file: ${path}`)
    } catch (error) {
      // File may not exist, log and continue gracefully
      this.logger?.warn(`Failed to cleanup temp file: ${path}`, { error })
    }
  }

  /**
   * Cleans up all tracked temporary files.
   */
  async cleanupAll(): Promise<void> {
    const files = Array.from(this.activeFiles)
    await Promise.all(files.map((f) => this.cleanup(f)))
    this.logger?.info(`Cleaned up ${files.length} temp files`)
  }

  /**
   * Cleans up temporary files older than the specified maximum age.
   * 
   * @param maxAge - Maximum age in milliseconds
   * @returns The number of files cleaned up
   */
  async cleanupExpired(maxAge: number): Promise<number> {
    const now = Date.now()
    let cleaned = 0

    for (const filepath of this.activeFiles) {
      try {
        const stats = await stat(filepath)
        const age = now - stats.mtimeMs

        if (age > maxAge) {
          await this.cleanup(filepath)
          cleaned++
        }
      } catch {
        // File doesn't exist, remove from tracking
        this.activeFiles.delete(filepath)
      }
    }

    return cleaned
  }

  /**
   * Gets the number of currently active temporary files.
   * 
   * @returns The count of active files
   */
  getActiveFileCount(): number {
    return this.activeFiles.size
  }

  /**
   * Gets current pool statistics.
   * 
   * @returns Pool statistics including usage percentage
   */
  getPoolStats(): PoolStats {
    return {
      activeFileCount: this.activeFiles.size,
      maxPoolSize: this.maxPoolSize,
      poolUsagePercent: (this.activeFiles.size / this.maxPoolSize) * 100,
    }
  }

  /**
   * Starts the periodic cleanup timer for expired files.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired(3600000) // 1 hour
        .then((count) => {
          if (count > 0) {
            this.logger?.info(`Expired cleanup: ${count} files removed`)
          }
        })
        .catch((error) => {
          this.logger?.error('Expired cleanup failed', { error })
        })
    }, this.cleanupInterval)
  }

  /**
   * Disposes of the TempFileManager, clearing the cleanup timer.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }
}
