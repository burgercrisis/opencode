import { describe, expect, test, beforeAll } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { BashTool } from "../../src/tool/bash"
import { GrepTool } from "../../src/tool/grep"
import { GlobTool } from "../../src/tool/glob"
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

describe("Cross-Platform Tool Tests - Fixed", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
  })

  test("BashTool - Windows vs Unix command compatibility", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        
        if (process.platform === 'win32') {
          // Windows-specific commands
          const result1 = await bash.execute({
            command: 'powershell -Command "Get-Location"',
            description: "Get current directory on Windows"
          }, ctx)
          expect(result1.metadata.exit).toBe(0)
          expect(result1.output).toBeTruthy()

          // Test Windows shell features
          const result2 = await bash.execute({
            command: 'set | findstr "USER"',
            description: "Find user-related environment variables"
          }, ctx)
          expect(result2.metadata.exit).toBe(0)

          // Test Windows variable expansion
          const testVar = "TEST_VALUE"
          const result3 = await bash.execute({
            command: `$env:TEST_VAR="${testVar}"; echo $env:TEST_VAR`,
            description: "Test variable expansion"
          }, ctx)
          expect(result3.metadata.exit).toBe(0)
          expect(result3.output).toContain(testVar)

        } else {
          // Unix-specific commands
          const result1 = await bash.execute({
            command: 'pwd',
            description: "Get current directory on Unix"
          }, ctx)
          expect(result1.metadata.exit).toBe(0)
          expect(result1.output).toBeTruthy()

          // Test Unix shell features
          const result2 = await bash.execute({
            command: 'env | grep USER',
            description: "Find user-related environment variables"
          }, ctx)
          expect(result2.metadata.exit).toBe(0)

          // Test Unix variable expansion
          const testVar = "TEST_VALUE"
          const result3 = await bash.execute({
            command: `TEST_VAR=${testVar} && echo $TEST_VAR`,
            description: "Test variable expansion"
          }, ctx)
          expect(result3.metadata.exit).toBe(0)
          expect(result3.output).toContain(testVar)
        }
      }
    })
  })

  test("GlobTool - cross-platform pattern matching", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const glob = await GlobTool.init()
        
        // Create test files with different extensions
        await fs.writeFile(path.join(testDir, "test.js"), "content1")
        await fs.writeFile(path.join(testDir, "test.ts"), "content2")
        await fs.writeFile(path.join(testDir, "test.txt"), "content3")
        
        // Test pattern matching
        const result = await glob.execute({
          pattern: "*.js"
        }, ctx)
        
        expect(result.output).toContain("test.js")
        expect(result.output).not.toContain("test.ts")
        expect(result.output).not.toContain("test.txt")
        expect(result.metadata.count).toBe(1)
      }
    })
  })

  test("GrepTool - special characters and encoding", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const grep = await GrepTool.init()
        
        // Create files with special characters and different encodings
        await fs.writeFile(path.join(testDir, "file1.js"), "function test() { console.log('hello'); }")
        await fs.writeFile(path.join(testDir, "file2.ts"), "function test() { console.log('world'); }")
        await fs.writeFile(path.join(testDir, "file3.txt"), "This is a test file with spëcial chars")
        
        // Test searching with special characters
        const result = await grep.execute({
          pattern: "function test"
        }, ctx)
        
        expect(result.output).toContain("file1.js")
        expect(result.output).toContain("file2.ts")
        expect(result.metadata.matches).toBe(2)
      }
    })
  })

  test("Large file handling", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        const grep = await GrepTool.init()
        
        // Create a moderately sized file (reduced from 1000 to 500 lines)
        const largeFile = path.join(testDir, "large.txt")
        const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: This is test content for line ${i + 1}`)
        await fs.writeFile(largeFile, lines.join('\n'))
        
        // Test bash can handle large file operations
        const countCmd = process.platform === 'win32'
          ? `powershell -Command "Get-Content '${largeFile}' | Measure-Object -Line"`
          : `wc -l < "${largeFile}"`
          
        const result2 = await bash.execute({
          command: countCmd,
          description: "Count lines in large file",
          timeout: 10000 // 10 second timeout
        }, ctx)
        expect(result2.metadata.exit).toBe(0)
        
        // Test grep can search in large files efficiently
        const result3 = await grep.execute({
          pattern: "Line 250",
          path: testDir
        }, ctx)
        expect(result3.metadata.matches).toBe(1)
      }
    })
  }, 30000) // 30 second timeout for this test
})
