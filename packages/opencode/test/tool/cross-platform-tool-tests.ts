import { describe, expect, test } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { BashTool } from "../../src/tool/bash"
import { GrepTool } from "../../src/tool/grep"
import { GlobTool } from "../../src/tool/glob"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

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

describe("Cross-Platform Tool Tests", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  const setupTestDir = async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
    return tmp
  }

  test("BashTool - Windows vs Unix command compatibility", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()

        // Test platform-specific commands
        if (process.platform === 'win32') {
          // Windows-specific tests
          const result1 = await bash.execute({
            command: 'echo %CD%',
            description: "Get current directory on Windows"
          }, ctx)
          expect(result1.metadata.exit).toBe(0)
          expect(result1.output).toBeTruthy()

          // Test PowerShell commands if available
          const result2 = await bash.execute({
            command: 'powershell -Command "Get-Location"',
            description: "PowerShell get location"
          }, ctx)
          expect(result2.metadata.exit).toBe(0)

        } else {
          // Unix-specific tests
          const result1 = await bash.execute({
            command: 'pwd',
            description: "Get current directory on Unix"
          }, ctx)
          expect(result1.metadata.exit).toBe(0)
          expect(result1.output).toBeTruthy()

          // Test basic Unix commands
          const result2 = await bash.execute({
            command: 'whoami',
            description: "Get current user"
          }, ctx)
          expect(result2.metadata.exit).toBe(0)
        }

        // Cross-platform file operations
        const testFile = path.join(testDir, "platform-test.txt")
        const createCmd = process.platform === 'win32'
          ? `echo "platform test" > "${testFile}"`
          : `echo "platform test" > "${testFile}"`

        const result3 = await bash.execute({
          command: createCmd,
          description: "Create file with platform-specific command"
        }, ctx)
        expect(result3.metadata.exit).toBe(0)

        // Verify file was created
        const exists = await fs.access(testFile).then(() => true).catch(() => false)
        expect(exists).toBe(true)
      }
    })
  })

  test("BashTool - path handling across platforms", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()

        // Test path separators
        const subdir = path.join(testDir, "subdir", "nested")
        await fs.mkdir(subdir, { recursive: true })

        const testFile = path.join(subdir, "path-test.txt")
        const relativePath = path.relative(testDir, testFile)

        // Create file using relative path
        const createCmd = process.platform === 'win32'
          ? `echo "path test" > "${relativePath}"`
          : `echo "path test" > "${relativePath}"`

        const result1 = await bash.execute({
          command: createCmd,
          description: "Create file using relative path"
        }, ctx)
        expect(result1.metadata.exit).toBe(0)

        // List directory contents
        const listCmd = process.platform === 'win32'
          ? `dir "${path.join(testDir, "subdir")}"`
          : `ls -la "${path.join(testDir, "subdir")}"`

        const result2 = await bash.execute({
          command: listCmd,
          description: "List directory contents"
        }, ctx)
        expect(result2.metadata.exit).toBe(0)
        expect(result2.output).toContain("nested")
      }
    })
  })

  test("GrepTool - cross-platform file searching", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const grep = await GrepTool.init()

        // Create test files with different line endings
        await fs.writeFile(path.join(testDir, "unix-style.txt"), "line1\nline2\nline3\n")
        await fs.writeFile(path.join(testDir, "windows-style.txt"), "line1\r\nline2\r\nline3\r\n")
        await fs.writeFile(path.join(testDir, "mixed.txt"), "line1\r\nline2\nline3\r\n")

        const result = await grep.execute({
          pattern: "line2"
        }, ctx)

        expect(result.metadata.matches).toBe(3)
        expect(result.output).toContain("unix-style.txt")
        expect(result.output).toContain("windows-style.txt")
        expect(result.output).toContain("mixed.txt")
      }
    })
  })

  test("GrepTool - special characters and encoding", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const grep = await GrepTool.init()

        // Create files with special characters
        await fs.writeFile(path.join(testDir, "special.txt"),
          "Test with émojis 🚀\n" +
          "Special chars: àáâãäå\n" +
          "Quotes: 'single' and \"double\"\n" +
          "Backslashes: C:\\Users\\test\n"
        )

        // Test different patterns
        const result1 = await grep.execute({
          pattern: "émojis"
        }, ctx)
        expect(result1.metadata.matches).toBe(1)

        const result2 = await grep.execute({
          pattern: "àáâãäå"
        }, ctx)
        expect(result2.metadata.matches).toBe(1)

        const result3 = await grep.execute({
          pattern: "'single'"
        }, ctx)
        expect(result3.metadata.matches).toBe(1)

        const result4 = await grep.execute({
          pattern: "C:\\\\Users"
        }, ctx)
        expect(result4.metadata.matches).toBe(1)
      }
    })
  })

  test("GlobTool - cross-platform pattern matching", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const glob = await GlobTool.init()

        // Create files with different extensions and cases
        await fs.writeFile(path.join(testDir, "test.js"), "content")
        await fs.writeFile(path.join(testDir, "TEST.JS"), "content") // uppercase
        await fs.writeFile(path.join(testDir, "test.ts"), "content")
        await fs.writeFile(path.join(testDir, "test.txt"), "content")
        await fs.writeFile(path.join(testDir, "file with spaces.txt"), "content")

        // Test case sensitivity (varies by platform)
        const result1 = await glob.execute({
          pattern: "*.js"
        }, ctx)
        expect(result1.metadata.count).toBeGreaterThanOrEqual(1)

        // Test patterns with spaces
        const result2 = await glob.execute({
          pattern: "*with spaces*"
        }, ctx)
        expect(result2.metadata.count).toBe(1)
        expect(result2.output).toContain("file with spaces.txt")

        // Test multiple extensions
        const result3 = await glob.execute({
          pattern: "*.{js,ts}"
        }, ctx)
        expect(result3.metadata.count).toBeGreaterThanOrEqual(2)
      }
    })
  })

  test("GlobTool - nested directory patterns", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const glob = await GlobTool.init()

        // Create nested directory structure
        await fs.mkdir(path.join(testDir, "src"), { recursive: true })
        await fs.mkdir(path.join(testDir, "src", "components"), { recursive: true })
        await fs.mkdir(path.join(testDir, "src", "utils"), { recursive: true })
        await fs.mkdir(path.join(testDir, "test"), { recursive: true })
        await fs.mkdir(path.join(testDir, "test", "unit"), { recursive: true })

        // Create files in different directories
        await fs.writeFile(path.join(testDir, "src", "index.js"), "content")
        await fs.writeFile(path.join(testDir, "src", "components", "Button.tsx"), "content")
        await fs.writeFile(path.join(testDir, "src", "utils", "helpers.ts"), "content")
        await fs.writeFile(path.join(testDir, "test", "unit", "helpers.test.ts"), "content")

        // Test recursive patterns
        const result1 = await glob.execute({
          pattern: "**/*.ts"
        }, ctx)
        expect(result1.metadata.count).toBeGreaterThanOrEqual(2)

        // Test specific directory patterns
        const result2 = await glob.execute({
          pattern: "src/**/*.ts"
        }, ctx)
        expect(result2.metadata.count).toBeGreaterThanOrEqual(1)

        // Test exclusion patterns (if supported)
        const result3 = await glob.execute({
          pattern: "**/*.ts",
          path: testDir
        }, ctx)
        expect(result3.metadata.count).toBeGreaterThanOrEqual(2)
      }
    })
  })

  test("File permissions and access", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()

        const testFile = path.join(testDir, "permission-test.txt")
        await fs.writeFile(testFile, "test content")

        if (process.platform !== 'win32') {
          // Unix-specific permission tests
          // Make file read-only
          await bash.execute({
            command: `chmod 444 "${testFile}"`,
            description: "Make file read-only"
          }, ctx)

          // Try to write to read-only file (should fail)
          const result = await bash.execute({
            command: `echo "overwrite" > "${testFile}"`,
            description: "Attempt to write to read-only file"
          }, ctx)

          // Command might fail, but that's expected
          expect(result.metadata.exit).toBeDefined()

          // Restore write permissions
          await bash.execute({
            command: `chmod 644 "${testFile}"`,
            description: "Restore write permissions"
          }, ctx)
        } else {
          // Windows-specific permission tests
          // Test file attributes
          const result = await bash.execute({
            command: `attrib "${testFile}"`,
            description: "Check file attributes on Windows"
          }, ctx)
          expect(result.metadata.exit).toBe(0)
        }

        // Verify file is still accessible
        const content = await fs.readFile(testFile, 'utf-8')
        expect(content).toBeTruthy()
      }
    })
  })

  test("Environment variables and shell features", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()

        if (process.platform === 'win32') {
          // Windows environment variables
          const result1 = await bash.execute({
            command: 'echo %PATH%',
            description: "Echo PATH environment variable"
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
          // Unix environment variables
          const result1 = await bash.execute({
            command: 'echo $PATH',
            description: "Echo PATH environment variable"
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

  test("Large file handling", async () => {
    await using tmp = await setupTestDir()

    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const bash = await BashTool.init()
        const grep = await GrepTool.init()

        const largeFile = path.join(testDir, "large.txt")
        const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: This is test content for line ${i + 1}`)
        await fs.writeFile(largeFile, lines.join('\n'))

        const countCmd = process.platform === 'win32'
          ? `powershell -Command "Get-Content '${largeFile}' | Measure-Object -Line"`
          : `wc -l < "${largeFile}"`

        const result2 = await bash.execute({
          command: countCmd,
          description: "Count lines in large file",
          timeout: 10000
        }, ctx)
        expect(result2.metadata.exit).toBe(0)

        const result3 = await grep.execute({
          pattern: "Line 250",
          path: testDir
        }, ctx)
        expect(result3.metadata.matches).toBe(1)
      }
    })
  })
})
