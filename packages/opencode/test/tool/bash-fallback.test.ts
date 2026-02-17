import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import * as path from "path"

describe("BashTool Fallback Parsing", () => {
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
      shellIsCmdCommand: vi.spyOn(Shell, "isCmdCommand").mockReturnValue(false),
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
    ask: vi.fn().mockResolvedValue(true),
    abort: new AbortController().signal,
    metadata: vi.fn(),
  }

  const mockSpawn = (output: string) => {
    return vi.fn().mockReturnValue({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(output))
          controller.close()
        },
      }),
      stderr: new ReadableStream({ start(c) { c.close() } }),
      exited: Promise.resolve(0),
      kill: () => Promise.resolve(),
    } as any)
  }

  test("should handle complex commands without crashing", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a complex command that might cause parsing issues
        const complexCommand = 'find . -name "*.ts" -exec grep "TODO" {} \\; | xargs -I {} cp {} /tmp/backup/'

        mocks.bunSpawn.mockImplementation(mockSpawn("success"))

        const tool = await BashTool.init()

        // This should not throw an error even with complex command
        const result = await tool.execute(
          {
            command: complexCommand,
            description: "test complex command parsing"
          },
          ctx
        )

        expect(result.metadata.exit).toBe(0)
        expect(result.output).toBe("success")

        // Verify that the command was executed
        expect(mocks.bunSpawn).toHaveBeenCalled()
      }
    })
  })

  test("should handle quoted arguments correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a command with complex quoting
        const quotedCommand = 'cp "file with spaces.txt" \'another file.txt\' `file with nested quotes.txt`'

        mocks.bunSpawn.mockImplementation(mockSpawn("success"))

        const tool = await BashTool.init()

        const result = await tool.execute(
          {
            command: quotedCommand,
            description: "test quoted arguments"
          },
          ctx
        )

        expect(result.metadata.exit).toBe(0)
        expect(result.output).toBe("success")
      }
    })
  })

  test("should handle chained commands", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a command with chaining operators
        const chainedCommand = 'mkdir test && cd test && touch file.txt || echo "failed"'

        mocks.bunSpawn.mockImplementation(mockSpawn("success"))

        const tool = await BashTool.init()

        const result = await tool.execute(
          {
            command: chainedCommand,
            description: "test chained commands"
          },
          ctx
        )

        expect(result.metadata.exit).toBe(0)
        expect(result.output).toBe("success")
      }
    })
  })

  test("should handle simple commands normally", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Simple command that should work with tree-sitter
        const simpleCommand = 'echo "hello world"'

        mocks.bunSpawn.mockImplementation(mockSpawn("hello world"))

        const tool = await BashTool.init()

        const result = await tool.execute(
          {
            command: simpleCommand,
            description: "test simple command"
          },
          ctx
        )

        expect(result.metadata.exit).toBe(0)
        expect(result.output).toBe("hello world")
      }
    })
  })
})
