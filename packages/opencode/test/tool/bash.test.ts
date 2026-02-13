import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { BashTool, processPowerShellOutput, processCmdOutput, _resolveWasm } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import { Filesystem } from "../../src/util/filesystem"
import * as path from "path"
import { fileURLToPath } from "url"

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
        useShellFlag: false,
      } as any),
      shellIsPowerShellCommand: vi.spyOn(Shell, "isPowerShellCommand").mockReturnValue(true),
      shellIsCmdCommand: vi.spyOn(Shell, "isCmdCommand").mockImplementation((cmd) => cmd.includes("set") || cmd.includes("&&")),
      shellIsCmdBuiltin: vi.spyOn(Shell, "isCmdBuiltin").mockReturnValue(false),
      shellNormalizeExitCode: vi.spyOn(Shell, "normalizeExitCode").mockImplementation((code) => code ?? 0),
      shellKillTree: vi.spyOn(Shell, "killTree").mockResolvedValue(undefined),
      bunSpawn: vi.spyOn(Bun, "spawn"),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ctx: any = {
    sessionID: "session",
    messageID: "message",
    agent: "agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn(),
  }

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

  describe("Helpers", () => {
    test("_resolveWasm coverage", () => {
      // Line 29: file://
      const fileUrl = process.platform === "win32" ? "file:///C:/foo/bar" : "file:///foo/bar"
      expect(_resolveWasm(fileUrl)).toBe(fileURLToPath(fileUrl))
      // Line 30: absolute path
      const abs = process.platform === "win32" ? "C:\\foo" : "/foo"
      expect(_resolveWasm(abs)).toBe(abs)
      // Line 31: relative path/URL
      const rel = "some.wasm"
      const result = _resolveWasm(rel)
      expect(result).toContain("some.wasm")
    })

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

      test("processPowerShellOutput coverage gaps", () => {
        // Line 74: Get-NonExistentCmdlet missing mandatory parameters
        const out0 = "Get-NonExistentCmdlet: Cannot process command because of one or more missing mandatory parameters: something"
        const res0 = processPowerShellOutput(out0, "foo")
        expect(res0.output).toContain("Error: Command 'Get-NonExistentCmdlet' not found")

        // Line 79: Get-NonExistentCmdlet with "not found"
        const out2 = "Get-NonExistentCmdlet: was not found"
        const res2 = processPowerShellOutput(out2, "foo")
        expect(res2.output).toContain("Error: Command 'Get-NonExistentCmdlet' not found")

        // Line 86: Get-NonExistentCmdlet fallback (no "not found")
        const out1 = "Get-NonExistentCmdlet: something else happened"
        const res1 = processPowerShellOutput(out1, "foo")
        expect(res1.output).toContain("Error: Command 'Get-NonExistentCmdlet' not found")

        // Line 137: Get-Credential requires interactive input (empty output)
        const res3 = processPowerShellOutput("", "Get-Credential")
        expect(res3.output).toContain("Error: Get-Credential requires interactive input")
        expect(res3.hasErrors).toBe(true)

        // Line 137: Get-Credential missing mandatory parameter
        const out5 = "Get-Credential: Cannot process command because of one or more missing mandatory parameters: Credential"
        const res6 = processPowerShellOutput(out5, "Get-Credential")
        expect(res6.output).toContain("Error: Get-Credential requires interactive input")

        // Lines 148-151, 153-154: Get-Credential null reference
        const out3 = "Get-Credential failed. Object reference not set to an instance of an object."
        const res4 = processPowerShellOutput(out3, "Get-Credential")
        expect(res4.output).toContain("Error: Get-Credential failed to execute")

        // Line 155: null reference NOT related to Get-Credential
        const out4 = "Something else. Object reference not set to an instance of an object."
        const res5 = processPowerShellOutput(out4, "Something-Else")
        expect(res5.output).toBe(out4) // No change if not Get-Credential and no -Debug
      })

      test("processCmdOutput coverage gaps", () => {
        // Line 227: path not found
        const out = "The system cannot find the path specified."
        const res = processCmdOutput(out, "dir foo")
        expect(res.hasErrors).toBe(true)
        expect(res.exitCode).toBe(1)
      })
    })

    test("execute coverage gaps - chained CMD commands", async () => {
      if (process.platform !== "win32") return
      
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.shellIsCmdCommand.mockReturnValue(true)
          mocks.bunSpawn.mockImplementation(mockSpawn("done"))
          const tool = await BashTool.init()

          // Lines 375, 377, 380-381: cmd /c set && echo
          await tool.execute({ 
            command: "cmd /c set FOO=bar && echo %FOO%", 
            description: "chained cmd" 
          }, ctx)
          
          expect(mocks.bunSpawn).toHaveBeenCalled()
        }
      })
    })

    test("execute coverage gaps - cmd command branch", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.shellIsPowerShellCommand.mockReturnValue(false)
          mocks.shellIsCmdCommand.mockReturnValue(true)
          mocks.bunSpawn.mockImplementation(mockSpawn("cmd output"))
          
          const tool = await BashTool.init()
          const result = await tool.execute({ 
            command: "dir", 
            description: "cmd" 
          }, ctx)
          
          expect(result.output).toBe("cmd output")
          expect(mocks.shellIsPowerShellCommand).toHaveBeenCalled()
          expect(mocks.shellIsCmdCommand).toHaveBeenCalled()
        }
      })
    })

    test("execute coverage gaps - non-powershell non-cmd", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mocks.shellIsPowerShellCommand.mockReturnValue(false)
          mocks.shellIsCmdCommand.mockReturnValue(false)
          mocks.bunSpawn.mockImplementation(mockSpawn("plain bash"))
          
          const tool = await BashTool.init()
          const result = await tool.execute({ 
            command: "echo hello", 
            description: "plain bash" 
          }, ctx)
          
          expect(result.output).toBe("plain bash")
          expect(mocks.shellIsPowerShellCommand).toHaveBeenCalled()
          expect(mocks.shellIsCmdCommand).toHaveBeenCalled()
        }
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
    beforeEach(() => {
      ctx.ask.mockClear()
      ctx.metadata.mockClear()
    })

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

    test("execute coverage gaps", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await BashTool.init()

          // Line 311: Path resolution fallback
          const getCanonicalPath = vi.spyOn(Filesystem, "getCanonicalPath").mockImplementation(() => { throw new Error("mock") })
          mocks.bunSpawn.mockImplementation(mockSpawn("done"))
          await tool.execute({ command: "mkdir invalid/path", description: "test" }, ctx)
          getCanonicalPath.mockRestore()

          // Line 391: step2 else case (set without match)
          if (process.platform === "win32") {
            mocks.shellIsCmdCommand.mockReturnValue(true)
            await tool.execute({ command: "set FOO && echo hello", description: "test" }, ctx)
          }
        }
      })
    })

    test("abort handling", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const abortController = new AbortController()
          const localCtx = { ...ctx, abort: abortController.signal }
          
          // Use a deferred promise for exited that we can control
          let resolveExited: any
          const exitedPromise = new Promise((resolve) => {
            resolveExited = resolve
          })

          mocks.bunSpawn.mockReturnValue({
            stdout: new ReadableStream({ start(c) { c.close() } }),
            stderr: new ReadableStream({ start(c) { c.close() } }),
            exited: exitedPromise,
            kill: () => {
              resolveExited(130)
              return Promise.resolve()
            },
          } as any)

          const tool = await BashTool.init()
          const executePromise = tool.execute({ command: "sleep 100", description: "test" }, localCtx)
          
          // Give it a tiny bit of time to set up the listener
          await new Promise(r => setTimeout(r, 1))
          
          abortController.abort()
          
          const result = await executePromise
          expect(result.metadata.exit).toBe(130)
          expect(result.output).toContain("User aborted the command")
        }
      })
    })

    test("baseEnv expansion on Windows", async () => {
      const originalPlatform = process.platform
      const originalEnv = process.env
      
      try {
        // @ts-ignore
        Object.defineProperty(process, "platform", { value: "win32", configurable: true })
        process.env = { ...originalEnv, TEST_VAR: "test-value", EXPAND_ME: "%TEST_VAR%" }
        
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            mocks.bunSpawn.mockImplementation(mockSpawn("done"))
            const tool = await BashTool.init()
            await tool.execute({ command: "echo %EXPAND_ME%", description: "test" }, ctx)
            
            // Verify that the environment passed to spawn has the expanded variable
            const spawnCall = mocks.bunSpawn.mock.calls[0]
            const env = spawnCall[1].env
            expect(env.EXPAND_ME).toBe("test-value")
          }
        })

        // Test val === undefined case (line 355-356)
        process.env = { ...originalEnv, EXPAND_ME: "%NON_EXISTENT_VAR%" }
        await using tmp2 = await tmpdir()
        await Instance.provide({
          directory: tmp2.path,
          fn: async () => {
            mocks.bunSpawn.mockImplementation(mockSpawn("done"))
            const tool = await BashTool.init()
            await tool.execute({ command: "echo %EXPAND_ME%", description: "test" }, ctx)
            
            const spawnCall = mocks.bunSpawn.mock.calls[1]
            const env = spawnCall[1].env
            expect(env.EXPAND_ME).toBe("%NON_EXISTENT_VAR%")
          }
        })
      } finally {
        // @ts-ignore
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
        process.env = originalEnv
      }
    })
  })
})
