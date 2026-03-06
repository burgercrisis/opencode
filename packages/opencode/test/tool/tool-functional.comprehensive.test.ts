// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
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
  metadata: () => {},
  ask: async () => {},
})

const setupTestDir = async () => {
  const tmp = await tmpdir({ git: true })
  const testDir = tmp.path
  return { tmp, testDir }
}

describe("Tool Functional Tests - Comprehensive", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>
  let tmp: any

  beforeAll(async () => {
    const setup = await setupTestDir()
    testDir = setup.testDir
    tmp = setup.tmp
    ctx = createTestContext()
  })

  afterAll(async () => {
    if (tmp) {
      await tmp.cleanup()
    }
  })

  describe("Basic Tool Operations", () => {
    bulletproofTest("should read and write files correctly", async () => {
      const testFile = path.join(testDir, "test.txt")
      const content = "Hello, World!"

      // Write file
      const writeTool = new WriteTool()
      const writeResult = await writeTool.execute({
        filePath: testFile,
        content,
        ...ctx
      })
      expect(writeResult.success).toBe(true)

      // Read file
      const readTool = new ReadTool()
      const readResult = await readTool.execute({
        filePath: testFile,
        ...ctx
      })
      expect(readResult.success).toBe(true)
      expect(readResult.data).toBe(content)
    })

    bulletproofTest("should list directory contents", async () => {
      const listTool = new ListTool()
      const result = await listTool.execute({
        directory: testDir,
        ...ctx
      })
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    bulletproofTest("should use glob patterns correctly", async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, "test1.txt"), "content1")
      await fs.writeFile(path.join(testDir, "test2.txt"), "content2")
      await fs.writeFile(path.join(testDir, "other.md"), "markdown")

      const globTool = new GlobTool()
      const result = await globTool.execute({
        pattern: "*.txt",
        directory: testDir,
        ...ctx
      })
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data.every((f: any) => f.endsWith('.txt'))).toBe(true)
    })
  })

  describe("Edit Operations", () => {
    bulletproofTest("should edit files with simple replacements", async () => {
      const testFile = path.join(testDir, "edit-test.txt")
      const originalContent = "Hello World"
      const newContent = "Hello Universe"

      await fs.writeFile(testFile, originalContent)

      const editTool = new EditTool()
      const result = await editTool.execute({
        filePath: testFile,
        oldString: "World",
        newString: "Universe",
        ...ctx
      })

      expect(result.success).toBe(true)
      
      // Verify the change
      const updatedContent = await fs.readFile(testFile, 'utf-8')
      expect(updatedContent).toBe(newContent)
    })

    bulletproofTest("should handle multi-edit operations", async () => {
      const testFile = path.join(testDir, "multi-edit.txt")
      const originalContent = "apple banana cherry date"

      await fs.writeFile(testFile, originalContent)

      const multiEditTool = new MultiEditTool()
      const result = await multiEditTool.execute({
        filePath: testFile,
        edits: [
          { oldString: "apple", newString: "apricot" },
          { oldString: "banana", newString: "blueberry" },
          { oldString: "cherry", newString: "cranberry" }
        ],
        ...ctx
      })

      expect(result.success).toBe(true)
      
      // Verify all changes
      const updatedContent = await fs.readFile(testFile, 'utf-8')
      expect(updatedContent).toBe("apricot blueberry cranberry date")
    })
  })

  describe("Batch Operations", () => {
    bulletproofTest("should execute multiple tools in batch", async () => {
      // Create test files
      const file1 = path.join(testDir, "batch1.txt")
      const file2 = path.join(testDir, "batch2.txt")
      
      await fs.writeFile(file1, "content1")
      await fs.writeFile(file2, "content2")

      const batchTool = new BatchTool()
      const result = await batchTool.execute({
        tool_calls: [
          {
            tool: "ls",
            arguments: { directory: testDir }
          },
          {
            tool: "read",
            arguments: { filePath: file1 }
          },
          {
            tool: "read", 
            arguments: { filePath: file2 }
          }
        ],
        ...ctx
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(3)
      
      // Verify results
      expect(result.data[0].success).toBe(true) // ls
      expect(result.data[1].success).toBe(true) // read file1
      expect(result.data[2].success).toBe(true) // read file2
    })

    bulletproofTest("should handle batch failures gracefully", async () => {
      const batchTool = new BatchTool()
      const result = await batchTool.execute({
        tool_calls: [
          {
            tool: "ls",
            arguments: { directory: testDir }
          },
          {
            tool: "read",
            arguments: { filePath: "/non/existent/file.txt" }
          }
        ],
        ...ctx
      })

      expect(result.success).toBe(true) // Batch succeeds even if individual tools fail
      expect(result.data).toHaveLength(2)
      expect(result.data[0].success).toBe(true) // ls should succeed
      expect(result.data[1].success).toBe(false) // read should fail
    })
  })

  describe("Cross-Platform Compatibility", () => {
    bulletproofTest("should handle environment variables correctly", async () => {
      const bashTool = new BashTool()
      
      // Test environment variable setting and usage
      const testVar = "TEST_VALUE_123"
      
      if (process.platform === 'win32') {
        // Windows PowerShell
        const result = await bashTool.execute({
          command: `$env:TEST_VAR="${testVar}"; echo $env:TEST_VAR`,
          ...ctx
        })
        expect(result.success).toBe(true)
        expect(result.data.trim()).toBe(testVar)
      } else {
        // Unix/bash
        const result = await bashTool.execute({
          command: `TEST_VAR="${testVar}" && echo $TEST_VAR`,
          ...ctx
        })
        expect(result.success).toBe(true)
        expect(result.data.trim()).toBe(testVar)
      }
    })

    bulletproofTest("should handle path operations across platforms", async () => {
      const testFile = path.join(testDir, "path-test.txt")
      const content = "Path test content"
      
      await fs.writeFile(testFile, content)
      
      // Test reading with different path formats
      const readTool = new ReadTool()
      const result = await readTool.execute({
        filePath: testFile,
        ...ctx
      })
      
      expect(result.success).toBe(true)
      expect(result.data).toBe(content)
      
      // Test with relative path
      const relativeResult = await readTool.execute({
        filePath: path.relative(process.cwd(), testFile),
        ...ctx
      })
      
      expect(relativeResult.success).toBe(true)
      expect(relativeResult.data).toBe(content)
    })

    bulletproofTest("should handle command execution across platforms", async () => {
      const bashTool = new BashTool()
      
      // Test basic command that works on all platforms
      const result = await bashTool.execute({
        command: process.platform === 'win32' ? 'echo "Windows test"' : 'echo "Unix test"',
        ...ctx
      })
      
      expect(result.success).toBe(true)
      if (process.platform === 'win32') {
        expect(result.data.trim()).toBe("Windows test")
      } else {
        expect(result.data.trim()).toBe("Unix test")
      }
    })
  })

  describe("Error Handling", () => {
    bulletproofTest("should handle file not found errors", async () => {
      const readTool = new ReadTool()
      const result = await readTool.execute({
        filePath: "/non/existent/path/file.txt",
        ...ctx
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    bulletproofTest("should handle permission errors gracefully", async () => {
      const editTool = new EditTool()
      
      // Try to edit a file that doesn't exist (should fail gracefully)
      const result = await editTool.execute({
        filePath: "/root/protected/file.txt",
        oldString: "old",
        newString: "new",
        ...ctx
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    bulletproofTest("should handle invalid tool parameters", async () => {
      const writeTool = new WriteTool()
      
      // Test with invalid parameters
      const result = await writeTool.execute({
        filePath: "", // Empty path
        content: "test",
        ...ctx
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe("Performance and Stress Testing", () => {
    bulletproofTest("should handle large file operations", async () => {
      const largeFile = path.join(testDir, "large.txt")
      const largeContent = "x".repeat(10000) // 10KB
      
      // Write large file
      const writeTool = new WriteTool()
      const writeResult = await writeTool.execute({
        filePath: largeFile,
        content: largeContent,
        ...ctx
      })
      
      expect(writeResult.success).toBe(true)
      
      // Read large file
      const readTool = new ReadTool()
      const readResult = await readTool.execute({
        filePath: largeFile,
        ...ctx
      })
      
      expect(readResult.success).toBe(true)
      expect(readResult.data).toBe(largeContent)
    }, 30000) // 30 second timeout

    bulletproofTest("should handle multiple concurrent operations", async () => {
      const operations = []
      
      // Create multiple files concurrently
      for (let i = 0; i < 10; i++) {
        const file = path.join(testDir, `concurrent-${i}.txt`)
        const content = `content ${i}`
        
        operations.push(
          new WriteTool().execute({
            filePath: file,
            content,
            ...ctx
          })
        )
      }
      
      const results = await Promise.all(operations)
      
      // All operations should succeed
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
      
      // Verify all files were created
      for (let i = 0; i < 10; i++) {
        const file = path.join(testDir, `concurrent-${i}.txt`)
        const exists = await fs.access(file).then(() => true).catch(() => false)
        expect(exists).toBe(true)
      }
    })

    bulletproofTest("should handle batch operations efficiently", async () => {
      const batchTool = new BatchTool()
      
      // Create a large batch operation
      const toolCalls = []
      for (let i = 0; i < 50; i++) {
        toolCalls.push({
          tool: "ls",
          arguments: { directory: testDir }
        })
      }
      
      const startTime = Date.now()
      const result = await batchTool.execute({
        tool_calls,
        ...ctx
      })
      const endTime = Date.now()
      
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(50)
      
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(10000) // 10 seconds
    })
  })

  describe("Integration Tests", () => {
    bulletproofTest("should handle complex workflow scenarios", async () => {
      // Create a complex workflow: create -> read -> edit -> read -> verify
      const testFile = path.join(testDir, "workflow.txt")
      const originalContent = "Step 1: Initial content"
      const editedContent = "Step 2: Edited content"
      
      // Step 1: Create file
      const writeTool = new WriteTool()
      const writeResult = await writeTool.execute({
        filePath: testFile,
        content: originalContent,
        ...ctx
      })
      expect(writeResult.success).toBe(true)
      
      // Step 2: Read file
      const readTool = new ReadTool()
      const readResult = await readTool.execute({
        filePath: testFile,
        ...ctx
      })
      expect(readResult.success).toBe(true)
      expect(readResult.data).toBe(originalContent)
      
      // Step 3: Edit file
      const editTool = new EditTool()
      const editResult = await editTool.execute({
        filePath: testFile,
        oldString: "Initial content",
        newString: "Edited content",
        ...ctx
      })
      expect(editResult.success).toBe(true)
      
      // Step 4: Verify final content
      const finalReadResult = await readTool.execute({
        filePath: testFile,
        ...ctx
      })
      expect(finalReadResult.success).toBe(true)
      expect(finalReadResult.data).toBe(editedContent)
    })

    bulletproofTest("should handle tool chaining correctly", async () => {
      // Create files, then list them, then read them
      const files = ['chain1.txt', 'chain2.txt', 'chain3.txt']
      const contents = ['content1', 'content2', 'content3']
      
      // Create files
      for (let i = 0; i < files.length; i++) {
        const writeTool = new WriteTool()
        await writeTool.execute({
          filePath: path.join(testDir, files[i]),
          content: contents[i],
          ...ctx
        })
      }
      
      // List directory
      const listTool = new ListTool()
      const listResult = await listTool.execute({
        directory: testDir,
        ...ctx
      })
      expect(listResult.success).toBe(true)
      
      // Read each file found
      const readTool = new ReadTool()
      for (const file of listResult.data) {
        if (files.includes((file as any).name)) {
          const readResult = await readTool.execute({
            filePath: path.join(testDir, (file as any).name),
            ...ctx
          })
          expect(readResult.success).toBe(true)
          expect(contents).toContain(readResult.data)
        }
      }
    })
  })
})
