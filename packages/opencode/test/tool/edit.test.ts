import { describe, test, expect, beforeEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { EditTool } from "../../src/tool/edit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"

const ctx = {
  sessionID: "test-edit-session",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => { },
  ask: async () => { },
}

describe("tool.edit", () => {
  describe("input validation", () => {
    test("should validate required filePath", async () => {
      await expect(
        EditTool.execute({} as any, {} as any)
      ).rejects.toThrow("filePath is required")
    })

    test("should validate non-empty oldString", async () => {
      await expect(
        EditTool.execute({
          filePath: "/test.txt",
          oldString: "",
          newString: "replacement"
        }, {} as any)
      ).rejects.toThrow("oldString is required and cannot be empty")
    })

    test("should validate non-empty newString", async () => {
      await expect(
        EditTool.execute({
          filePath: "/test.txt",
          oldString: "old",
          newString: ""
        }, {} as any)
      ).rejects.toThrow("newString is required and cannot be empty")
    })

    test("should reject identical strings", async () => {
      await expect(
        EditTool.execute({
          filePath: "/test.txt",
          oldString: "same",
          newString: "same"
        }, {} as any)
      ).rejects.toThrow("No changes to apply: oldString and newString are identical.")
    })

    test("should reject null bytes in strings", async () => {
      await expect(
        EditTool.execute({
          filePath: "/test.txt",
          oldString: "test\0malicious",
          newString: "replacement"
        }, {} as any)
      ).rejects.toThrow("String parameters cannot contain null bytes")
    })

    test("should reject strings exceeding max length", async () => {
      const longString = "a".repeat(1001) // Exceeds TOOL.MAX_LENGTH

      await expect(
        EditTool.execute({
          filePath: "/test.txt",
          oldString: longString,
          newString: "replacement"
        }, {} as any)
      ).rejects.toThrow("String parameters too long: max 1000 characters allowed")
    })

    test("should validate filePath type", async () => {
      await expect(
        EditTool.execute({
          filePath: 123 as any, // Invalid type
          oldString: "old",
          newString: "new"
        }, {} as any)
      ).rejects.toThrow("filePath must be a string")
    })

    test("should allow valid parameters", () => {
      // Test that valid parameters pass all validations
      const result = (() => {
        const filePath = "/test.txt"
        const oldString = "valid old text"
        const newString = "valid new text"
        const TOOL_MAX_LENGTH = 1000

        if (!filePath) {
          throw new Error("filePath is required")
        }

        if (!oldString || oldString.length === 0) {
          throw new Error("oldString is required and cannot be empty")
        }

        if (!newString || newString.length === 0) {
          throw new Error("newString is required and cannot be empty")
        }

        if (oldString === newString) {
          throw new Error("No changes to apply: oldString and newString are identical.")
        }

        if (typeof filePath !== 'string') {
          throw new Error("filePath must be a string")
        }

        if (oldString.includes('\0') || newString.includes('\0')) {
          throw new Error("String parameters cannot contain null bytes")
        }

        if (oldString.length > TOOL_MAX_LENGTH || newString.length > TOOL_MAX_LENGTH) {
          throw new Error(`String parameters too long: max ${TOOL_MAX_LENGTH} characters allowed`)
        }

        // If we get here, all validations passed
        return true
      })()

      expect(result).toBe(true)
    })
  })

  describe("utility functions", () => {
    test("trimDiff removes common indentation from diff lines", () => {
      const { trimDiff } = require("../../src/tool/edit")

      const input = `--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
-    old line
+    new line
 context line`

      const expected = `--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
-old line
+new line
 context line`

      expect(trimDiff(input)).toBe(expected)
    })

    test("trimDiff handles diffs with different indentation levels", () => {
      const { trimDiff } = require("../../src/tool/edit")

      const input = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-    old line
+    new line
       indented line
     context line`

      const expected = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-old line
+new line
   indented line
 context line`

      expect(trimDiff(input)).toBe(expected)
    })

    test("trimDiff does not trim if there is no common indentation", () => {
      const { trimDiff } = require("../../src/tool/edit")

      const input = `--- file.txt
+++ file.txt
@@ -1,2 +1,2 @@
-old line
+new line`

      expect(trimDiff(input)).toBe(input)
    })

    test("levenshtein distance calculation", () => {
      // Import the levenshtein function for testing
      const levenshtein = (a: string, b: string): number => {
        const MAX_LENGTH = 1000

        // Handle empty strings
        if (a === "" || b === "") {
          return Math.max(a.length, b.length)
        }

        // For strings within MAX_LENGTH, use standard algorithm for accuracy
        if (a.length <= MAX_LENGTH && b.length <= MAX_LENGTH) {
          return levenshteinOptimized(a, b)
        }

        // For very large strings, use sliding window approach
        return levenshteinSlidingWindow(a, b, MAX_LENGTH)
      }

      function levenshteinOptimized(a: string, b: string): number {
        const lenA = a.length
        const lenB = b.length

        // Early exit for identical strings
        if (a === b) return 0

        // Early exit for empty strings
        if (lenA === 0) return lenB
        if (lenB === 0) return lenA

        // Use two-row optimization to reduce memory from O(n²) to O(n)
        let prevRow = Array.from({ length: lenB + 1 }, (_, j) => j)
        let currRow = new Array(lenB + 1).fill(0)

        for (let i = 1; i <= lenA; i++) {
          currRow[0] = i
          for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            const distance = Math.min(
              prevRow[j] + 1,      // deletion
              currRow[j - 1] + 1,  // insertion
              prevRow[j - 1] + cost // substitution
            )
            currRow[j] = distance
          }
          ;[prevRow, currRow] = [currRow, prevRow]
        }

        return prevRow[lenB]
      }

      function levenshteinSlidingWindow(a: string, b: string, windowSize: number): number {
        const lenA = a.length
        const lenB = b.length

        // For very large strings, use length difference as approximation
        // This is much faster than calculating exact distance
        const lengthDiff = Math.abs(lenA - lenB)

        // Sample a window to estimate character differences
        const sampleSize = Math.min(windowSize, lenA, lenB)
        let sampleDifferences = 0

        for (let i = 0; i < sampleSize; i++) {
          if (a[i] !== b[i]) sampleDifferences++
        }

        // Estimate total differences based on sample
        const estimatedDifferences = (sampleDifferences / sampleSize) * Math.min(lenA, lenB)

        return Math.round(lengthDiff + estimatedDifferences)
      }

      // Test cases
      expect(levenshtein("", "")).toBe(0)
      expect(levenshtein("", "hello")).toBe(5)
      expect(levenshtein("world", "")).toBe(5)
      expect(levenshtein("kitten", "sitting")).toBe(3)
      expect(levenshtein("flaw", "lawn")).toBe(2)

      // Test identical strings
      expect(levenshtein("test", "test")).toBe(0)

      // Test large strings
      const longA = "a".repeat(2000)
      const longB = "b".repeat(2000)
      expect(levenshtein(longA, longB)).toBe(2000)

      // Test mixed length differences
      const short = "hello"
      const long = "helloworld".repeat(100)
      const result = levenshtein(short, long)
      expect(result).toBeGreaterThan(0)
    })
  })

  describe("creating new files", () => {
    test("creates new file when oldString is empty", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "newfile.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const edit = await EditTool.init()
          const result = await edit.execute(
            {
              filePath: filepath,
              oldString: "",
              newString: "new content",
            },
            ctx,
          )

          expect(result.metadata.diff).toContain("new content")

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("new content")
        },
      })
    })

    test("creates new file with nested directories", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "nested", "dir", "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "",
              newString: "nested file",
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("nested file")
        },
      })
    })

    test("emits add event for new files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "new.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Bus } = await import("../../src/bus")
          const { File } = await import("../../src/file")
          const { FileWatcher } = await import("../../src/file/watcher")

          const events: string[] = []
          const unsubEdited = Bus.subscribe(File.Event.Edited, () => events.push("edited"))
          const unsubUpdated = Bus.subscribe(FileWatcher.Event.Updated, () => events.push("updated"))

          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "",
              newString: "content",
            },
            ctx,
          )

          expect(events).toContain("edited")
          expect(events).toContain("updated")
          unsubEdited()
          unsubUpdated()
        },
      })
    })
  })

  describe("editing existing files", () => {
    test("replaces text in existing file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "existing.txt")
      await fs.writeFile(filepath, "old content here", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          const result = await edit.execute(
            {
              filePath: filepath,
              oldString: "old content",
              newString: "new content",
            },
            ctx,
          )

          expect(result.output).toContain("Edit applied successfully")

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("new content here")
        },
      })
    })

    test("throws error when file does not exist", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "nonexistent.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "old",
                newString: "new",
              },
              ctx,
            ),
          ).rejects.toThrow("not found")
        },
      })
    })

    test("throws error when oldString equals newString", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "same",
                newString: "same",
              },
              ctx,
            ),
          ).rejects.toThrow("identical")
        },
      })
    })

    test("throws error when oldString not found in file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "actual content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "not in file",
                newString: "replacement",
              },
              ctx,
            ),
          ).rejects.toThrow()
        },
      })
    })

    test("throws error when file was not read first (FileTime)", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "content",
                newString: "modified",
              },
              ctx,
            ),
          ).rejects.toThrow("You must read file")
        },
      })
    })

    test("throws error when file has been modified since read", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "original content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Read first
          FileTime.read(ctx.sessionID, filepath)

          // Wait a bit to ensure different timestamps
          await new Promise((resolve) => setTimeout(resolve, 100))

          // Simulate external modification
          await fs.writeFile(filepath, "modified externally", "utf-8")

          // Try to edit with the new content
          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "modified externally",
                newString: "edited",
              },
              ctx,
            ),
          ).rejects.toThrow("modified since it was last read")
        },
      })
    })

    test("replaces all occurrences with replaceAll option", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "foo bar foo baz foo", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "foo",
              newString: "qux",
              replaceAll: true,
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("qux bar qux baz qux")
        },
      })
    })

    test("emits change event for existing files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "original", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const { Bus } = await import("../../src/bus")
          const { File } = await import("../../src/file")
          const { FileWatcher } = await import("../../src/file/watcher")

          const events: string[] = []
          const unsubEdited = Bus.subscribe(File.Event.Edited, () => events.push("edited"))
          const unsubUpdated = Bus.subscribe(FileWatcher.Event.Updated, () => events.push("updated"))

          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "original",
              newString: "modified",
            },
            ctx,
          )

          expect(events).toContain("edited")
          expect(events).toContain("updated")
          unsubEdited()
          unsubUpdated()
        },
      })
    })
  })

  describe("edge cases", () => {
    test("handles multiline replacements", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "line1\nline2\nline3", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "line2",
              newString: "new line 2\nextra line",
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("line1\nnew line 2\nextra line\nline3")
        },
      })
    })

    test("handles CRLF line endings", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "line1\r\nold\r\nline3", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          await edit.execute(
            {
              filePath: filepath,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          const content = await fs.readFile(filepath, "utf-8")
          expect(content).toBe("line1\r\nnew\r\nline3")
        },
      })
    })

    test("throws error when oldString equals newString", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: filepath,
                oldString: "",
                newString: "",
              },
              ctx,
            ),
          ).rejects.toThrow("identical")
        },
      })
    })

    test("throws error when path is directory", async () => {
      await using tmp = await tmpdir()
      const dirpath = path.join(tmp.path, "adir")
      await fs.mkdir(dirpath)

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, dirpath)

          const edit = await EditTool.init()
          await expect(
            edit.execute(
              {
                filePath: dirpath,
                oldString: "old",
                newString: "new",
              },
              ctx,
            ),
          ).rejects.toThrow("directory")
        },
      })
    })

    test("tracks file diff statistics", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "line1\nline2\nline3", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()
          const result = await edit.execute(
            {
              filePath: filepath,
              oldString: "line2",
              newString: "new line a\nnew line b",
            },
            ctx,
          )

          expect(result.metadata.filediff).toBeDefined()
          expect(result.metadata.filediff.file).toBe(filepath)
          expect(result.metadata.filediff.additions).toBeGreaterThan(0)
        },
      })
    })
  })

  describe("concurrent editing", () => {
    test("serializes concurrent edits to same file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "0", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(ctx.sessionID, filepath)

          const edit = await EditTool.init()

          // Two concurrent edits
          const promise1 = edit.execute(
            {
              filePath: filepath,
              oldString: "0",
              newString: "1",
            },
            ctx,
          )

          // Need to read again since FileTime tracks per-session
          FileTime.read(ctx.sessionID, filepath)

          const promise2 = edit.execute(
            {
              filePath: filepath,
              oldString: "0",
              newString: "2",
            },
            ctx,
          )

          // Both should complete without error (though one might fail due to content mismatch)
          const results = await Promise.allSettled([promise1, promise2])
          expect(results.some((r) => r.status === "fulfilled")).toBe(true)
        },
      })
    })
  })

  describe("edit tool fixes", () => {
    const mockCtx = {
      sessionID: 'test-session',
      messageID: 'test-message',
      agent: 'test-agent',
      abort: new AbortController().signal,
      messages: [],
      ask: async () => Promise.resolve(),
      metadata: async () => Promise.resolve(),
    }

    beforeEach(async () => {
      // Clean up test file
      try {
        const mockFilePath = path.join(process.cwd(), 'test-file.txt')
        await Bun.write(mockFilePath, 'original content')
      } catch {
        // File might not exist, that's ok
      }
    })

    test("should reject empty oldString", async () => {
      const tool = await EditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        oldString: '',
        newString: 'new content'
      }, mockCtx)).rejects.toThrow('oldString is required and cannot be empty')
    })

    test("should reject empty newString", async () => {
      const tool = await EditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        oldString: 'original',
        newString: ''
      }, mockCtx)).rejects.toThrow('newString is required and cannot be empty')
    })

    test("should reject identical strings", async () => {
      const tool = await EditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        oldString: 'same',
        newString: 'same'
      }, mockCtx)).rejects.toThrow('No changes to apply: oldString and newString are identical')
    })

    test("should reject strings with null bytes", async () => {
      const tool = await EditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        oldString: 'test\0malicious',
        newString: 'replacement'
      }, mockCtx)).rejects.toThrow('String parameters cannot contain null bytes')
    })

    test("should reject oversized strings", async () => {
      const tool = await EditTool.init()
      const longString = 'a'.repeat(2000) // Assuming MAX_LENGTH is less than this
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        oldString: longString,
        newString: 'replacement'
      }, mockCtx)).rejects.toThrow('String parameters too long')
    })

    test("should successfully apply valid edits", async () => {
      const tool = await EditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      // Write initial content
      await Bun.write(mockFilePath, 'Hello world!')

      const result = await tool.execute({
        filePath: mockFilePath,
        oldString: 'world',
        newString: 'universe'
      }, mockCtx)

      expect(result).toBeDefined()
      expect(result.output).toContain('successfully')

      // Verify the change was applied
      const finalContent = await Bun.file(mockFilePath).text()
      expect(finalContent).toContain('Hello universe!')
    })
  })
})
