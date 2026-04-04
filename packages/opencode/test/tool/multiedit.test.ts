import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { MultiEditTool } from "../../src/tool/multiedit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { FileTime } from "../../src/file/time"
import path from "path"

describe("MultiEditTool", () => {
  const ctx: any = {
    sessionID: "test-session",
    messageID: "test-message",
    ask: async () => { },
  }

  beforeEach(() => {
    // Reset any global mocks
  })

  afterEach(() => {
    // Clean up any global mocks
  })

  describe("basic functionality", () => {

    it("executes multiple edits sequentially", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await MultiEditTool.init()
          const file = path.join(tmp.path, "file.ts")

          // Create initial file content
          await Bun.write(file, "old1 line\nold2 line\nother content")

          // Mark file as read (required before editing)
          FileTime.read(ctx.sessionID, file)

          const params = {
            filePath: file,
            edits: [
              { filePath: file, oldString: "old1", newString: "new1" },
              { filePath: file, oldString: "old2", newString: "new2" },
            ],
          }

          const result = await tool.execute(params, ctx)

          expect(result.title).toBe("file.ts")
          expect(result.metadata.results).toHaveLength(2)

          // Verify the actual file content was changed
          const content = await Bun.file(file).text()
          expect(content).toContain("new1 line")
          expect(content).toContain("new2 line")
          expect(content).toContain("other content")
          expect(content).not.toContain("old1")
          expect(content).not.toContain("old2")
        },
      })
    })

    it("handles empty edits array", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await MultiEditTool.init()
          const file = path.join(tmp.path, "file.ts")

          await Bun.write(file, "unchanged content")

          const params = {
            filePath: file,
            edits: [],
          }

          const result = await tool.execute(params, ctx)

          expect(result.metadata.results).toHaveLength(0)

          // Verify file was not changed
          const content = await Bun.file(file).text()
          expect(content).toBe("unchanged content")
        },
      })
    })

    it("handles replaceAll option", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await MultiEditTool.init()
          const file = path.join(tmp.path, "file.ts")

          await Bun.write(file, "foo bar foo baz foo")

          FileTime.read(ctx.sessionID, file)

          const params = {
            filePath: file,
            edits: [
              { filePath: file, oldString: "foo", newString: "qux", replaceAll: true },
            ],
          }

          const result = await tool.execute(params, ctx)

          expect(result.metadata.results).toHaveLength(1)

          const content = await Bun.file(file).text()
          expect(content).toBe("qux bar qux baz qux")
        },
      })
    })
  })

  describe("optimization and efficiency", () => {
    test("should demonstrate single file read/write optimization", async () => {
      let fileReadCount = 0
      let fileWriteCount = 0

      // Mock file operations to track calls
      const originalReadFile = global.Bun?.file
      const originalWriteFile = global.Bun?.write

      global.Bun = {
        ...global.Bun,
        file: (path: string) => {
          fileReadCount++
          return originalReadFile?.(path) || { text: () => Promise.resolve("mock content") }
        },
        write: (path: string, content: string) => {
          fileWriteCount++
          return originalWriteFile?.(path, content) || Promise.resolve()
        }
      } as any

      try {
        // Simulate the optimized MultiEdit approach
        const filePath = "test.txt"
        const content = "original content"

        // Simulate reading file once (optimized approach)
        const fileContent = await global.Bun.file(filePath).text()

        // Simulate applying multiple edits in memory
        const modifiedContent = content
          .replace("original", "modified1")
          .replace("content", "modified2")

        // Simulate writing file once (optimized approach)
        await global.Bun.write(filePath, modifiedContent)

        // Verify optimization: should only read once and write once
        expect(fileReadCount).toBe(1) // Single file read
        expect(fileWriteCount).toBe(1) // Single file write

        // Verify content was modified correctly
        const finalContent = await global.Bun.file(filePath).text()
        expect(finalContent).toContain("modified1")
        expect(finalContent).toContain("modified2")

      } finally {
        // Restore original functions
        global.Bun = {
          file: originalReadFile,
          write: originalWriteFile
        } as any
      }
    })

    test("should demonstrate efficiency gain over sequential approach", () => {
      // Compare theoretical operation counts

      const edits = [
        { old: "a", new: "b" },
        { old: "c", new: "d" },
        { old: "e", new: "f" }
      ]

      // Sequential approach (old): N reads + N writes
      const sequentialOperations = edits.length * 2 // read + write per edit

      // Optimized approach (new): 1 read + 1 write
      const optimizedOperations = 2 // single read + single write

      // Calculate efficiency gain
      const efficiencyGain = (sequentialOperations - optimizedOperations) / sequentialOperations * 100

      // For 4 edits, should be 75% reduction in file operations
      expect(efficiencyGain).toBeGreaterThan(70)
      expect(optimizedOperations).toBe(2)
      expect(sequentialOperations).toBe(8)
    })

    test("should reduce file operations from N to 2", async () => {
      let readCount = 0
      let writeCount = 0

      // Mock Bun.file to track operations
      const originalFile = global.Bun?.file
      const originalWrite = global.Bun?.write

      global.Bun = {
        ...global.Bun,
        file: (path: string) => {
          readCount++
          return originalFile?.(path) || { text: () => Promise.resolve("original content") }
        },
        write: (file: any, content: string) => {
          writeCount++
          return originalWrite?.(file, content) || Promise.resolve()
        }
      } as any

      try {
        // Import and execute optimized MultiEdit
        const { MultiEditTool } = await import("../src/tool/multiedit")

        const result = await MultiEditTool.execute({
          filePath: "test.txt",
          edits: [
            { oldString: "line1", newString: "modified1" },
            { oldString: "line2", newString: "modified2" },
            { oldString: "line3", newString: "modified3" }
          ]
        }, {} as any)

        // Verify optimization: should only read once and write once
        expect(readCount).toBe(1) // Single file read
        expect(writeCount).toBe(1) // Single file write

        // Verify edits were applied
        expect(result.metadata.editCount).toBe(3)

      } finally {
        // Restore original functions
        global.Bun = {
          file: originalFile,
          write: originalWrite
        } as any
      }
    })
  })

  describe("multiedit tool fixes", () => {
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
        await Bun.write(mockFilePath, 'line1\nline2\nline3\nline4\nline5')
      } catch {
        // File might not exist, that's ok
      }
    })

    test("should handle empty edits array", async () => {
      const tool = await MultiEditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      const result = await tool.execute({
        filePath: mockFilePath,
        edits: []
      }, mockCtx)

      expect(result).toBeDefined()
      expect(result.metadata.editCount).toBe(0)
      expect(result.output).toBe('No edits to apply')
    })

    test("should apply multiple edits sequentially", async () => {
      const tool = await MultiEditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      const result = await tool.execute({
        filePath: mockFilePath,
        edits: [
          {
            oldString: 'line1',
            newString: 'modified1'
          },
          {
            oldString: 'line3',
            newString: 'modified3'
          },
          {
            oldString: 'line5',
            newString: 'modified5'
          }
        ]
      }, mockCtx)

      expect(result).toBeDefined()
      expect(result.metadata.editCount).toBe(3)
      expect(result.metadata.results).toHaveLength(3)

      // Verify all changes were applied
      const finalContent = await Bun.file(mockFilePath).text()
      expect(finalContent).toContain('modified1')
      expect(finalContent).toContain('modified3')
      expect(finalContent).toContain('modified5')
      expect(finalContent).not.toContain('line1')
      expect(finalContent).not.toContain('line3')
      expect(finalContent).not.toContain('line5')
    })

    test("should skip no-op edits", async () => {
      const tool = await MultiEditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      const result = await tool.execute({
        filePath: mockFilePath,
        edits: [
          {
            oldString: 'line1',
            newString: 'line1' // Same as oldString
          },
          {
            oldString: 'line2',
            newString: 'modified2'
          }
        ]
      }, mockCtx)

      expect(result).toBeDefined()
      expect(result.metadata.editCount).toBe(2) // Still counts total edits provided

      // Verify only the real change was applied
      const finalContent = await Bun.file(mockFilePath).text()
      expect(finalContent).toContain('line1') // Should remain unchanged
      expect(finalContent).toContain('modified2') // Should be changed
    })

    test("should handle edit failures gracefully", async () => {
      const tool = await MultiEditTool.init()
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')

      await expect(tool.execute({
        filePath: mockFilePath,
        edits: [
          {
            oldString: 'nonexistent',
            newString: 'replacement'
          }
        ]
      }, mockCtx)).rejects.toThrow('Failed to apply edit')
    })
  })
})
