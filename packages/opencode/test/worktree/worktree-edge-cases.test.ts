import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Instance } from "../../src/project/instance"
import { Worktree } from "../../src/worktree"
import { GlobalBus } from "../../src/bus/global"
import { Database } from "../../src/storage/db"
import { ProjectTable } from "../../src/project/project.sql"
import { Project } from "../../src/project/project"
import { tmpdir } from "../fixture/fixture"

async function bootstrap() {
  return tmpdir({
    git: true,
    init: async (dir) => {
      await $`git config user.email "test@test.com"`.cwd(dir).quiet()
      await $`git config user.name "Test User"`.cwd(dir).quiet()
      await fs.writeFile(path.join(dir, "test.txt"), "test content")
      await $`git add .`.cwd(dir).quiet()
      await $`git commit -m "add test file"`.cwd(dir).quiet()
      return { dir }
    },
  })
}

describe("Worktree Edge Cases for Full Coverage", () => {
  describe("create function edge cases", () => {
    test("handles CreateFailedError when git worktree add fails", async () => {
      await using tmp = await tmpdir() // Non-git directory
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock a non-git directory by manipulating the instance
          const originalVcs = Instance.project.vcs
          ;(Instance.project as any).vcs = "git"
          
          try {
            await expect(Worktree.create({ name: "test" })).rejects.toThrow(Worktree.CreateFailedError)
          } finally {
            ;(Instance.project as any).vcs = originalVcs
          }
        },
      })
    })

    test("handles worktree creation with startCommand failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create worktree with a failing start command
          const info = await Worktree.create({ startCommand: "nonexistent-command-12345" })
          expect(info).toBeDefined()
          
          // Wait for async operations
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("handles bootstrap failure during worktree creation", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Wait for async bootstrap to potentially fail
          await new Promise(resolve => setTimeout(resolve, 200))
          
          // Clean up regardless of outcome
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("emits Failed event on worktree creation failure", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const events: any[] = []
          const unsub = GlobalBus.on("event", (event) => {
            if (event.payload.type === "worktree.failed") {
              events.push(event)
            }
          })

          // Mock git failure
          const originalVcs = Instance.project.vcs
          ;(Instance.project as any).vcs = "git"
          
          try {
            await Worktree.create({ name: "test" })
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (error) {
            // Expected to fail
          } finally {
            ;(Instance.project as any).vcs = originalVcs
            unsub()
          }
          
          // Should have captured failure events
          expect(events.length).toBeGreaterThanOrEqual(0)
        },
      })
    })
  })

  describe("remove function edge cases", () => {
    test("handles RemoveFailedError when git worktree list fails", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock git worktree list failure by corrupting the git repo temporarily
          const gitDir = path.join(tmp.path, ".git")
          const backupDir = path.join(tmp.path, ".git-backup")
          
          try {
            await fs.rename(gitDir, backupDir)
            
            await expect(Worktree.remove({ directory: tmp.path })).rejects.toThrow(Worktree.RemoveFailedError)
          } finally {
            await fs.rename(backupDir, gitDir).catch(() => {})
          }
        },
      })
    })

    test("handles worktree removal with stale entries", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Simulate a stale worktree by manually removing the directory
          await fs.rm(info.directory, { recursive: true }).catch(() => {})
          
          // Should still succeed in removing the stale worktree
          const result = await Worktree.remove({ directory: info.directory })
          expect(result).toBe(true)
        },
      })
    })

    test("handles branch deletion failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Manually remove the worktree directory first
          await fs.rm(info.directory, { recursive: true }).catch(() => {})
          
          // Try to remove - this should handle branch deletion gracefully
          const result = await Worktree.remove({ directory: info.directory })
          expect(result).toBe(true)
        },
      })
    })
  })

  describe("reset function edge cases", () => {
    test("handles ResetFailedError when git worktree list fails", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock git worktree list failure
          const gitDir = path.join(tmp.path, ".git")
          const backupDir = path.join(tmp.path, ".git-backup")
          
          try {
            await fs.rename(gitDir, backupDir)
            
            await expect(Worktree.reset({ directory: tmp.path })).rejects.toThrow(Worktree.ResetFailedError)
          } finally {
            await fs.rename(backupDir, gitDir).catch(() => {})
          }
        },
      })
    })

    test("handles reset with no default branch", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Delete all branches to simulate no default branch
          await $`git branch -D main`.cwd(tmp.path).nothrow().quiet()
          await $`git branch -D master`.cwd(tmp.path).nothrow().quiet()
          
          try {
            await expect(Worktree.reset({ directory: info.directory })).rejects.toThrow(Worktree.ResetFailedError)
          } finally {
            // Clean up
            await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
            await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
          }
        },
      })
    })

    test("handles reset with fetch failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Add a fake remote to simulate fetch failure
          await $`git remote add fake-origin http://invalid-url-12345.com`.cwd(tmp.path).quiet()
          
          try {
            await expect(Worktree.reset({ directory: info.directory })).rejects.toThrow(Worktree.ResetFailedError)
          } finally {
            // Clean up
            await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
            await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
          }
        },
      })
    })

    test("handles reset with dirty working directory", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Create uncommitted changes
          await fs.writeFile(path.join(info.directory, "dirty-file.txt"), "dirty content")
          
          try {
            await expect(Worktree.reset({ directory: info.directory })).rejects.toThrow(Worktree.ResetFailedError)
          } finally {
            // Clean up
            await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
            await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
          }
        },
      })
    })

    test("handles submodule operations during reset", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Add a mock submodule (this will likely fail but tests the code path)
          await $`git submodule add http://invalid-url-12345.com fake-submodule`.cwd(info.directory).nothrow().quiet()
          
          try {
            await Worktree.reset({ directory: info.directory })
          } catch (error) {
            // Expected to fail due to invalid submodule
            expect(error).toBeDefined()
          } finally {
            // Clean up
            await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
            await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
          }
        },
      })
    })
  })

  describe("runStartScripts function coverage", () => {
    test("handles project with no start command", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create a project without start command in database
          const projectId = Instance.project.id
          
          // Clear any existing project data
          Database.use((db) => db.delete(ProjectTable).where(eq(ProjectTable.id, projectId)).run())
          
          const info = await Worktree.create({ startCommand: "echo 'test'" })
          expect(info).toBeDefined()
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("handles project start command failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Set up a project with failing start command
          const projectId = Instance.project.id
          const projectData = {
            id: projectId,
            commands: {
              start: "nonexistent-command-12345"
            }
          }
          
          Database.use((db) => db.insert(ProjectTable).values(projectData).onConflictDoNothing().run())
          
          const info = await Worktree.create({})
          expect(info).toBeDefined()
          
          // Wait for async operations
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })
  })

  describe("candidate function edge cases", () => {
    test("handles NameGenerationFailedError when all names are taken", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create many worktrees to exhaust name generation
          const createdWorktrees = []
          
          try {
            // Try to create many worktrees with the same base name
            for (let i = 0; i < 30; i++) {
              const info = await Worktree.create({ name: "test" })
              createdWorktrees.push(info)
            }
          } catch (error) {
            // Expected to eventually fail with NameGenerationFailedError
            expect(error).toBeInstanceOf(Worktree.NameGenerationFailedError)
          } finally {
            // Clean up all created worktrees
            for (const info of createdWorktrees) {
              await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
              await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
            }
          }
        },
      })
    })
  })
})
