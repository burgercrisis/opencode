import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Global } from "../global"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"

export namespace Snapshot {
  const log = Log.create({ service: "snapshot" })

  export async function track() {
    // Allow snapshots for any project with a .git directory, even if vcs is not explicitly "git"
    // This fixes the issue where global projects or projects without commits don't get snapshots
    const cfg = await Config.get()
    if (cfg.snapshot === false) return
    const git = gitdir()
    
    // Normalize paths for Windows compatibility
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    
    // Create snapshot directory
    await fs.mkdir(git, { recursive: true })
    
    // Check if git repository is already initialized by looking for HEAD file
    let gitInitialized = false
    try {
      await fs.access(path.join(git, "HEAD"))
      gitInitialized = true
    } catch {
      gitInitialized = false
    }
    
    // Initialize git if not already done
    if (!gitInitialized) {
      const initResult = await $`git init`
        .env({
          ...process.env,
          GIT_DIR: gitNormalized,
          GIT_WORK_TREE: worktreeNormalized,
        })
        .quiet()
        .nothrow()
      
      if (initResult.exitCode !== 0) {
        log.error("failed to initialize git for snapshot", {
          exitCode: initResult.exitCode,
          stderr: initResult.stderr.toString(),
        })
        return
      }
      
      // Configure git to not convert line endings on Windows
      await $`git --git-dir ${gitNormalized} config core.autocrlf false`.quiet().nothrow()
      log.info("initialized")
    }
    
    // Stage all files
    const addResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
    
    if (addResult.exitCode !== 0) {
      log.warn("git add failed", { exitCode: addResult.exitCode })
    }
    
    // Create snapshot (write-tree) with proper error checking
    const writeTreeResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} write-tree`
      .cwd(Instance.directory)
      .nothrow()
    
    if (writeTreeResult.exitCode !== 0) {
      log.error("failed to create snapshot", {
        exitCode: writeTreeResult.exitCode,
        stderr: writeTreeResult.stderr.toString(),
        stdout: writeTreeResult.stdout.toString(),
      })
      return
    }
    
    const hash = writeTreeResult.text().trim()
    
    if (!hash || hash.length < 40) {
      log.error("invalid snapshot hash", { hash, length: hash?.length })
      return
    }
    
    log.info("tracking", { hash, cwd: Instance.directory, git: gitNormalized })
    return hash
  }

  export const Patch = z.object({
    hash: z.string(),
    files: z.string().array(),
  })
  export type Patch = z.infer<typeof Patch>

  export async function patch(hash: string): Promise<Patch> {
    const git = gitdir()
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    
    const addResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
    
    if (addResult.exitCode !== 0) {
      log.warn("git add failed in patch", { exitCode: addResult.exitCode })
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
          // Normalize path separators for Windows
          const withWorktree = path.join(Instance.worktree, x)
          return process.platform === "win32" ? withWorktree.replace(/\//g, "\\") : withWorktree
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
        // Normalize path separators for Windows
        const withWorktree = path.join(Instance.worktree, x)
        return process.platform === "win32" ? withWorktree.replace(/\//g, "\\") : withWorktree
      })
    
    return {
      hash,
      files: normalizedFiles,
    }
  }

  export async function restore(snapshot: string) {
    log.info("restore", { commit: snapshot })
    
    // Validate snapshot hash
    if (!snapshot || snapshot.length < 40) {
      log.error("invalid snapshot hash for restore", { snapshot })
      return
    }
    
    const git = gitdir()
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    
    const result =
      await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} read-tree ${snapshot}`
        .quiet()
        .cwd(worktreeNormalized)
        .nothrow()

    if (result.exitCode !== 0) {
      log.error("failed to read snapshot", {
        snapshot,
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
      })
      return
    }
    
    const checkoutResult =
      await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} checkout-index -a -f`
        .quiet()
        .cwd(worktreeNormalized)
        .nothrow()

    if (checkoutResult.exitCode !== 0) {
      log.error("failed to checkout files from snapshot", {
        snapshot,
        exitCode: checkoutResult.exitCode,
        stderr: checkoutResult.stderr.toString(),
      })
    }
  }

  export async function revert(patches: Patch[]) {
    const files = new Set<string>()
    const git = gitdir()
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    
    for (const item of patches) {
      for (const file of item.files) {
        if (files.has(file)) continue
        
        // Normalize file path for Windows
        const normalizedFile = process.platform === "win32" ? file.replace(/\//g, "\\") : file
        
        log.info("reverting", { file: normalizedFile, hash: item.hash })
        
        const result = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} checkout ${item.hash} -- "${normalizedFile}"`
          .quiet()
          .cwd(worktreeNormalized)
          .nothrow()
        
        if (result.exitCode !== 0) {
          const relativePath = path.relative(Instance.worktree, normalizedFile)
          const normalizedRelative = process.platform === "win32" ? relativePath.replace(/\//g, "\\") : relativePath
          
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
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    
    const addResult = await $`git --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} add .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
    
    if (addResult.exitCode !== 0) {
      log.warn("git add failed in diff", { exitCode: addResult.exitCode })
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
    const gitNormalized = process.platform === "win32" ? git.replace(/\\/g, "/") : git
    const worktreeNormalized = Instance.worktree.replace(/\\/g, "/")
    const result: FileDiff[] = []
    
    for await (const line of $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} diff --no-ext-diff --no-renames --numstat ${from} ${to} -- .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
      .lines()) {
      if (!line) continue
      const [additions, deletions, file] = line.split("\t")
      const isBinaryFile = additions === "-" && deletions === "-"
      const before = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} show ${from}:${file}`
            .quiet()
            .nothrow()
            .text()
      const after = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${gitNormalized} --work-tree ${worktreeNormalized} show ${to}:${file}`
            .quiet()
            .nothrow()
            .text()
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
