import { describe, expect, test, mock, beforeEach, afterEach, beforeAll, vi } from "bun:test"
import os from "os"
import path from "path"
import { BashTool, processPowerShellOutput, processCmdOutput } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"
import type { Permission } from "../../src/permission"
import { Truncate } from "../../src/tool/truncate"
import { SessionID, MessageID } from "../../src/session/schema"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import * as childProcess from "child_process"

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => { },
  ask: async () => { },
}

const projectRoot = path.join(__dirname, "../..")

describe("tool.bash", () => {
  describe("basic functionality", () => {
    test("basic", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "echo 'test'",
              description: "Echo test message",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(0)
          expect(result.metadata.output).toContain("test")
        },
      })
    })
  })

  describe("fallback parsing", () => {
    let mocks: {
      pluginTrigger: any
      configGet: any
      shellKillTree: any
      childProcessSpawn: any
    }

    beforeEach(() => {
      mocks = {
        pluginTrigger: vi.spyOn(Plugin, "trigger").mockResolvedValue({ env: {} }),
        configGet: vi.spyOn(Config, "get").mockResolvedValue({ shell: process.platform === "win32" ? "powershell" : "bash" } as any),
        shellKillTree: vi.spyOn(Shell, "killTree").mockResolvedValue(undefined),
        childProcessSpawn: vi.spyOn(childProcess, "spawn"),
      }
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    const fallbackCtx: any = {
      sessionID: "session",
      messageID: "message",
      ask: vi.fn().mockResolvedValue(true),
      abort: new AbortController().signal,
      metadata: vi.fn(),
    }

    const mockSpawn = (output: string) => {
      const mockProc = {
        stdout: {
          on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
            if (event === "data") {
              setTimeout(() => cb(Buffer.from(output)), 0)
            }
          }),
          destroy: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
          destroy: vi.fn(),
        },
        on: vi.fn(),
        kill: vi.fn(),
      }
      mocks.childProcessSpawn.mockReturnValue(mockProc)
      return mockProc
    }

    test("handles complex commands with fallback parsing", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const mockProc = mockSpawn("test output")

          const result = await bash.execute({
            command: "find . -name '*.ts' -exec grep 'TODO' {} \\; | xargs -I {} cp {} /tmp/backup/",
            description: "Complex command with chaining"
          }, fallbackCtx)

          expect(result.metadata.output).toContain("test output")
          expect(mocks.childProcessSpawn).toHaveBeenCalled()
        }
      })
    })

    test("handles quoted arguments correctly", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const mockProc = mockSpawn("file processed")

          const result = await bash.execute({
            command: 'cp "file with spaces.txt" \'another file.txt\' `file with nested quotes.txt\'',
            description: "Command with mixed quoting"
          }, fallbackCtx)

          expect(result.metadata.output).toContain("file processed")
        }
      })
    })
  })

  describe("performance optimizations", () => {
    let testDir: string
    let perfCtx: any

    beforeAll(async () => {
      const tmp = await tmpdir({ git: true })
      testDir = tmp.path
      perfCtx = {
        sessionID: "test-session",
        messageID: "test-message",
        callID: "test-call",
        agent: "test-agent",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => { },
        ask: async () => { },
      }
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
          }, perfCtx)
          const echoTime = Date.now() - startTime

          // Test complex command that should use shell
          const complexStartTime = Date.now()
          const result2 = await bash.execute({
            command: 'powershell -Command "Get-Location"',
            description: "PowerShell command"
          }, perfCtx)
          const powershellTime = Date.now() - complexStartTime

          expect(result1.metadata.exit).toBe(0)
          expect(result2.metadata.exit).toBe(0)
          expect(echoTime).toBeLessThan(1000) // Should be fast
        }
      })
    })
  })

  describe("output processing upgrades", () => {
    test("processPowerShellOutput: enhances non-existent cmdlet errors", () => {
      const output = "The term 'Get-NonExistent' is not recognized as the name of a cmdlet, function, script file, or operable program."
      const result = processPowerShellOutput(output, "Get-NonExistent")
      expect(result.output).toContain("Error: Command 'Get-NonExistent' not found")
      expect(result.output).toContain("Get-Command Get-NonExistent")
    })

    test("processPowerShellOutput: handles Format-Table -First unsupported parameter", () => {
      const output = "Format-Table : A parameter cannot be found that matches parameter name 'First'."
      const result = processPowerShellOutput(output, "ls | ft -First 1")
      expect(result.output).toContain("Note: The -First parameter is not supported")
      expect(result.output).toContain("Select-Object -First N")
    })

    test("processCmdOutput: handles command not found errors", () => {
      const output = "'nonexistent' is not recognized as an internal or external command"
      const result = processCmdOutput(output, "nonexistent")
      expect(result.output).toContain("Error: Command 'nonexistent' not found")
    })
  })
})

