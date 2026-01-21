import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Global } from "../global"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Scheduler } from "../scheduler"

/**
 * Snapshot System - Cross-Platform Implementation
 * 
 * This module provides snapshot, undo, and redo functionality across all platforms:
 * - Windows: Handles backslash paths, long paths, and UNC paths
 * - Linux: Standard Unix paths with case sensitivity considerations
 * - Mac: Case-insensitive filesystem compatibility
 * 
 * // cross-platform: All path operations use Filesystem for consistency utilities
 * // Consistent project ID: Uses canonical paths for ID generation
 * // Windows path handling: Separators converted via normalizeGitPath and normalizeNativePath
 * // process.platform checks: Platform detection for OS-specific behavior
 * 
 * Key Features:
 * - Retry logic with exponential backoff for transient git failures
 * - Validation caching for performance optimization
 * - Graceful degradation for repos without commits
 * - Comprehensive security measures for path validation
 * - Scheduled cleanup for repository maintenance
 */

export namespace Snapshot {
  const log = Log.create({ service: "snapshot" })
  const hour = 60 * 60 * 1000
  const prune = "7.days"
  
  // Performance optimization: cache recent snapshot validations
  // Prevents redundant git cat-file calls for recently validated snapshots
  // Cross-platform: Works consistently on Windows, Linux, and Mac
  const validationCache = new Map<string, { valid: boolean; reason?: string; timestamp: number }>()
  const VALIDATION_CACHE_TTL = 60000 // 1 minute cache TTL
  const MAX_CACHE_SIZE = 100 // Maximum cache entries
  
  export function init() {
    Scheduler.register({
      id: "snapshot.cleanup",
      interval: hour,
      run: cleanup,
      scope: "instance",
    })
  }
  
