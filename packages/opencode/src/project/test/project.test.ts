import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Project } from "../project"

describe("Project Module", () => {
  describe("Schema Validation", () => {
    it("should validate Project.Info schema", () => {
      const validProject = {
        id: "test-project-id",
        worktree: "/test/worktree",
        vcs: "git" as const,
        name: "Test Project",
        icon: {
          url: "https://example.com/icon.png",
          override: "custom-icon",
          color: "#ff0000"
        },
        commands: {
          start: "npm start"
        },
        time: {
          created: Date.now(),
          updated: Date.now(),
          initialized: Date.now()
        },
        sandboxes: ["sandbox1", "sandbox2"]
      }

      const result = Project.Info.safeParse(validProject)
      expect(result.success).toBe(true)
    })

    it("should reject invalid Project.Info", () => {
      const invalidProject = {
        // Missing required id
        worktree: "/test/worktree"
      }

      const result = Project.Info.safeParse(invalidProject)
      expect(result.success).toBe(false)
    })

    it("should validate Vcs.Info schema", () => {
      const validVcsInfo = {
        branch: "main"
      }

      const result = Project.Info.safeParse(validVcsInfo)
      expect(result.success).toBe(true)
    })

    it("should reject invalid Vcs.Info", () => {
      const invalidVcsInfo = {
        // Missing required branch
      }

      const result = Project.Info.safeParse(invalidVcsInfo)
      expect(result.success).toBe(false)
    })
  })

  describe("fromDirectory function", () => {
    it("should create project from directory with git", async () => {
      const mockFilesystem = {
        existsSync: () => true,
        findUp: () => "/test/.git"
      }

      const mockGit = {
        revparse: () => ({
          quiet: () => ({
            nothrow: () => ({
              text: () => Promise.resolve("/test/worktree")
            })
          })
        })
      }

      const mockDatabase = {
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => Promise.resolve(null)
            })
          })
        }),
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => ({
              run: () => Promise.resolve()
            })
          })
        })
      }

      // Mock dependencies
      const originalFilesystem = (global as any).Filesystem
      const originalGit = (global as any).git
      const originalDatabase = (global as any).Database

      ;(global as any).Filesystem = mockFilesystem
      ;(global as any).git = mockGit
      ;(global as any).Database = mockDatabase

      const result = await Project.fromDirectory("/test")

      expect(result.project).toBeDefined()
      expect(result.project.vcs).toBe("git")
      expect(result.sandbox).toBe("/test/worktree")

      // Restore
      if (originalFilesystem) (global as any).Filesystem = originalFilesystem
      if (originalGit) (global as any).git = originalGit
      if (originalDatabase) (global as any).Database = originalDatabase
    })

    it("should create project without git", async () => {
      const mockFilesystem = {
        existsSync: () => false,
        findUp: () => undefined
      }

      const mockDatabase = {
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => Promise.resolve(null)
            })
          })
        }),
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => ({
              run: () => Promise.resolve()
            })
          })
        })
      }

      // Mock dependencies
      const originalFilesystem = (global as any).Filesystem
      const originalGit = (global as any).git
      const originalDatabase = (global as any).Database

      ;(global as any).Filesystem = mockFilesystem
      ;(global as any).git = mockGit
      ;(global as any).Database = mockDatabase

      const result = await Project.fromDirectory("/test")

      expect(result.project).toBeDefined()
      expect(result.project.vcs).toBeUndefined()

      // Restore
      if (originalFilesystem) (global as any).Filesystem = originalFilesystem
      if (originalGit) (global as any).git = originalGit
      if (originalDatabase) (global as any).Database = originalDatabase
    })

    it("should handle existing project in database", async () => {
      const existingProject = {
        id: "existing-id",
        worktree: "/existing/worktree",
        vcs: "git" as const,
        time: {
          created: Date.now() - 1000000,
          updated: Date.now() - 500000
        },
        sandboxes: []
      }

      const mockFilesystem = {
        existsSync: () => true,
        findUp: () => "/test/.git"
      }

      const mockGit = {
        revparse: () => ({
          quiet: () => ({
            nothrow: () => ({
              text: () => Promise.resolve("/test/worktree")
            })
          })
        })
      }

      const mockDatabase = {
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => Promise.resolve(existingProject)
            })
          })
        })
      }

      // Mock dependencies
      const originalFilesystem = (global as any).Filesystem
      const originalGit = (global as any).git
      const originalDatabase = (global as any).Database

      ;(global as any).Filesystem = mockFilesystem
      ;(global as any).git = mockGit
      ;(global as any).Database = mockDatabase

      const result = await Project.fromDirectory("/test")

      expect(result.project.id).toBe("existing-id")
      expect(result.project.worktree).toBe("/existing/worktree")

      // Restore
      if (originalFilesystem) (global as any).Filesystem = originalFilesystem
      if (originalGit) (global as any).git = originalGit
      if (originalDatabase) (global as any).Database = originalDatabase
    })
  })

  describe("setInitialized function", () => {
    it("should update project initialization timestamp", async () => {
      const mockDatabase = {
        update: () => ({
          set: () => ({
            where: () => ({
              run: () => Promise.resolve()
            })
          })
        })
      }

      const mockWork = {
        push: () => Promise.resolve()
      }

      // Mock dependencies
      const originalDatabase = (global as any).Database
      const originalWork = (global as any).work

      ;(global as any).Database = mockDatabase
      ;(global as any).work = mockWork

      await Project.setInitialized("test-project-id")

      // Restore
      if (originalDatabase) (global as any).Database = originalDatabase
      if (originalWork) (global as any).work = originalWork
    })
  })

  describe("Event definitions", () => {
    it("should have Event object with proper structure", () => {
      expect(Project.Event).toBeDefined()
      expect(Project.Event.BranchUpdated).toBeDefined()
    })

    it("should define branch updated event", () => {
      const eventData = {
        branch: "main"
      }

      const result = Project.Event.BranchUpdated.schema.safeParse(eventData)
      expect(result.success).toBe(true)
    })

    it("should reject invalid branch event data", () => {
      const invalidEventData = {
        // Missing required branch field
      }

      const result = Project.Event.BranchUpdated.schema.safeParse(invalidEventData)
      expect(result.success).toBe(false)
    })
  })

  describe("Error handling", () => {
    it("should handle git command errors", async () => {
      const mockFilesystem = {
        existsSync: () => true,
        findUp: () => "/test/.git"
      }

      const mockGit = {
        revparse: () => ({
          quiet: () => ({
            nothrow: () => ({
              text: () => Promise.reject(new Error("Git command failed"))
            })
          })
        })
      }

      const mockDatabase = {
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => Promise.resolve(null)
            })
          })
        }),
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => ({
              run: () => Promise.resolve()
            })
          })
        })
      }

      // Mock dependencies
      const originalFilesystem = (global as any).Filesystem
      const originalGit = (global as any).git
      const originalDatabase = (global as any).Database

      ;(global as any).Filesystem = mockFilesystem
      ;(global as any).git = mockGit
      ;(global as any).Database = mockDatabase

      // Should handle git errors gracefully
      await expect(Project.fromDirectory("/test")).rejects.toThrow()

      // Restore
      if (originalFilesystem) (global as any).Filesystem = originalFilesystem
      if (originalGit) (global as any).git = originalGit
      if (originalDatabase) (global as any).Database = originalDatabase
    })

    it("should handle database errors", async () => {
      const mockFilesystem = {
        existsSync: () => true,
        findUp: () => "/test/.git"
      }

      const mockGit = {
        revparse: () => ({
          quiet: () => ({
            nothrow: () => ({
              text: () => Promise.resolve("/test/worktree")
            })
          })
        })
      }

      const mockDatabase = {
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => Promise.reject(new Error("Database connection failed"))
            })
          })
        })
      }

      // Mock dependencies
      const originalFilesystem = (global as any).Filesystem
      const originalGit = (global as any).git
      const originalDatabase = (global as any).Database

      ;(global as any).Filesystem = mockFilesystem
      ;(global as any).git = mockGit
      ;(global as any).Database = mockDatabase

      // Should handle database errors gracefully
      await expect(Project.fromDirectory("/test")).rejects.toThrow()

      // Restore
      if (originalFilesystem) (global as any).Filesystem = originalFilesystem
      if (originalGit) (global as any).git = originalGit
      if (originalDatabase) (global as any).Database = originalDatabase
    })
  })

  describe("Project properties", () => {
    it("should handle optional fields correctly", () => {
      const minimalProject = {
        id: "minimal-id",
        worktree: "/minimal/worktree",
        time: {
          created: Date.now(),
          updated: Date.now()
        },
        sandboxes: []
      }

      const result = Project.Info.safeParse(minimalProject)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.vcs).toBeUndefined()
        expect(result.data.name).toBeUndefined()
        expect(result.data.icon).toBeUndefined()
        expect(result.data.commands).toBeUndefined()
        expect(result.data.time.initialized).toBeUndefined()
      }
    })

    it("should validate time fields", () => {
      const projectWithInvalidTime = {
        id: "test-id",
        worktree: "/test/worktree",
        time: {
          created: "invalid-timestamp",
          updated: Date.now()
        },
        sandboxes: []
      }

      const result = Project.Info.safeParse(projectWithInvalidTime)
      expect(result.success).toBe(false)
    })

    it("should validate sandboxes array", () => {
      const projectWithInvalidSandboxes = {
        id: "test-id",
        worktree: "/test/worktree",
        time: {
          created: Date.now(),
          updated: Date.now()
        },
        sandboxes: "not-an-array"
      }

      const result = Project.Info.safeParse(projectWithInvalidSandboxes)
      expect(result.success).toBe(false)
    })
  })
})
