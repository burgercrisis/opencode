import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Flag } from "../flag/flag"
import { Global } from "../global"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Scheduler } from "../scheduler"
import { Filesystem } from "../util/filesystem"

export namespace Snapshot {
  const log = Log.create({ service: "snapshot" })
  const hour = 60 * 60 * 1000
  const prune = "7.days"

  async function gitWithRetry(args: string[], options: { cwd?: string; maxRetries?: number } = {}) {
    const { cwd = Instance.directory, maxRetries = 3 } = options
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await $`git ${args.join(" ")}`.quiet().cwd(cwd).nothrow()
      if (result.exitCode === 0) return result
      if (attempt === maxRetries - 1) return result
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
    return { exitCode: 1, stdout: "", stderr: "" }
  }

  export function init() {
    Scheduler.register({
      id: "snapshot.cleanup",
      interval: hour,
      run: cleanup,
      scope: "instance",
    })
  }

  export async function cleanup() {
    if (Instance.project.vcs !== "git" || Flag.OPENCODE_CLIENT === "acp") return
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

  export async function track() {
    if (Instance.project.vcs !== "git" || Flag.OPENCODE_CLIENT === "acp") return
    const cfg = await Config.get()
    if (cfg.snapshot === false) return
    const git = gitdir()
    if (await fs.mkdir(git, { recursive: true })) {
      await $`git init`
        .env({
          ...process.env,
          GIT_DIR: git,
          GIT_WORK_TREE: Instance.worktree,
        })
        .quiet()
        .nothrow()
      // Configure git to not convert line endings on Windows
      await $`git --git-dir ${git} config core.autocrlf false`.quiet().nothrow()
      log.info("initialized")
    }
    await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
    const hash = await $`git --git-dir ${git} --work-tree ${Instance.worktree} write-tree`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
      .text()
    log.info("tracking", { hash, cwd: Instance.directory, git })
    return hash.trim()
  }

  export const Patch = z.object({
    hash: z.string(),
    files: z.string().array(),
  })
  export type Patch = z.infer<typeof Patch>

  export async function patch(hash: string): Promise<Patch> {
    const git = gitdir()
    await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
    const result =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff --name-only ${hash} -- .`
        .quiet()
        .cwd(Instance.directory)
        .nothrow()

    // If git diff fails, return empty patch
    if (result.exitCode !== 0) {
      log.warn("failed to get diff", { hash, exitCode: result.exitCode })
      return { hash, files: [] }
    }

    const files = result.text()
    return {
      hash,
      files: files
        .trim()
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => path.join(Instance.worktree, x)),
    }
  }

  export async function restore(snapshot: string) {
    log.info("restore", { commit: snapshot })
    const git = gitdir()
    const result =
      await $`git --git-dir ${git} --work-tree ${Instance.worktree} read-tree ${snapshot} && git --git-dir ${git} --work-tree ${Instance.worktree} checkout-index -a -f`
        .quiet()
        .cwd(Instance.worktree)
        .nothrow()

    if (result.exitCode !== 0) {
      log.error("failed to restore snapshot", {
        snapshot,
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
      })
    }
  }

  export async function revert(patches: Patch[]) {
    const files = new Set<string>()
    const git = gitdir()
    for (const item of patches) {
      for (const file of item.files) {
        if (files.has(file)) continue
        log.info("reverting", { file, hash: item.hash })
        const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} checkout ${item.hash} -- ${file}`
          .quiet()
          .cwd(Instance.worktree)
          .nothrow()
        if (result.exitCode !== 0) {
          const relativePath = path.relative(Instance.worktree, file)
          const checkTree =
            await $`git --git-dir ${git} --work-tree ${Instance.worktree} ls-tree ${item.hash} -- ${relativePath}`
              .quiet()
              .cwd(Instance.worktree)
              .nothrow()
          if (checkTree.exitCode === 0 && checkTree.text().trim()) {
            log.info("file existed in snapshot but checkout failed, keeping", {
              file,
            })
          } else {
            log.info("file did not exist in snapshot, deleting", { file })
            await fs.unlink(file).catch(() => { })
          }
        }
        files.add(file)
      }
    }
  }

  export async function diff(hash: string) {
    const git = gitdir()
    await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
    const result =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff ${hash} -- .`
        .quiet()
        .cwd(Instance.worktree)
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
      status: z.enum(["added", "deleted", "modified"]).optional(),
    })
    .meta({
      ref: "FileDiff",
    })
  export type FileDiff = z.infer<typeof FileDiff>
  export async function diffFull(from: string, to: string): Promise<FileDiff[]> {
    const git = gitdir()
    const result: FileDiff[] = []
    const status = new Map<string, "added" | "deleted" | "modified">()

    const statuses =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff --name-status --no-renames ${from} ${to} -- .`
        .quiet()
        .cwd(Instance.directory)
        .nothrow()
        .text()

    for (const line of statuses.trim().split("\n")) {
      if (!line) continue
      const [code, file] = line.split("\t")
      if (!code || !file) continue
      const kind = code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified"
      status.set(file, kind)
    }

    for await (const line of $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff --no-renames --numstat ${from} ${to} -- .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()
      .lines()) {
      if (!line) continue
      const [additions, deletions, file] = line.split("\t")
      const isBinaryFile = additions === "-" && deletions === "-"
      const before = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${Instance.worktree} show ${from}:${file}`
          .quiet()
          .nothrow()
          .text()
      const after = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${Instance.worktree} show ${to}:${file}`
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
        status: status.get(file) ?? "modified",
      })
    }
    return result
  }

  export function unquote(path: string): string {
    if (!path.startsWith('"') || !path.endsWith('"')) return path
    const quoted = path.slice(1, -1)

    const process = (index: number, buffer: number[]): number[] => {
      if (index >= quoted.length) return buffer

      if (quoted[index] === "\\") {
        const next = index + 1
        if (next + 2 < quoted.length && /^[0-7]{3}$/.test(quoted.slice(next, next + 3))) {
          const octal = quoted.slice(next, next + 3)
          return process(index + 4, [...buffer, parseInt(octal, 8)])
        }

        const escapeMap: Record<string, number> = {
          b: 8,
          t: 9,
          n: 10,
          v: 11,
          f: 12,
          r: 13,
          '"': 34,
          "\\": 92,
        }
        const char = quoted[next]
        return process(index + 2, [...buffer, escapeMap[char] ?? quoted.charCodeAt(next)])
      }

      const charCode = quoted.charCodeAt(index)
      if (charCode < 128) {
        return process(index + 1, [...buffer, charCode])
      }

      const charBuffer = Buffer.from(quoted[index])
      return process(index + 1, [...buffer, ...Array.from(charBuffer)])
    }

    return Buffer.from(process(0, [])).toString("utf8")
  }

  function gitdir() {
    const project = Instance.project
    return path.join(Global.Path.data, "snapshot", project.id)
  }
}