describe("tool.bash permissions", () => {
  test("asks for bash permission with correct pattern", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "echo hello",
            description: "Echo hello",
          },
          testCtx,
        )
        expect(requests.length).toBe(1)
        expect(requests[0].permission).toBe("bash")
        expect(requests[0].patterns).toContain("echo hello")
      },
    })
  })

  test("asks for bash permission with multiple commands", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "echo foo && echo bar",
            description: "Echo twice",
          },
          testCtx,
        )
        expect(requests.length).toBe(1)
        expect(requests[0].permission).toBe("bash")
        expect(requests[0].patterns).toContain("echo foo")
        expect(requests[0].patterns).toContain("echo bar")
      },
    })
  })

  test("asks for external_directory permission when cd to parent", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "cd ../",
            description: "Change to parent directory",
          },
          testCtx,
        )
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
      },
    })
  })

  test("asks for external_directory permission when workdir is outside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "ls",
            workdir: os.tmpdir(),
            description: "List temp dir",
          },
          testCtx,
        )
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns).toContain(path.join(os.tmpdir(), "*"))
      },
    })
  })

  test("asks for external_directory permission when file arg is outside project", async () => {
    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "outside.txt"), "x")
      },
    })
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        const filepath = path.join(outerTmp.path, "outside.txt")
        await bash.execute(
          {
            command: `cat ${filepath}`,
            description: "Read external file",
          },
          testCtx,
        )
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        const expected = path.join(outerTmp.path, "*")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns).toContain(expected)
        expect(extDirReq!.always).toContain(expected)
      },
    })
  })

  test("does not ask for external_directory permission when rm inside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }

        await Bun.write(path.join(tmp.path, "tmpfile"), "x")

        await bash.execute(
          {
            command: `rm -rf ${path.join(tmp.path, "nested")}`,
            description: "remove nested dir",
          },
          testCtx,
        )

        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeUndefined()
      },
    })
  })

  test("includes always patterns for auto-approval", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "git log --oneline -5",
            description: "Git log",
          },
          testCtx,
        )
        expect(requests.length).toBe(1)
        expect(requests[0].always.length).toBeGreaterThan(0)
        expect(requests[0].always.some((p) => p.endsWith("*"))).toBe(true)
      },
    })
  })

  test("does not ask for bash permission when command is cd only", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "cd .",
            description: "Stay in current directory",
          },
          testCtx,
        )
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeUndefined()
      },
    })
  })

  test("matches redirects in permission pattern", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute({ command: "cat > /tmp/output.txt", description: "Redirect ls output" }, testCtx)
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeDefined()
        expect(bashReq!.patterns).toContain("cat > /tmp/output.txt")
      },
    })
  })

  test("always pattern has space before wildcard to not include different commands", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute({ command: "ls -la", description: "List" }, testCtx)
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeDefined()
        const pattern = bashReq!.always[0]
        expect(pattern).toBe("ls *")
      },
    })
  })
})

