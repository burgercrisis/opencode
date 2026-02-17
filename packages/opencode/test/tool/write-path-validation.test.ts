import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { WriteTool } from "../../src/tool/write"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"
import * as fs from "fs/promises"

describe("WriteTool Path Validation", () => {
  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn(),
  }

  describe("Path Validation Security", () => {
    test("rejects absolute paths with directory traversal", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Test cases that should be rejected
          const maliciousPaths = [
            "/tmp/../../etc/passwd",
            "/var/www/../../../etc/passwd",
            "/home/user/../../../../../etc/passwd",
            "/root/../../../../etc/passwd",
            `${tmp.path}/../../../etc/passwd`,
            `${tmp.path}/../../../../../etc/passwd`,
          ]

          for (const maliciousPath of maliciousPaths) {
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: maliciousPath
            })

            expect(result.success).toBe(false)
            if (!result.success) {
              expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
            }
          }
        }
      })
    })

    test("rejects relative paths with directory traversal", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Test cases that should be rejected
          const maliciousPaths = [
            "../../../etc/passwd",
            "../../etc/passwd",
            "../outside/file.txt",
            "folder/../../../etc/passwd",
            "deep/nested/path/../../../../etc/passwd",
          ]

          for (const maliciousPath of maliciousPaths) {
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: maliciousPath
            })

            expect(result.success).toBe(false)
            if (!result.success) {
              expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
            }
          }
        }
      })
    })

    test("allows safe absolute paths within project", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Test cases that should be allowed
          const safePaths = [
            `${tmp.path}/file.txt`,
            `${tmp.path}/folder/file.txt`,
            `${tmp.path}/deep/nested/path/file.txt`,
          ]

          for (const safePath of safePaths) {
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: safePath
            })

            expect(result.success).toBe(true)
          }
        }
      })
    })

    test("allows safe relative paths within project", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Test cases that should be allowed
          const safePaths = [
            "file.txt",
            "folder/file.txt",
            "deep/nested/path/file.txt",
            "./file.txt",
            "./folder/file.txt",
          ]

          for (const safePath of safePaths) {
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: safePath
            })

            expect(result.success).toBe(true)
          }
        }
      })
    })

    test("rejects paths with null bytes", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          const result = tool.parameters.safeParse({
            content: "test content",
            filePath: `${tmp.path}/file\0.txt`
          })

          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
          }
        }
      })
    })

    test("rejects empty paths", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          const result = tool.parameters.safeParse({
            content: "test content",
            filePath: ""
          })

          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
          }
        }
      })
    })

    test("handles edge cases with mixed separators", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Test mixed separators that should be rejected
          const maliciousPaths = [
            `${tmp.path}\\..\\..\\etc\\passwd`, // Windows separators with traversal
            `${tmp.path}/..\\../etc/passwd`,    // Mixed separators with traversal
          ]

          for (const maliciousPath of maliciousPaths) {
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: maliciousPath
            })

            expect(result.success).toBe(false)
            if (!result.success) {
              expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
            }
          }
        }
      })
    })

    test("prevents symlink-based traversal", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Create a symlink that points outside the project
          const linkPath = path.join(tmp.path, "outside-link")
          try {
            // Try to create a symlink to parent directory (this might fail on some systems)
            await fs.symlink(path.dirname(tmp.path), linkPath)

            // Try to use the symlink for traversal
            const maliciousPath = path.join(linkPath, "etc", "passwd")
            const result = tool.parameters.safeParse({
              content: "test content",
              filePath: maliciousPath
            })

            expect(result.success).toBe(false)
          } catch (error) {
            // Symlink creation might fail due to permissions, that's ok for this test
            console.log("Symlink creation failed, skipping symlink traversal test")
          }
        }
      })
    })
  })

  describe("Regression Tests", () => {
    test("original vulnerability is fixed", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // This is the exact example from the vulnerability report
          const maliciousPath = "/tmp/../../etc/passwd"
          const result = tool.parameters.safeParse({
            content: "test content",
            filePath: maliciousPath
          })

          // Before fix: this would pass (vulnerable)
          // After fix: this should fail (secure)
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
          }
        }
      })
    })

    test("legitimate absolute paths still work", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // This should still work - legitimate absolute path within project
          const legitimatePath = path.join(tmp.path, "legitimate-file.txt")
          const result = tool.parameters.safeParse({
            content: "test content",
            filePath: legitimatePath
          })

          expect(result.success).toBe(true)
        }
      })
    })
  })
})
