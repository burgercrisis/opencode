import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { BashTool, processPowerShellOutput, processCmdOutput } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import * as path from "path"

describe("BashTool", () => {
  let mocks: {
    pluginTrigger: any
    configGet: any
    shellGetSpawnConfig: any
    shellIsPowerShellCommand: any
    shellIsCmdCommand: any
    shellIsCmdBuiltin: any
    shellNormalizeExitCode: any
    shellKillTree: any
    bunSpawn: any
  }

  beforeEach(() => {
    mocks = {
      pluginTrigger: vi.spyOn(Plugin, "trigger").mockResolvedValue({ env: {} }),
      configGet: vi.spyOn(Config, "get").mockResolvedValue({ shell: process.platform === "win32" ? "powershell" : "bash" } as any),
      shellGetSpawnConfig: vi.spyOn(Shell, "getSpawnConfig").mockReturnValue({
        executable: "powershell",
        args: ["-Command"],
        env: {},
      }),
      shellIsPowerShellCommand: vi.spyOn(Shell, "isPowerShellCommand").mockReturnValue(true),
      shellIsCmdCommand: vi.spyOn(Shell, "isCmdCommand").mockImplementation((cmd) => cmd.includes("set") || cmd.includes("&&")),
      shellIsCmdBuiltin: vi.spyOn(Shell, "isCmdBuiltin").mockReturnValue(false),
      shellNormalizeExitCode: vi.spyOn(Shell, "normalizeExitCode").mockImplementation((code) => code),
      shellKillTree: vi.spyOn(Shell, "killTree").mockResolvedValue(undefined),
      bunSpawn: vi.spyOn(Bun, "spawn"),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Helpers", () => {
    describe("processPowerShellOutput", () => {
      test("improves non-existent cmdlet error", () => {
        const output = "The term 'Get-Foo' is not recognized as the name of a cmdlet, function, script file, or operable program."
        const result = processPowerShellOutput(output, "Get-Foo")
        expect(result.output).toContain("Error: Command 'Get-Foo' not found")
        expect(result.hasErrors).toBe(true)
      })

      test("handles Get-Credential in non-interactive env", () => {
        const output = "Get-Credential : Cannot prompt for input in this environment"
        const result = processPowerShellOutput(output, "Get-Credential")
        expect(result.output).toContain("Error: Get-Credential requires interactive input")
        expect(result.hasErrors).toBe(true)
      })

      test("handles -First parameter unsupported", () => {
        const output = "Format-Table : A parameter cannot be found that matches parameter name 'First'."
        const result = processPowerShellOutput(output, "ls | Format-Table -First 1")
        expect(result.output).toContain("Note: The -First parameter is not supported in Format-Table")
      })

      test("handles debug functionality not supported", () => {
        const output = "Object reference not set to an instance of an object."
        const result = processPowerShellOutput(output, "Write-Debug 'foo'")
        expect(result.output).toContain("Error: Debug functionality is not supported")
      })
    })

    describe("processCmdOutput", () => {
      test("removes quote artifacts from variable expansion", () => {
        const output = 'some output"'
        const result = processCmdOutput(output, "echo %VAR%")
        expect(result.output).toBe("some output")
      })

      test("handles command not recognized in CMD", () => {
        const output = "'foo' is not recognized as an internal or external command, operable program or batch file."
        const result = processCmdOutput(output, "foo")
        expect(result.output).toContain("Error: Command 'foo' not found")
        expect(result.hasErrors).toBe(true)
        expect(result.exitCode).toBe(9009)
      })
    })
  })

  describe("Tool Execution", () => {
    const ctx: any = {
      sessionID: "session",
      messageID: "message",
      agent: "agent",
      abort: new AbortController().signal,
      messages: [],
      metadata: mock(() => {}),
      ask: mock(async () => {}),
    }

    beforeEach(() => {
      ctx.ask.mockClear()
      ctx.metadata.mockClear()
    })

    function mockSpawn(stdout: string, stderr = "", exitCode = 0) {
      return (args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              if (stdout) controller.enqueue(new TextEncoder().encode(stdout))
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              if (stderr) controller.enqueue(new TextEncoder().encode(stderr))
              controller.close()
            },
          }),
          exited: Promise.resolve(exitCode),
          exitCode,
          kill: () => {},
        }
      }
    }

    test("executes a simple command", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.bunSpawn.mockImplementation(mockSpawn("hello world"))
          
          const tool = await BashTool.init()
          const result = await tool.execute({ 
            command: "echo hello", 
            description: "says hello" 
          }, ctx)

          expect(result.output).toBe("hello world")
          expect(result.metadata.exit).toBe(0)
        },
      })
    })

    test("handles command with workdir", async () => {
      await using tmp = await tmpdir()
      const externalDir = path.join(path.dirname(tmp.path), "external-dir")
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.bunSpawn.mockImplementation(mockSpawn("in external dir"))
          
          const tool = await BashTool.init()
          await tool.execute({ 
            command: "ls", 
            workdir: externalDir,
            description: "lists files" 
          }, ctx)

          expect(ctx.ask).toHaveBeenCalledWith(expect.objectContaining({
            permission: "external_directory"
          }))
        },
      })
    })

    test("handles timeout", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock a spawn that doesn't resolve 'exited' immediately
          mocks.bunSpawn.mockReturnValue({
            stdout: new ReadableStream({ start(c) { c.close() } }),
            stderr: new ReadableStream({ start(c) { c.close() } }),
            exited: new Promise(() => {}), // Never resolves
            kill: () => {},
          } as any)
          
          const tool = await BashTool.init()
          const result = await tool.execute({ 
            command: "sleep 10", 
            timeout: 10,
            description: "sleeps" 
          }, ctx)

          expect(result.output).toContain("bash tool terminated command after exceeding timeout")
          expect(result.metadata.exit).toBe(124)
        },
      })
    })

    test("handles powershell job cmdlets with extended timeout", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.bunSpawn.mockImplementation(mockSpawn("job started"))
          
          const tool = await BashTool.init()
          const result = await tool.execute({ 
            command: "Start-Job -ScriptBlock { echo hello }", 
            description: "starts a job" 
          }, ctx)

          expect(result.output).toBe("job started")
        },
      })
    })

    test("handles path resolution for common commands", async () => {
      await using tmp = await tmpdir()
      const externalDir = path.join(path.dirname(tmp.path), "external-dir")
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.bunSpawn.mockImplementation(mockSpawn("done"))
          
          const tool = await BashTool.init()
          
          // Test 'mkdir' with external path
           await tool.execute({ 
             command: `mkdir ${externalDir}`, 
             description: "makes dir" 
           }, ctx)

          expect(ctx.ask).toHaveBeenCalledWith(expect.objectContaining({
            permission: "external_directory"
          }))
        },
      })
    })

    test("handles CMD environment variable setting", async () => {
      if (process.platform !== "win32") return

      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.bunSpawn.mockImplementation(mockSpawn("expanded"))
          
          const tool = await BashTool.init()
          await tool.execute({ 
            command: "set FOO=bar && echo %FOO%", 
            description: "sets and echoes" 
          }, ctx)
        },
      })
    })

    test("validates timeout value", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await BashTool.init()
          await expect(tool.execute({ 
            command: "echo hello", 
            timeout: -1,
            description: "invalid" 
          }, ctx)).rejects.toThrow("Invalid timeout value")
        },
      })
    })
  })
})
