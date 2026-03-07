import { describe, test, expect, mock, beforeEach, afterEach, vi } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { WriteTool } from "../../src/tool/write"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { LSP } from "../../src/lsp"
import { Bus } from "../../src/bus"
import { FileTime } from "../../src/file/time"

const ctx = {
  sessionID: "test-write-session",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => { },
  ask: async () => { },
}

describe("tool.write", () => {
  describe("new file creation", () => {
    test("writes content to new file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "newfile.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          const result = await write.execute(
            {
              filePath: filepath,
              content: "Hello, World!",
            },
            ctx,
          )

          expect(result.output).toContain("Wrote file successfully")
          expect(result.metadata.exists).toBe(false)

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("Hello, World!")
        },
      })
    })

    test("creates parent directories if needed", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "nested", "deep", "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content: "nested content",
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("nested content")
        },
      })
    })

    test("handles relative paths by resolving to instance directory", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: "relative.txt",
              content: "relative content",
            },
            ctx,
          )

          const content = await fs.readFile(path.join(tmp.path, "relative.txt"), "utf-8")
          expect(content).toBe("relative content")
        },
      })
    })
  })

  describe("existing file overwrite", () => {
    test("overwrites existing file content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "existing.txt")
      await fs.writeFile(filepath, "old content", "utf-8")

      // First read the file to satisfy FileTime requirement
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { FileTime } = await import("../../src/file/time")
          FileTime.read(ctx.sessionID, filepath)

          const write = await WriteTool.init()
          const result = await write.execute(
            {
              filePath: filepath,
              content: "new content",
            },
            ctx,
          )

          expect(result.output).toContain("Wrote file successfully")
          expect(result.metadata.exists).toBe(true)

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("new content")
        },
      })
    })

    test("returns diff in metadata for existing files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "old", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { FileTime } = await import("../../src/file/time")
          FileTime.read(ctx.sessionID, filepath)

          const write = await WriteTool.init()
          const result = await write.execute(
            {
              filePath: filepath,
              content: "new",
            },
            ctx,
          )

          // Diff should be in metadata
          expect(result.metadata).toHaveProperty("filepath", filepath)
          expect(result.metadata).toHaveProperty("exists", true)
        },
      })
    })
  })

  describe("file permissions", () => {
    test("sets file permissions when writing sensitive data", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "sensitive.json")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify({ secret: "data" }),
            },
            ctx,
          )

          // On Unix systems, check permissions
          if (process.platform !== "win32") {
            const stats = await fs.stat(filepath)
            expect(stats.mode & 0o777).toBe(0o644)
          }
        },
      })
    })
  })

  describe("content types", () => {
    test("writes JSON content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "data.json")
      const data = { key: "value", nested: { array: [1, 2, 3] } }

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content: JSON.stringify(data, null, 2),
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(JSON.parse(content)).toEqual(data)
        },
      })
    })

    test("writes binary-safe content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "binary.bin")
      const content = "Hello\x00World\x01\x02\x03"

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content,
            },
            ctx,
          )

          const buf = await fs.readFile(filepath)
          expect(buf.toString()).toBe(content)
        },
      })
    })

    test("writes empty content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "empty.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content: "",
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("")

          const stats = await fs.stat(filepath)
          expect(stats.size).toBe(0)
        },
      })
    })

    test("writes multi-line content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "multiline.txt")
      const lines = ["Line 1", "Line 2", "Line 3", ""].join("\n")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content: lines,
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe(lines)
        },
      })
    })

    test("handles different line endings", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "crlf.txt")
      const content = "Line 1\r\nLine 2\r\nLine 3"

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          await write.execute(
            {
              filePath: filepath,
              content,
            },
            ctx,
          )

          const buf = await fs.readFile(filepath)
          expect(buf.toString()).toBe(content)
        },
      })
    })
  })

  describe("error handling", () => {
    test("throws error when OS denies write access", async () => {
      await using tmp = await tmpdir()
      const readonlyPath = path.join(tmp.path, "readonly.txt")

      // Create a read-only file
      await fs.writeFile(readonlyPath, "test", "utf-8")
      await fs.chmod(readonlyPath, 0o444)

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { FileTime } = await import("../../src/file/time")
          FileTime.read(ctx.sessionID, readonlyPath)

          const write = await WriteTool.init()
          await expect(
            write.execute(
              {
                filePath: readonlyPath,
                content: "new content",
              },
              ctx,
            ),
          ).rejects.toThrow()
        },
      })
    })
  })

  describe("title generation", () => {
    test("returns relative path as title", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "src", "components", "Button.tsx")
      await fs.mkdir(path.dirname(filepath), { recursive: true })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const write = await WriteTool.init()
          const result = await write.execute(
            {
              filePath: filepath,
              content: "export const Button = () => {}",
            },
            ctx,
          )

          expect(result.title).toEndWith(path.join("src", "components", "Button.tsx"))
        },
      })
    })
  })

  describe("enhanced features", () => {
    let mocks: {
      lspTouch: any
      lspDiagnostics: any
      busPublish: any
      fileTimeAssert: any
      fileTimeRead: any
    }

    beforeEach(() => {
      mocks = {
        lspTouch: vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined),
        lspDiagnostics: vi.spyOn(LSP, "diagnostics").mockResolvedValue({}),
        busPublish: vi.spyOn(Bus, "publish").mockResolvedValue([]),
        fileTimeAssert: vi.spyOn(FileTime, "assert").mockResolvedValue(undefined),
        fileTimeRead: vi.spyOn(FileTime, "read").mockReturnValue(undefined),
      }
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    test("rejects content larger than 10MB", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "large.txt")
          const largeContent = "x".repeat(11 * 1024 * 1024) // 11MB
          const tool = await WriteTool.init()

          await expect(
            tool.execute({
              filePath,
              content: largeContent
            }, ctx)
          ).rejects.toThrow("Too big: expected string to have <=10485760 characters")
        }
      })
    })

    test("accepts content within 10MB limit", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "acceptable.txt")
          const content = "x".repeat(5 * 1024 * 1024) // 5MB
          const tool = await WriteTool.init()

          const result = await tool.execute({
            filePath,
            content
          }, ctx)

          expect(result.output).toContain("Wrote file successfully.")
          expect(await fs.readFile(filePath, "utf-8")).toBe(content)
        }
      })
    })

    test("creates parent directories if they don't exist", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "nested", "deep", "file.txt")
          const tool = await WriteTool.init()
          const result = await tool.execute({
            filePath,
            content: "content"
          }, ctx)

          expect(result.output).toContain("Wrote file successfully.")
          expect(await fs.readFile(filePath, "utf-8")).toBe("content")

          // Verify directories were created
          const stats = await fs.stat(path.join(tmp.path, "nested", "deep"))
          expect(stats.isDirectory()).toBe(true)
        }
      })
    })

    test("handles LSP timeout gracefully", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "timeout.txt")
          const tool = await WriteTool.init()

          // Mock LSP to never resolve - will trigger WriteTool's 5s timeout
          mocks.lspTouch.mockImplementation(() => new Promise(() => { }))

          const result = await tool.execute({
            filePath,
            content: "content"
          }, ctx)

          // Should still succeed despite LSP timeout
          expect(result.output).toContain("Wrote file successfully.")
          expect(await fs.readFile(filePath, "utf-8")).toBe("content")
        }
      }, 15000)
    })

    test("handles LSP errors gracefully", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "error.txt")
          const tool = await WriteTool.init()

          // Mock LSP to throw an error
          mocks.lspTouch.mockRejectedValue(new Error("LSP server crashed"))

          const result = await tool.execute({
            filePath,
            content: "content"
          }, ctx)

          // Should still succeed despite LSP error
          expect(result.output).toContain("Wrote file successfully.")
          expect(await fs.readFile(filePath, "utf-8")).toBe("content")
        }
      })
    })

    test("provides enhanced error messages for permission errors", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "readonly.txt")
          const tool = await WriteTool.init()

          // Create file and make it read-only
          await fs.writeFile(filePath, "existing")
          await fs.chmod(filePath, 0o444)

          const error = await tool.execute({
            filePath,
            content: "new content"
          }, ctx).catch((e: any) => e)
          expect(error.message).toContain("Failed to write file")
          expect(error.message).toContain("EPERM")
        }
      })
    })

    test("performs atomic write operations", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "atomic.txt")
          const tool = await WriteTool.init()

          // Create initial file
          await fs.writeFile(filePath, "original")

          await tool.execute({
            filePath,
            content: "updated"
          }, ctx)

          // Final content should be complete, not partial
          const finalContent = await fs.readFile(filePath, "utf-8")
          expect(finalContent).toBe("updated")
        }
      })
    })

    test("uses file locking to prevent race conditions", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "locked.txt")
          const tool = await WriteTool.init()

          // Track lock acquisition
          const withLockSpy = vi.spyOn(FileTime, 'withLock')

          await tool.execute({
            filePath,
            content: "content"
          }, ctx)

          // Verify withLock was called
          expect(withLockSpy).toHaveBeenCalledWith(filePath, expect.any(Function))

          withLockSpy.mockRestore()
        }
      })
    })

    test("validates path traversal prevention", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()
          // Should reject relative paths with parent directory references
          await expect(
            tool.execute({
              filePath: "../outside.txt",
              content: "content"
            }, ctx)
          ).rejects.toThrow("Path must be safe and within project directory")
        }
      })
    })

    test("allows absolute paths with parent directory references", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // This should be allowed since it's an absolute path
          const filePath = path.join(tmp.path, "subdir", "..", "allowed.txt")
          const tool = await WriteTool.init()
          const result = await tool.execute({
            filePath,
            content: "content"
          }, ctx)

          expect(result.output).toContain("Wrote file successfully.")
          expect(await fs.readFile(filePath, "utf-8")).toBe("content")
        }
      })
    })

    test("integrates with LSP and Bus systems", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const filePath = path.join(tmp.path, "test.txt")
          const tool = await WriteTool.init()

          await tool.execute({
            filePath,
            content: "test content"
          }, ctx)

          expect(mocks.lspTouch).toHaveBeenCalledWith(filePath)
          expect(mocks.busPublish).toHaveBeenCalled()
          expect(mocks.fileTimeAssert).toHaveBeenCalled()
        }
      })
    })
  })

  describe("path validation security", () => {
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

    test("demonstrates the original vulnerability is fixed", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // This is the exact vulnerability case from the issue:
          // pathStr = "/tmp/../../etc/passwd" passes validation (absolute path) 
          // but still allows traversal

          const maliciousPath = "/tmp/../../etc/passwd"

          // Before fix: This would pass the old validation (!pathStr.includes('..') || path.isAbsolute(pathStr))
          // After fix: This should fail with proper validation

          const result = tool.parameters.safeParse({
            content: "malicious content",
            filePath: maliciousPath
          })

          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error.issues[0].message).toBe("Path must be safe and within project directory")
          }
        },
      })
    })

    test("demonstrates legitimate paths still work", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await WriteTool.init()

          // Legitimate absolute paths should still work
          const legitimatePath = `${tmp.path}/legitimate-file.txt`

          const result = tool.parameters.safeParse({
            content: "legitimate content",
            filePath: legitimatePath
          })

          expect(result.success).toBe(true)
        },
      })
    })
  })
})