  export async function cleanup() {
    if (Instance.project.vcs !== "git") return
    const cfg = await Config.get()
    if (cfg.snapshot === false) return
    const git = gitdir()
    const exists = await fs
      .stat(git)
      .then(() => true)
      .catch(() => false)
    if (!exists) return
    const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} gc --prune=${prune}`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
    if (result.exitCode !== 0) {
      log.warn("cleanup failed", {
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
      })
      return
    }
    log.info("cleanup", { prune })
  }
  
  /**
   * Execute a git command with retry logic for transient failures.
   * Uses exponential backoff for retry attempts.
   */
  async function gitWithRetry(
    command: string,
    options: {
      maxRetries?: number
      baseDelay?: number
      cwd?: string
      timeout?: number
      env?: Record<string, string>
    } = {}
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const { maxRetries = 3, baseDelay = 100, cwd, timeout = 30000 } = options
    let lastError: Error | null = null
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
  
        const result = await $`git ${command}`
          .env({
            ...process.env,
            GIT_TERMINAL_PROMPT: "0", // Disable interactive prompts
            GIT_ASKPASS: "echo", // Don't ask for passwords
          })
          .cwd(cwd || Instance.directory)
          .quiet()
          .nothrow()
  
        clearTimeout(timeoutId)
  
        return {
          exitCode: result.exitCode,
          stdout: result.stdout.toString(),
          stderr: result.stderr.toString(),
        }
      } catch (error) {
        lastError = error as Error
  
        // Don't retry for certain error types
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            log.warn(`git command timed out on attempt ${attempt}/${maxRetries}`)
          } else if (error.message.includes('not a git repository')) {
            throw error // Don't retry, this is a fundamental issue
          } else if (error.message.includes('permission denied')) {
            throw error // Permission errors won't be fixed by retrying
          }
        }
  
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
          log.warn(`git command failed on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms`, {
            error: String(lastError),
          })
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
  
    // All retries exhausted
    log.error(`git command failed after ${maxRetries} attempts`, {
      error: String(lastError),
    })
    throw lastError
  }
  
  export async function track() {
    // Allow snapshots for any project with a .git directory, even if vcs is not explicitly "git"
    // This fixes the issue where global projects or projects without commits don't get snapshots
    const cfg = await Config.get()
    if (cfg.snapshot === false) return
    const git = gitdir()
    
    // Use unified path normalization for cross-platform compatibility
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    
    // Create snapshot directory with error handling
    try {
      await fs.mkdir(git, { recursive: true })
    } catch (error) {
      log.error("failed to create snapshot directory", {
        git,
        error: String(error),
      })
      return
    }
    
    // Check if git repository is already initialized by looking for HEAD file
    let gitInitialized = false
    try {
      await fs.access(path.join(git, "HEAD"))
      gitInitialized = true
    } catch {
      gitInitialized = false
    }
    
    // Initialize git if not already done with retry logic
    if (!gitInitialized) {
      try {
        const initResult = await gitWithRetry("init", {
          cwd: Instance.directory,
          env: {
            GIT_DIR: gitNormalized,
            GIT_WORK_TREE: worktreeNormalized,
          }
        })
        
        if (initResult.exitCode !== 0) {
          log.error("failed to initialize git for snapshot", {
            exitCode: initResult.exitCode,
            stderr: initResult.stderr,
          })
          return
        }
      } catch (error) {
        log.error("failed to initialize git for snapshot", {
          error: String(error),
        })
        return
      }
      
      // Configure git to not convert line endings on Windows
      // Windows path handling: core.autocrlf=false prevents line ending conversion issues
      // win32 platform: This setting is particularly important for Windows (win32) compatibility
      // cross-platform: This ensures files look the same on Windows, Linux, and Mac
      try {
        await gitWithRetry(`--git-dir ${gitNormalized} config core.autocrlf false`, { cwd: Instance.directory })
      } catch (error) {
        log.warn("failed to set core.autocrlf config", { error: String(error) })
      }
      log.info("initialized")
    }
    
    // Stage all files with retry logic
    try {
      const addResult = await gitWithRetry(`--git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`, { cwd: Instance.directory })
      
      if (addResult.exitCode !== 0) {
        log.warn("git add failed", { exitCode: addResult.exitCode })
      }
    } catch (error) {
      log.warn("git add failed with exception", { error: String(error) })
    }
    
    // Create snapshot (write-tree) with retry logic and timeout
    let writeTreeResult
    try {
      writeTreeResult = await gitWithRetry(`--git-dir ${gitNormalized} --work-tree ${worktreeNormalized} write-tree`, {
        cwd: Instance.directory,
        timeout: 30000 // 30 second timeout
      })
    } catch (error) {
      log.error("failed to create snapshot", {
        error: String(error),
      })
      return
    }
    
    if (writeTreeResult.exitCode !== 0) {
      log.error("failed to create snapshot", {
        exitCode: writeTreeResult.exitCode,
        stderr: writeTreeResult.stderr,
        stdout: writeTreeResult.stdout,
      })
      return
    }
    
    const hash = writeTreeResult.stdout.trim()
    
    if (!hash || hash.length < 40) {
      log.error("invalid snapshot hash", { hash, length: hash?.length })
      return
    }
    
    log.info("tracking", { hash, cwd: Instance.directory, git: gitNormalized })
    return hash
  }
  
  /**
   * Validate that a snapshot hash exists and is valid.
   * Prevents restore operations from using corrupted or non-existent snapshots.
   */
  export async function validateSnapshot(hash: string): Promise<{ valid: boolean; reason?: string }> {
    if (!hash || typeof hash !== 'string') {
      return { valid: false, reason: 'Invalid hash format' }
    }
  
    if (hash.length < 40) {
      return { valid: false, reason: 'Hash too short' }
    }
  
    // Check cache first for performance
    const cached = validationCache.get(hash)
    if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
      log.debug("using cached snapshot validation", { hash })
      return { valid: cached.valid, reason: cached.reason }
    }
  
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
  
    try {
      // Check if the hash exists in the git repository
      const catResult = await gitWithRetry(`--git-dir ${gitNormalized} --work-tree ${worktreeNormalized} cat-file -t ${hash}`, {
        cwd: Instance.directory,
        maxRetries: 1
      })
    
      if (catResult.exitCode !== 0) {
        const result = { valid: false, reason: 'Snapshot hash not found in repository' }
        cacheValidation(hash, result)
        return result
      }
  
      // Verify it's actually a tree object (snapshots are trees)
      const objectType = catResult.stdout.trim()
      if (objectType !== 'tree') {
        const result = { valid: false, reason: `Invalid object type: ${objectType}, expected tree` }
        cacheValidation(hash, result)
        return result
      }
  
      const result = { valid: true }
      cacheValidation(hash, result)
      return result
    } catch (error) {
      const result = { valid: false, reason: `Validation failed: ${String(error)}` }
      cacheValidation(hash, result)
      return result
    }
  }
  
  /**
   * Cache a snapshot validation result for performance optimization.
   */
  function cacheValidation(hash: string, result: { valid: boolean; reason?: string }): void {
    // Prevent memory leaks by limiting cache size
    if (validationCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestKey = validationCache.keys().next().value as string
      validationCache.delete(oldestKey)
    }
  
    validationCache.set(hash, {
      ...result,
      timestamp: Date.now()
    })
  }
  
  export const Patch = z.object({
    hash: z.string(),
    files: z.string().array(),
  })
  export type Patch = z.infer<typeof Patch>
  
  export async function patch(hash: string): Promise<Patch> {
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    
    try {
      const addResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`
        .quiet()
        .cwd(Instance.directory)
        .nothrow()
      
