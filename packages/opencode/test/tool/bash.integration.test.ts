import { describe, expect, test, beforeEach, afterEach, vi } from "bun:test"
import { BashTool } from "../../src/tool/bash"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"
import { TOOL } from "../../src/constants"

describe("BashTool Integration Tests", () => {
  let mocks: any
  const originalEnv = process.env

  beforeEach(() => {
    mocks = {
      configGet: vi.spyOn(Config, "get").mockResolvedValue({ shell: "bash" } as any),
      pluginTrigger: vi.spyOn(Plugin, "trigger").mockResolvedValue({ env: {} }),
      instanceContainsPath: vi.spyOn(Instance, "containsPath").mockReturnValue(true),
      instanceDirectory: vi.spyOn(Instance, "directory", "get").mockReturnValue(tmpdir()),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = originalEnv
  })

  const ctx: any = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: vi.fn(),
    ask: vi.fn().mockResolvedValue(undefined),
  }

  describe("Bun.spawn Behavior Across Platforms", () => {
    test("Windows PowerShell command execution", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping Windows-specific test on non-Windows platform")
        return
      }

      mocks.configGet.mockResolvedValue({ shell: "powershell" })
      mocks.pluginTrigger.mockResolvedValue({ env: { TEST_VAR: "test-value" } })

      const bashTool = await BashTool()
      const result = await bashTool.execute({
        command: "powershell -Command 'Write-Output \"test-output\"'",
        description: "Test PowerShell command",
      }, ctx)

      expect(result.metadata.exit).toBe(0)
      expect(result.output).toContain("test-output")
      expect(bashTool).toBeDefined()
    })

    test("Unix bash command execution", async () => {
      if (process.platform === "win32") {
        console.log("Skipping Unix-specific test on Windows platform")
        return
      }

      mocks.configGet.mockResolvedValue({ shell: "bash" })

      const bashTool = await BashTool()
      const result = await bashTool.execute({
        command: "echo 'test-output'",
        description: "Test echo command",
      }, ctx)

      expect(result.metadata.exit).toBe(0)
      expect(result.output).toContain("test-output")
    })

    test("Bun.spawn stream handling with large output", async () => {
      const largeOutput = "x".repeat(10000)
      
      // Mock Bun.spawn to simulate large output
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              // Simulate chunked output
              const chunk1 = largeOutput.slice(0, 5000)
              const chunk2 = largeOutput.slice(5000)
              
              controller.enqueue(new TextEncoder().encode(chunk1))
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode(chunk2))
                controller.close()
              }, 10)
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      const bashTool = await BashTool()
      const result = await bashTool.execute({
        command: "echo large-output",
        description: "Test large output handling",
      }, ctx)

      expect(result.output).toBe(largeOutput)
      expect(result.metadata.truncated).toBe(false)
      
      mockBunSpawn.restore()
    })

    test("Bun.spawn with UTF-8 encoding", async () => {
      const utf8Text = "测试中文 🚀 ñáéíóú"
      
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(utf8Text))
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      const bashTool = await BashTool()
      const result = await bashTool.execute({
        command: "echo utf8-test",
        description: "Test UTF-8 encoding",
      }, ctx)

      expect(result.output).toBe(utf8Text)
      
      mockBunSpawn.restore()
    })
  })

  describe("Process Termination Edge Cases", () => {
    test("process timeout handling", async () => {
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              // Never close the stream to simulate hanging process
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode("partial-output"))
              }, 100)
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: new Promise(() => {}), // Never resolves
          exitCode: undefined,
          kill: vi.fn().mockResolvedValue(undefined),
        } as any
      })

      const mockKillTree = vi.spyOn(Shell, "killTree").mockResolvedValue(undefined)

      const bashTool = await BashTool()
      const startTime = Date.now()
      
      const result = await bashTool.execute({
        command: "sleep 30",
        description: "Test timeout handling",
        timeout: 1000, // 1 second timeout
      }, ctx)

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(3000) // Should complete within timeout + buffer
      expect(result.metadata.exit).toBe(124) // Timeout exit code
      expect(mockKillTree).toHaveBeenCalled()
      
      mockBunSpawn.restore()
      mockKillTree.restore()
    })

    test("process abortion via AbortSignal", async () => {
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: vi.fn().mockResolvedValue(undefined),
        } as any
      })

      const mockKillTree = vi.spyOn(Shell, "killTree").mockResolvedValue(undefined)

      const abortController = new AbortController()
      const testCtx = { ...ctx, abort: abortController.signal }

      // Abort after 100ms
      setTimeout(() => abortController.abort(), 100)

      const bashTool = await BashTool()
      const result = await bashTool.execute({
        command: "sleep 30",
        description: "Test abort handling",
      }, testCtx)

      expect(result.metadata.exit).toBe(130) // Abort exit code
      expect(mockKillTree).toHaveBeenCalled()
      
      mockBunSpawn.restore()
      mockKillTree.restore()
    })

    test("killTree process hierarchy termination", async () => {
      if (process.platform === "win32") {
        // Test Windows taskkill behavior
        const mockSpawn = vi.spyOn(require("child_process"), "spawn").mockImplementation((cmd: string, args: string[]) => {
          expect(cmd).toBe("taskkill")
          expect(args).toContain("/pid")
          expect(args).toContain("/f")
          expect(args).toContain("/t")
          
          return {
            once: vi.fn().mockImplementation((event, callback) => {
              if (event === "exit" || event === "error") {
                setTimeout(callback, 10)
              }
            }),
          } as any
        })

        const mockProcess = {
          pid: 1234,
          kill: vi.fn(),
        } as any

        await Shell.killTree(mockProcess)
        expect(mockSpawn).toHaveBeenCalledWith("taskkill", ["/pid", "1234", "/f", "/t"], { stdio: "ignore" })
        
        mockSpawn.restore()
      } else {
        // Test Unix SIGTERM/SIGKILL behavior
        const mockProcessKill = vi.spyOn(process, "kill").mockImplementation(() => {})
        const mockKill = vi.fn()
        
        const mockProcess = {
          pid: 1234,
          kill: mockKill,
        } as any

        const mockSleep = vi.spyOn(Bun, "sleep").mockResolvedValue(undefined)

        await Shell.killTree(mockProcess, { exited: () => false })

        expect(mockProcessKill).toHaveBeenCalledWith(-1234, "SIGTERM")
        expect(mockSleep).toHaveBeenCalledWith(200) // SIGKILL_TIMEOUT_MS
        expect(mockKill).toHaveBeenCalledWith("SIGKILL")

        mockProcessKill.restore()
        mockSleep.restore()
      }
    })

    test("process already exited edge case", async () => {
      const mockProcess = {
        pid: 1234,
        kill: vi.fn(),
      } as any

      const mockProcessKill = vi.spyOn(process, "kill").mockImplementation(() => {})

      // Test with process already exited
      await Shell.killTree(mockProcess, { exited: () => true })

      expect(mockProcessKill).not.toHaveBeenCalled()
      expect(mockProcess.kill).not.toHaveBeenCalled()

      mockProcessKill.restore()
    })
  })

  describe("Environment Variable Conflict Handling", () => {
    test("Windows environment variable case normalization", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping Windows-specific test on non-Windows platform")
        return
      }

      // Set up conflicting environment variables
      process.env.PATH = "/original/path"
      process.env.path = "/lowercase/path"
      process.env.TestVar = "original"
      process.env.testvar = "lowercase"

      mocks.configGet.mockResolvedValue({ shell: "cmd" })
      mocks.pluginTrigger.mockResolvedValue({ env: { ADDITIONAL_VAR: "plugin-value" } })

      const bashTool = await BashTool()
      
      // Mock Bun.spawn to capture environment
      let capturedEnv: any
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[], options: any) => {
        capturedEnv = options.env
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      await bashTool.execute({
        command: "echo %PATH%",
        description: "Test environment variable handling",
      }, ctx)

      // Verify case normalization
      expect(capturedEnv).toHaveProperty("PATH")
      expect(capturedEnv).toHaveProperty("TESTVAR")
      expect(capturedEnv).toHaveProperty("ADDITIONAL_VAR")
      
      // Should not have lowercase versions on Windows
      expect(capturedEnv).not.toHaveProperty("path")
      expect(capturedEnv).not.toHaveProperty("testvar")
      
      mockBunSpawn.restore()
    })

    test("environment variable expansion conflicts", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping Windows-specific test on non-Windows platform")
        return
      }

      process.env.BASE_VAR = "base-value"
      process.env.CONFLICT_VAR = "%BASE_VAR%"

      mocks.configGet.mockResolvedValue({ shell: "cmd" })
      mocks.pluginTrigger.mockResolvedValue({ env: { CONFLICT_VAR: "plugin-override" } })

      const bashTool = await BashTool()
      
      let capturedEnv: any
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[], options: any) => {
        capturedEnv = options.env
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      await bashTool.execute({
        command: "set TEST_VAR=%CONFLICT_VAR%",
        description: "Test variable expansion",
      }, ctx)

      // Plugin should take precedence over process environment
      expect(capturedEnv.CONFLICT_VAR).toBe("plugin-override")
      
      mockBunSpawn.restore()
    })

    test("Unix environment variable preservation", async () => {
      if (process.platform === "win32") {
        console.log("Skipping Unix-specific test on Windows platform")
        return
      }

      // Set up case-sensitive environment variables
      process.env.PATH = "/original/path"
      process.env.Path = "/different/path"
      process.env.TestVar = "original"

      mocks.configGet.mockResolvedValue({ shell: "bash" })
      mocks.pluginTrigger.mockResolvedValue({ env: { ADDITIONAL_VAR: "plugin-value" } })

      const bashTool = await BashTool()
      
      let capturedEnv: any
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[], options: any) => {
        capturedEnv = options.env
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      await bashTool.execute({
        command: "echo $PATH",
        description: "Test Unix environment handling",
      }, ctx)

      // Unix should preserve case sensitivity
      expect(capturedEnv).toHaveProperty("PATH")
      expect(capturedEnv).toHaveProperty("Path")
      expect(capturedEnv).toHaveProperty("TestVar")
      expect(capturedEnv).toHaveProperty("ADDITIONAL_VAR")
      
      mockBunSpawn.restore()
    })

    test("environment variable merging precedence", async () => {
      process.env.BASE_VAR = "process-value"
      
      mocks.configGet.mockResolvedValue({ shell: "bash" })
      mocks.pluginTrigger.mockResolvedValue({ env: { BASE_VAR: "plugin-value", PLUGIN_VAR: "plugin-only" } })

      // Mock Shell.getSpawnConfig to return its own environment
      const mockGetSpawnConfig = vi.spyOn(Shell, "getSpawnConfig").mockReturnValue({
        executable: "bash",
        args: ["-c", "echo test"],
        env: { BASE_VAR: "shell-config-value", SHELL_VAR: "shell-only" },
        useShellFlag: false,
      } as any)

      const bashTool = await BashTool()
      
      let capturedEnv: any
      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[], options: any) => {
        capturedEnv = options.env
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      await bashTool.execute({
        command: "echo test",
        description: "Test environment precedence",
      }, ctx)

      // Precedence: Plugin > Shell Config > Process
      expect(capturedEnv.BASE_VAR).toBe("plugin-value")
      expect(capturedEnv.PLUGIN_VAR).toBe("plugin-only")
      expect(capturedEnv.SHELL_VAR).toBe("shell-only")
      
      mockBunSpawn.restore()
      mockGetSpawnConfig.restore()
    })
  })

  describe("Real-time Metadata Updates", () => {
    test("metadata updates during command execution", async () => {
      let metadataCallCount = 0
      const updatedCtx = {
        ...ctx,
        metadata: vi.fn().mockImplementation((metadata: any) => {
          metadataCallCount++
          expect(metadata.metadata.output.length).toBeGreaterThan(0)
          expect(metadata.metadata.description).toBe("Test metadata updates")
        }),
      }

      const chunks = ["chunk1\n", "chunk2\n", "chunk3\n"]
      let chunkIndex = 0

      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              const interval = setInterval(() => {
                if (chunkIndex < chunks.length) {
                  controller.enqueue(new TextEncoder().encode(chunks[chunkIndex]))
                  chunkIndex++
                } else {
                  clearInterval(interval)
                  controller.close()
                }
              }, 50)
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      const bashTool = await BashTool()
      await bashTool.execute({
        command: "echo streaming-test",
        description: "Test metadata updates",
      }, updatedCtx)

      expect(metadataCallCount).toBeGreaterThan(2) // Should be called multiple times
      expect(updatedCtx.metadata).toHaveBeenCalledTimes(metadataCallCount)
      
      mockBunSpawn.restore()
    })

    test("metadata truncation for large outputs", async () => {
      const largeOutput = "x".repeat(TOOL.MAX_METADATA_LENGTH + 1000)
      
      const updatedCtx = {
        ...ctx,
        metadata: vi.fn().mockImplementation((metadata: any) => {
          expect(metadata.metadata.output.length).toBeLessThanOrEqual(TOOL.MAX_METADATA_LENGTH)
          expect(metadata.metadata.output).toContain("...")
        }),
      }

      const mockBunSpawn = vi.spyOn(Bun, "spawn").mockImplementation((args: string[]) => {
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(largeOutput))
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
          exitCode: 0,
          kill: () => {},
        } as any
      })

      const bashTool = await BashTool()
      await bashTool.execute({
        command: "echo large-output",
        description: "Test metadata truncation",
      }, updatedCtx)

      expect(updatedCtx.metadata).toHaveBeenCalled()
      
      mockBunSpawn.restore()
    })
  })
})
