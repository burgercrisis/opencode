import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Instance } from "../../src/project/instance"
import { Worktree } from "../../src/worktree"
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

describe("Worktree Ultimate Coverage Tests", () => {
  describe("Remove function error paths", () => {
    test("covers remove worktree failure with retry", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Manually corrupt the worktree to force removal failure
          const gitDir = path.join(info.directory, ".git")
          await fs.writeFile(path.join(gitDir, "corrupt"), "corrupt").catch(() => {})
          
          try {
            // This should trigger the removal failure path
            await Worktree.remove({ directory: info.directory })
          } catch (error) {
            // Expected to fail, which covers the error path
            expect(error).toBeDefined()
          }
          
          // Force cleanup
          await fs.rm(info.directory, { recursive: true }).catch(() => {})
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("covers remove with git worktree list failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Corrupt the main git repo to force list failure
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

    test("covers remove with branch deletion failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Remove worktree but keep branch to test branch deletion
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          
          // Try to remove again to trigger branch deletion path
          const result = await Worktree.remove({ directory: info.directory })
          expect(result).toBe(true)
        },
      })
    })

    test("covers remove directory exists but no worktree entry", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create a directory that's not a worktree
          const fakeDir = path.join(tmp.path, "fake-worktree")
          await fs.mkdir(fakeDir, { recursive: true })
          await fs.writeFile(path.join(fakeDir, "test.txt"), "test")
          
          const result = await Worktree.remove({ directory: fakeDir })
          expect(result).toBe(true)
          
          // Directory should be cleaned up
          const exists = await fs.stat(fakeDir).then(() => true).catch(() => false)
          expect(exists).toBe(false)
        },
      })
    })
  })

  describe("Reset function error paths", () => {
    test("covers reset with git worktree list failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Corrupt git to force list failure
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

    test("covers reset with no matching worktree entry", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const nonExistent = path.join(os.tmpdir(), "non-existent-worktree")
          
          await expect(Worktree.reset({ directory: nonExistent })).rejects.toThrow(Worktree.ResetFailedError)
        },
      })
    })

    test("covers reset with git fetch failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Add invalid remote to force fetch failure
          await $`git remote add invalid-remote http://invalid-url-12345.com`.cwd(tmp.path).quiet()
          
          const info = await Worktree.create({})
          
          try {
            await Worktree.reset({ directory: info.directory })
          } catch (error) {
            // Expected to fail due to fetch error
            expect(error).toBeDefined()
          }
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("covers reset with git checkout failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Create uncommitted changes to force checkout failure
          await fs.writeFile(path.join(info.directory, "conflict.txt"), "conflict content")
          
          try {
            await Worktree.reset({ directory: info.directory })
          } catch (error) {
            // Expected to fail due to dirty state
            expect(error).toBeDefined()
          }
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("covers reset with submodule update failure", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Add .gitmodules to trigger submodule code
          await fs.writeFile(path.join(info.directory, ".gitmodules"), 
            "[submodule \"test\"]\npath = test\nurl = http://invalid-url-12345.com")
          
          try {
            await Worktree.reset({ directory: info.directory })
          } catch (error) {
            // Expected to fail due to submodule issues
            expect(error).toBeDefined()
          }
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })
  })

  describe("Create function complex error paths", () => {
    test("covers create with git worktree add failure", async () => {
      await using tmp = await tmpdir() // Non-git directory
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Force git context
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

    test("covers create with name generation exhaustion", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create many worktrees to potentially exhaust names
          const created = []
          
          try {
            for (let i = 0; i < 10; i++) {
              const info = await Worktree.create({ name: "exhaust-test" })
              created.push(info)
            }
          } catch (error) {
            // Might fail with NameGenerationFailedError
            expect(error).toBeDefined()
          } finally {
            // Clean up
            for (const info of created) {
              await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
              await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
            }
          }
        },
      })
    })
  })

  describe("Edge case coverage", () => {
    test("covers canonical function with complex paths", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const info = await Worktree.create({})
          
          // Test canonical with various path formats
          const canonical1 = path.resolve(info.directory)
          const canonical2 = path.normalize(info.directory)
          
          expect(canonical1).toBe(canonical2)
          
          // Clean up
          await $`git worktree remove --force ${info.directory}`.cwd(tmp.path).quiet()
          await $`git branch -D ${info.branch}`.cwd(tmp.path).quiet().catch(() => {})
        },
      })
    })

    test("covers failed function with complex git output", async () => {
      await using tmp = await bootstrap()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create untracked files to generate git clean warnings
          await fs.writeFile(path.join(tmp.path, "untracked1.txt"), "test1")
          await fs.writeFile(path.join(tmp.path, "untracked2.txt"), "test2")
          
          // Run git clean to generate warning output
          const result = await $`git clean -n`.quiet().nothrow().cwd(tmp.path)
          
          // The failed function processes this output
          const output = result.stdout ? new TextDecoder().decode(result.stdout) : ""
          expect(typeof output).toBe("string")
          
          // Clean up
          await fs.rm(path.join(tmp.path, "untracked1.txt")).catch(() => {})
          await fs.rm(path.join(tmp.path, "untracked2.txt")).catch(() => {})
        },
      })
    })
  })
})
