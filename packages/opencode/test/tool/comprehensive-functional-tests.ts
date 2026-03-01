import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { BashTool } from "../../src/tool/bash"
import { EditTool } from "../../src/tool/edit"
import { ReadTool } from "../../src/tool/read"
import { WriteTool } from "../../src/tool/write"
import { GlobTool } from "../../src/tool/glob"
import { GrepTool } from "../../src/tool/grep"
import { ListTool } from "../../src/tool/ls"
import { BatchTool } from "../../src/tool/batch"
import { MultiEditTool } from "../../src/tool/multiedit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

// Cross-platform test context
const createTestContext = () => ({
  sessionID: "test-session",
  messageID: "test-message",
  callID: "test-call",
  agent: "test-agent",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => { },
  ask: async () => { },
})

describe("Comprehensive Functional Tool Tests", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
  })

  test("BashTool - cross-platform command execution", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()

        // Test cross-platform echo
        const echoCmd = process.platform === 'win32' ? 'echo hello' : 'echo hello'
        const result = await bash.execute({
          command: echoCmd,
          description: "Echo test"
        }, ctx)

        expect(result.metadata.exit).toBe(0)
        expect(result.output).toContain("hello")
      }
    })
  })

  test("BashTool - file creation and verification", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        const testFile = path.join(testDir, "test.txt")

        // Create file using cross-platform commands
        const createCmd = process.platform === 'win32'
          ? `echo hello > "${testFile}"`
          : `echo hello > "${testFile}"`

        await bash.execute({
          command: createCmd,
          description: "Create test file"
        }, ctx)

        // Verify file exists
        const exists = await fs.access(testFile).then(() => true).catch(() => false)
        expect(exists).toBe(true)

        // Read content
        const content = await fs.readFile(testFile, 'utf-8')
        expect(content).toContain("hello")
      }
    })
  })

  test("EditTool - basic text replacement", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const edit = await EditTool.init()
        const testFile = path.join(testDir, "edit-test.txt")

        // Create initial file
        await fs.writeFile(testFile, "Hello world\nGoodbye world\n")

        const result = await edit.execute({
          filePath: testFile,
          oldString: "Hello world",
          newString: "Hello universe"
        }, ctx)

        expect(result.metadata.appliedEdits).toBe(1)

        // Verify change
        const content = await fs.readFile(testFile, 'utf-8')
        expect(content).toContain("Hello universe")
        expect(content).not.toContain("Hello world")
      }
    })
  })

  test("EditTool - multiple occurrences with occurrence parameter", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const edit = await EditTool.init()
        const testFile = path.join(testDir, "multi-occurrence.txt")

        // Create file with multiple occurrences
        await fs.writeFile(testFile, "test line 1\ntest line 2\ntest line 3\n")

        const result = await edit.execute({
          filePath: testFile,
          oldString: "test",
          newString: "TEST",
          occurrence: 2
        }, ctx)

        expect(result.metadata.appliedEdits).toBe(1)

        // Verify only second occurrence was changed
        const content = await fs.readFile(testFile, 'utf-8')
        const lines = content.split('\n')
        expect(lines[0]).toBe("test line 1")  // unchanged
        expect(lines[1]).toBe("TEST line 2")  // changed
        expect(lines[2]).toBe("test line 3")  // unchanged
      }
    })
  })

  test("ReadTool - file reading with offset and limit", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const read = await ReadTool.init()
        const testFile = path.join(testDir, "read-test.txt")

        // Create multi-line file
        const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`)
        await fs.writeFile(testFile, lines.join('\n'))

        const result = await read.execute({
          filePath: testFile,
          offset: 3,
          limit: 5
        }, ctx)

        const outputLines = result.output.trim().split('\n')
        expect(outputLines).toHaveLength(5)
        expect(outputLines[0]).toBe("Line 4")
        expect(outputLines[4]).toBe("Line 8")
      }
    })
  })

  test("WriteTool - file creation and overwriting", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const write = await WriteTool.init()
        const testFile = path.join(testDir, "write-test.txt")

        // Create initial file
        await write.execute({
          filePath: testFile,
          content: "Initial content"
        }, ctx)

        let content = await fs.readFile(testFile, 'utf-8')
        expect(content).toBe("Initial content")

        // Overwrite file
        await write.execute({
          filePath: testFile,
          content: "Updated content"
        }, ctx)

        content = await fs.readFile(testFile, 'utf-8')
        expect(content).toBe("Updated content")
      }
    })
  })

  test("GlobTool - pattern matching", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const glob = await GlobTool.init()

        // Create test files
        await fs.writeFile(path.join(testDir, "test1.js"), "content1")
        await fs.writeFile(path.join(testDir, "test2.ts"), "content2")
        await fs.writeFile(path.join(testDir, "test3.txt"), "content3")

        const result = await glob.execute({
          pattern: "*.js"
        }, ctx)

        expect(result.output).toContain("test1.js")
        expect(result.output).not.toContain("test2.ts")
        expect(result.output).not.toContain("test3.txt")
        expect(result.metadata.count).toBe(1)
      }
    })
  })

  test("GrepTool - content searching", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const grep = await GrepTool.init()

        // Create test files
        await fs.writeFile(path.join(testDir, "file1.js"), "function test() { console.log('hello'); }")
        await fs.writeFile(path.join(testDir, "file2.ts"), "function test() { console.log('world'); }")
        await fs.writeFile(path.join(testDir, "file3.txt"), "This is a test file")

        const result = await grep.execute({
          pattern: "function test"
        }, ctx)

        expect(result.output).toContain("file1.js")
        expect(result.output).toContain("file2.ts")
        expect(result.output).not.toContain("file3.txt")
        expect(result.metadata.matches).toBe(2)
      }
    })
  })

  test("ListTool - directory listing", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const list = await ListTool.init()

        // Create directory structure
        await fs.mkdir(path.join(testDir, "subdir"), { recursive: true })
        await fs.writeFile(path.join(testDir, "file1.txt"), "content1")
        await fs.writeFile(path.join(testDir, "subdir", "file2.txt"), "content2")

        const result = await list.execute({}, ctx)

        expect(result.output).toContain("file1.txt")
        expect(result.output).toContain("subdir/")
        expect(result.metadata.count).toBeGreaterThan(0)
      }
    })
  })

  test("BatchTool - concurrent execution", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const batch = await BatchTool.init()

        // Create test files
        await fs.writeFile(path.join(testDir, "batch1.txt"), "content1")
        await fs.writeFile(path.join(testDir, "batch2.txt"), "content2")
        await fs.writeFile(path.join(testDir, "batch3.txt"), "content3")

        const result = await batch.execute({
          tool_calls: [
            { tool: "read", parameters: { filePath: path.join(testDir, "batch1.txt") } },
            { tool: "read", parameters: { filePath: path.join(testDir, "batch2.txt") } },
            { tool: "read", parameters: { filePath: path.join(testDir, "batch3.txt") } }
          ]
        }, ctx)

        expect(result.results).toHaveLength(3)
        expect(result.results[0].output).toContain("content1")
        expect(result.results[1].output).toContain("content2")
        expect(result.results[2].output).toContain("content3")
      }
    })

    test("MultiEditTool - multiple file edits", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const multiedit = await MultiEditTool.init()

          // Create test files
          await fs.writeFile(path.join(testDir, "multi1.txt"), "Hello world")
          await fs.writeFile(path.join(testDir, "multi2.txt"), "Goodbye world")

          const result = await multiedit.execute({
            edits: [
              {
                filePath: path.join(testDir, "multi1.txt"),
                oldString: "Hello",
                newString: "Hi"
              },
              {
                filePath: path.join(testDir, "multi2.txt"),
                oldString: "Goodbye",
                newString: "Farewell"
              }
            ]
          }, ctx)

          expect(result.metadata.appliedEdits).toBe(2)
          const read = await ReadTool.init()

          // Test with different path formats
          const relativePath = "path-test.txt"
          const absolutePath = path.join(testDir, relativePath)

          // Create file using absolute path
          await fs.writeFile(absolutePath, "Test content")

          // Read using relative path
          const result1 = await read.execute({
            filePath: relativePath
          }, ctx)
          expect(result1.output).toContain("Test content")

          // Edit using absolute path - need to read first for file time tracking
          await read.execute({ filePath: absolutePath }, ctx)
          const result2 = await edit.execute({
            filePath: absolutePath,
            oldString: "Test",
            newString: "Updated"
          }, ctx)
          expect(result2.metadata.appliedEdits).toBe(1)

          // Verify change
          const content = await fs.readFile(absolutePath, 'utf-8')
          expect(content).toContain("Updated content")
        }
      })
    })

    test("Error handling and edge cases", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const read = await ReadTool.init()
          const edit = await EditTool.init()

          // Test reading non-existent file
          await expect(read.execute({
            filePath: "non-existent.txt"
          }, ctx)).rejects.toThrow()

          // Test editing non-existent file
          await expect(edit.execute({
            filePath: "non-existent.txt",
            oldString: "test",
            newString: "test"
          }, ctx)).rejects.toThrow()

          // Test editing with non-existent oldString
          const testFile = path.join(testDir, "edge-case.txt")
          await fs.writeFile(testFile, "Hello world")

          // Need to read first for file time tracking
          await read.execute({ filePath: testFile }, ctx)

          const result = await edit.execute({
            filePath: testFile,
            oldString: "non-existent",
            newString: "replacement"
          }, ctx)

          expect(result.metadata.appliedEdits).toBe(0)
          expect(result.metadata.failedEdits).toBe(1)
        }
      })
    })
