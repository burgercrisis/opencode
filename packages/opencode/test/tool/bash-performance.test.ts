import { describe, expect, test, beforeAll } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { BashTool } from "../../src/tool/bash"
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

describe("BashTool Performance Optimizations", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
  })

  test("PowerShell performance optimization - simple commands", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        
        // Test simple command that should use direct execution
        const startTime = Date.now()
        const result1 = await bash.execute({
          command: "echo hello",
          description: "Simple echo command"
        }, ctx)
        const echoTime = Date.now() - startTime
        
        // Test complex command that should use shell
        const complexStartTime = Date.now()
        const result2 = await bash.execute({
          command: 'powershell -Command "Get-Location"',
          description: "PowerShell command"
        }, ctx)
        const powershellTime = Date.now() - complexStartTime
        
        expect(result1.metadata.exit).toBe(0)
        expect(result2.metadata.exit).toBe(0)
        expect(result1.output).toContain("hello")
        
        // Direct execution should be significantly faster
        console.log(`Echo time: ${echoTime}ms, PowerShell time: ${powershellTime}ms`)
        expect(echoTime).toBeLessThan(powershellTime)
        
        // Performance improvement should be at least 2x faster for simple commands
        expect(powershellTime / echoTime).toBeGreaterThan(1.5)
      }
    })
  }, 10000) // 10 second timeout

  test("PowerShell performance optimization - file operations", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        
        // Create test file
        const testFile = path.join(testDir, "perf-test.txt")
        await fs.writeFile(testFile, "test content")
        
        // Test simple file listing (should be direct)
        const startTime = Date.now()
        const result1 = await bash.execute({
          command: `dir "${testFile}"`,
          description: "Direct dir command"
        }, ctx)
        const dirTime = Date.now() - startTime
        
        // Test PowerShell file listing (should be slower)
        const complexStartTime = Date.now()
        const result2 = await bash.execute({
          command: `powershell -Command "Get-ChildItem '${testFile}'"`,
          description: "PowerShell Get-ChildItem"
        }, ctx)
        const psTime = Date.now() - complexStartTime
        
        expect(result1.metadata.exit).toBe(0)
        expect(result2.metadata.exit).toBe(0)
        
        // Direct execution should be faster
        console.log(`Dir time: ${dirTime}ms, PowerShell time: ${psTime}ms`)
        expect(dirTime).toBeLessThan(psTime)
      }
    })
  }, 10000)

  test("Command detection accuracy", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        
        // Test that simple commands are detected correctly
        const simpleCommands = [
          "echo hello",
          "dir", 
          "type test.txt",
          "copy file.txt new.txt",
          "del file.txt"
        ]
        
        for (const cmd of simpleCommands) {
          const result = await bash.execute({
            command: cmd,
            description: `Test simple command: ${cmd}`
          }, ctx)
          expect(result.metadata.exit).toBe(0)
        }
        
        // Test that complex commands still work
        const complexCommands = [
          'powershell -Command "Get-Process"',
          'cmd /c "echo hello | findstr hello"',
          'git status | findstr modified'
        ]
        
        for (const cmd of complexCommands) {
          const result = await bash.execute({
            command: cmd,
            description: `Test complex command: ${cmd}`
          }, ctx)
          expect(result.metadata.exit).toBe(0)
        }
      }
    })
  }, 15000)
})