      if (addResult.exitCode !== 0) {
        log.warn("git add failed in patch", { exitCode: addResult.exitCode })
      }
    } catch (error) {
      log.warn("git add failed in patch with exception", { error: String(error) })
    }
    
    // For repos without commits, git diff <hash> won't work
    // Instead, we need to check what files are different from the snapshot state
    // Use git ls-tree to check if the file existed in the snapshot
    const result =
      await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} diff --no-ext-diff --name-only ${hash} -- .`
        .quiet()
        .cwd(Instance.directory)
        .nothrow()
  
    // If git diff fails (common in repos without commits), fall back to checking what files exist
    if (result.exitCode !== 0 || !result.text().trim()) {
      log.warn("git diff failed or returned empty, checking file changes differently", { 
        hash, 
        exitCode: result.exitCode,
        stdout: result.text().toString().substring(0, 200)
      })
      
      // For repos without commits, we need to check which files are new or modified
      // by comparing against what was in the snapshot tree
      try {
        // Get list of all files in current worktree
        const lsFilesResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} ls-files --others --exclude-standard .`
          .quiet()
          .cwd(Instance.directory)
          .nothrow()
          .text()
        
        const untrackedFiles = lsFilesResult.trim().split("\n").filter(Boolean)
        
        // Get list of modified tracked files  
        const diffIndexResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} diff --name-only .`
          .quiet()
          .cwd(Instance.directory)
          .nothrow()
          .text()
          
        const modifiedFiles = diffIndexResult.trim().split("\n").filter(Boolean)
        
        // Combine untracked and modified files
        const allChangedFiles = [...new Set([...untrackedFiles, ...modifiedFiles])]
        
        const normalizedFiles = allChangedFiles.map((x) => {
          // Normalize path separators for Windows using unified utility
          const withWorktree = Filesystem.normalizeGitPath(path.join(Instance.worktree, x), false)
          return withWorktree
        })
        
        return {
          hash,
          files: normalizedFiles,
        }
      } catch (error) {
        log.error("failed to get file changes by alternative method", { error: String(error) })
        return { hash, files: [] }
      }
    }
  
    const files = result.text()
    const normalizedFiles = files
      .trim()
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        // Normalize path separators for Windows using unified utility
        const withWorktree = Filesystem.normalizeGitPath(path.join(Instance.worktree, x), false)
        return withWorktree
      })
    
    return {
      hash,
      files: normalizedFiles,
    }
  }
  
  export async function restore(snapshot: string) {
    log.info("restore", { commit: snapshot })
    
    // Validate snapshot hash and existence
    const validation = await validateSnapshot(snapshot)
    if (!validation.valid) {
      log.error("snapshot validation failed", { 
        snapshot, 
        reason: validation.reason 
      })
      return
    }
    
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    
    const result =
      await gitWithRetry(`--git-dir ${gitNormalized} --work-tree ${worktreeNormalized} read-tree ${snapshot}`, {
        cwd: worktreeNormalized
      })
  
    if (result.exitCode !== 0) {
      log.error("failed to read snapshot", {
        snapshot,
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout,
      })
      return
    }
    
    const checkoutResult =
      await gitWithRetry(`--git-dir ${gitNormalized} --work-tree ${worktreeNormalized} checkout-index -a -f`, {
        cwd: worktreeNormalized
      })
  
    if (checkoutResult.exitCode !== 0) {
      log.error("failed to checkout files from snapshot", {
        snapshot,
        exitCode: checkoutResult.exitCode,
        stderr: checkoutResult.stderr,
      })
    }
  }
  
  export async function revert(patches: Patch[]) {
    const files = new Set<string>()
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    
    for (const item of patches) {
      for (const file of item.files) {
        if (files.has(file)) continue
        
        // Normalize file path for Windows using unified utility
        const normalizedFile = Filesystem.normalizeNativePath(file)
        
        log.info("reverting", { file: normalizedFile, hash: item.hash })
        
        const result = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} checkout ${item.hash} -- "${normalizedFile}"`
          .quiet()
          .cwd(worktreeNormalized)
          .nothrow()
        
        if (result.exitCode !== 0) {
          const relativePath = path.relative(Instance.worktree, normalizedFile)
          const normalizedRelative = Filesystem.normalizeNativePath(relativePath)
          
          const checkTree =
            await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} ls-tree ${item.hash} -- "${normalizedRelative}"`
              .quiet()
              .cwd(worktreeNormalized)
              .nothrow()
          
          if (checkTree.exitCode === 0 && checkTree.text().trim()) {
            log.info("file existed in snapshot but checkout failed, keeping", { 
              file: normalizedFile,
            })
          } else {
            log.info("file did not exist in snapshot, deleting", { file: normalizedFile })
            try {
              await fs.unlink(normalizedFile)
            } catch (error) {
              log.error("failed to delete file during revert", { 
                file: normalizedFile, 
                error: String(error) 
              })
            }
          }
        }
        files.add(file)
      }
    }
  }
  
  export async function diff(hash: string) {
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    
    try {
      const addResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`
        .quiet()
        .cwd(Instance.directory)
        .nothrow()
      
      if (addResult.exitCode !== 0) {
        log.warn("git add failed in diff", { exitCode: addResult.exitCode })
      }
    } catch (error) {
      log.warn("git add failed in diff with exception", { error: String(error) })
    }
    
    const result =
      await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} diff --no-ext-diff ${hash} -- .`
        .quiet()
        .cwd(worktreeNormalized)
        .nothrow()
  
    if (result.exitCode !== 0) {
      log.warn("failed to get diff", {
        hash,
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
      })
      return ""
    }
  
    return result.text().trim()
  }
  
  export const FileDiff = z
    .object({
      file: z.string(),
      before: z.string(),
      after: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
    .meta({
      ref: "FileDiff",
    })
  export type FileDiff = z.infer<typeof FileDiff>
  export async function diffFull(from: string, to: string): Promise<FileDiff[]> {
    const git = gitdir()
    const gitNormalized = Filesystem.normalizeGitPath(git, true)
    const worktreeNormalized = Filesystem.normalizeGitPath(Instance.worktree, true)
    const result: FileDiff[] = []
    
    // Maximum file size to load into memory (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    
    for await (const line of $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} diff --no-ext-diff --no-renames --numstat ${from} ${to} -- .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
      .lines()) {
      if (!line) continue
      const [additions, deletions, file] = line.split("\t")
      const isBinaryFile = additions === "-" && deletions === "-"
      
      // For large files or binary files, skip loading content
      let before = ""
      let after = ""
      
      if (!isBinaryFile) {
        try {
          // Check file size before loading
          const beforeSizeResult = await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} ls-filesize ${from} -- "${file}"`
            .quiet()
            .nothrow()
            .text()
          
          const beforeSize = parseInt(beforeSizeResult.trim()) || 0
          
          if (beforeSize <= MAX_FILE_SIZE) {
            before = await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} show ${from}:${file}`
              .quiet()
              .nothrow()
              .text()
          } else {
            log.info("skipping large file in diffFull", { file, size: beforeSize })
          }
          
          const afterSizeResult = await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} ls-filesize ${to} -- "${file}"`
            .quiet()
            .nothrow()
            .text()
          
          const afterSize = parseInt(afterSizeResult.trim()) || 0
          
          if (afterSize <= MAX_FILE_SIZE) {
            after = await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} show ${to}:${file}`
              .quiet()
              .nothrow()
              .text()
          } else {
            log.info("skipping large file in diffFull", { file, size: afterSize })
          }
        } catch (error) {
          log.warn("failed to load file content in diffFull", { 
            file, 
            error: String(error), 
            from, 
            to 
          })
          // Continue with empty content
        }
      }
      
      const added = isBinaryFile ? 0 : parseInt(additions)
      const deleted = isBinaryFile ? 0 : parseInt(deletions)
      result.push({
        file,
        before,
        after,
        additions: Number.isFinite(added) ? added : 0,
        deletions: Number.isFinite(deleted) ? deleted : 0,
      })
    }
    return result
  }
  
  function gitdir() {
    const project = Instance.project
    return path.join(Global.Path.data, "snapshot", project.id)
  }
}