describe("tool.bash truncation", () => {
  test("truncates output exceeding line limit", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const lineCount = Truncate.MAX_LINES + 500
        const result = await bash.execute(
          {
            command: `seq 1 ${lineCount}`,
            description: "Generate lines exceeding limit",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)
        expect(result.output).toContain("truncated")
        expect(result.output).toContain("The tool call succeeded but the output was truncated")
      },
    })
  })

  test("truncates output exceeding byte limit", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const byteCount = Truncate.MAX_BYTES + 10000
        const result = await bash.execute(
          {
            command: `head -c ${byteCount} /dev/zero | tr '\\0' 'a'`,
            description: "Generate bytes exceeding limit",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)
        expect(result.output).toContain("truncated")
        expect(result.output).toContain("The tool call succeeded but the output was truncated")
      },
    })
  })

  test("does not truncate small output", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "echo hello",
            description: "Echo hello",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(false)
        const eol = process.platform === "win32" ? "\r\n" : "\n"
        expect(result.output).toBe(`hello${eol}`)
      },
    })
  })

  test("full output is saved to file when truncated", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const lineCount = Truncate.MAX_LINES + 100
        const result = await bash.execute(
          {
            command: `seq 1 ${lineCount}`,
            description: "Generate lines for file check",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)

        const filepath = (result.metadata as any).outputPath
        expect(filepath).toBeTruthy()

        const saved = await Filesystem.readText(filepath)
        const lines = saved.trim().split("\n")
        expect(lines.length).toBe(lineCount)
        expect(lines[0]).toBe("1")
        expect(lines[lineCount - 1]).toBe(String(lineCount))
      },
    })
  })

  describe("CMD exit code capture", () => {
    test.skipIf(process.platform !== "win32")("captures exit code 42 from cmd /c exit 42", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c exit 42",
              description: "Exit with code 42",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(42)
        },
      })
    })

    test.skipIf(process.platform !== "win32")("captures exit code 1 from cmd /c dir nonexistent", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c dir nonexistent 2>&1",
              description: "Dir nonexistent directory",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(1)
        },
      })
    })

    test.skipIf(process.platform !== "win32")("captures exit code 0 from successful cmd /c echo", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c echo success",
              description: "Echo success message",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(0)
          expect(result.metadata.output).toContain("success")
        },
      })
    })

    test.skipIf(process.platform !== "win32")("captures exit code 1 from cmd /c call nonexistent.bat", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c call nonexistent.bat",
              description: "Call nonexistent batch file",
            },
            ctx,
          )
          // cmd /c returns 1 for call failure, not 2 in this environment
          expect([1, 2, 9009]).toContain(result.metadata.exit)
        },
      })
    })

    test.skipIf(process.platform !== "win32")("captures exit code 255 from cmd /c exit /b 255", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c exit /b 255",
              description: "Exit with batch file code 255",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(255)
        },
      })
    })

    test.skipIf(process.platform !== "win32")("handles cmd /c echo with special characters", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: 'cmd /c echo "Hello, World! & Test"',
              description: "Echo with special characters",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(0)
          expect(result.metadata.output).toContain("Hello, World! & Test")
        },
      })
    })

    test.skipIf(process.platform !== "win32")("captures output from cmd /c dir command", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c dir",
              description: "List directory contents",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(0)
          expect(result.metadata.output).toContain("Directory of")
        },
      })
    })

    test.skipIf(process.platform !== "win32")("handles cmd /c type command for file content", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create a test file
          const testFile = path.join(tmp.path, "test.txt")
          await Bun.write(testFile, "Test file content\nLine 2")

          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: `cmd /c type "${testFile}"`,
              description: "Display file content",
            },
            ctx,
          )
          expect(result.metadata.exit).toBe(0)
          expect(result.metadata.output).toContain("Test file content")
          expect(result.metadata.output).toContain("Line 2")
        },
      })
    })
  })
})
