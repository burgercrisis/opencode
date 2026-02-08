import { describe, expect, test } from "bun:test"
import { Project } from "../../src/project/project"
import { Log } from "../../src/util/log"
import { Storage } from "../../src/storage/storage"
import { Filesystem } from "../../src/util/filesystem"
import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

function expectPath(received: string, expected: string) {
  expect(Filesystem.normalize(received)).toBe(Filesystem.normalize(expected))
}

describe("Project.fromDirectory", () => {
  test("should handle git repository with no commits", async () => {
    await using tmp = await tmpdir()
    await $`git init`.cwd(tmp.path).quiet()

    const { project } = await Project.fromDirectory(tmp.path)

    expect(project).toBeDefined()
    // expect(project.id).toBe("global") // This logic changed to use path hashes for no-commit repos
    expect(project.vcs).toBe("git")
    expectPath(project.worktree, tmp.path)

    const opencodeFile = path.join(tmp.path, ".git", "opencode")
    const fileExists = await Bun.file(opencodeFile).exists()
    expect(fileExists).toBe(false)
  })

  test("should handle git repository with commits", async () => {
    await using tmp = await tmpdir({ git: true })

    const { project } = await Project.fromDirectory(tmp.path)

    expect(project).toBeDefined()
    expect(project.id).not.toBe("global")
    expect(project.vcs).toBe("git")
    expectPath(project.worktree, tmp.path)

    const opencodeFile = path.join(tmp.path, ".git", "opencode")
    const fileExists = await Bun.file(opencodeFile).exists()
    expect(fileExists).toBe(true)
  })
})

describe("Project.fromDirectory with worktrees", () => {
  test("should set worktree to root when called from root", async () => {
    await using tmp = await tmpdir({ git: true })

    const { project, sandbox } = await Project.fromDirectory(tmp.path)

    expectPath(project.worktree, tmp.path)
    expectPath(sandbox, tmp.path)
    expect(project.sandboxes).not.toContain(tmp.path)
  })

  test("should set worktree to root when called from a worktree", async () => {
    await using tmp = await tmpdir({ git: true })

    const worktreePath = path.join(tmp.path, "..", "worktree-test-" + Math.random().toString(36).slice(2))
    await $`git worktree add ${worktreePath} -b test-branch`.cwd(tmp.path).quiet()

    const { project, sandbox } = await Project.fromDirectory(worktreePath)

    expectPath(project.worktree, tmp.path)
    expectPath(sandbox, worktreePath)
    expect(project.sandboxes.map(Filesystem.normalize)).toContain(Filesystem.normalize(worktreePath))
    expect(project.sandboxes.map(Filesystem.normalize)).not.toContain(Filesystem.normalize(tmp.path))

    await $`git worktree remove ${worktreePath}`.cwd(tmp.path).quiet()
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => {})
  })

  test("should accumulate multiple worktrees in sandboxes", async () => {
    await using tmp = await tmpdir({ git: true })

    const worktree1 = path.join(tmp.path, "..", "worktree-1-" + Math.random().toString(36).slice(2))
    const worktree2 = path.join(tmp.path, "..", "worktree-2-" + Math.random().toString(36).slice(2))
    await $`git worktree add ${worktree1} -b branch-1`.cwd(tmp.path).quiet()
    await $`git worktree add ${worktree2} -b branch-2`.cwd(tmp.path).quiet()

    await Project.fromDirectory(worktree1)
    const { project } = await Project.fromDirectory(worktree2)

    expectPath(project.worktree, tmp.path)
    expect(project.sandboxes.map(Filesystem.normalize)).toContain(Filesystem.normalize(worktree1))
    expect(project.sandboxes.map(Filesystem.normalize)).toContain(Filesystem.normalize(worktree2))
    expect(project.sandboxes.map(Filesystem.normalize)).not.toContain(Filesystem.normalize(tmp.path))

    await $`git worktree remove ${worktree1}`.cwd(tmp.path).quiet()
    await $`git worktree remove ${worktree2}`.cwd(tmp.path).quiet()
    await fs.rm(worktree1, { recursive: true, force: true }).catch(() => {})
    await fs.rm(worktree2, { recursive: true, force: true }).catch(() => {})
  })
})

describe("Project.discover", () => {
  test("should discover favicon.png in root", async () => {
    await using tmp = await tmpdir({ git: true })
    const { project } = await Project.fromDirectory(tmp.path)

    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await Bun.write(path.join(tmp.path, "favicon.png"), pngData)

    await Project.discover(project)

    const updated = await Storage.read<Project.Info>(["project", project.id])
    expect(updated.icon).toBeDefined()
    expect(updated.icon?.url).toStartWith("data:")
    expect(updated.icon?.url).toContain("base64")
    expect(updated.icon?.color).toBeUndefined()
  })

  test("should not discover non-image files", async () => {
    await using tmp = await tmpdir({ git: true })
    const { project } = await Project.fromDirectory(tmp.path)

    await Bun.write(path.join(tmp.path, "favicon.txt"), "not an image")

    await Project.discover(project)

    const updated = await Storage.read<Project.Info>(["project", project.id])
    expect(updated.icon).toBeUndefined()
  })
})
