import { describe, expect, test, mock, beforeEach, afterEach, vi } from "bun:test"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Shell } from "../../src/shell/shell"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import * as path from "path"
import * as childProcess from "child_process"

describe("BashTool Fallback Parsing", () => {
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

  const ctx: any = {
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
        on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
          if (event === "data") {
            // No stderr output
          }
        }),
        destroy: vi.fn(),
      },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === "close") {
          setTimeout(() => cb(0), 10)
        }
      }),
      once: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === "exit") {
          setTimeout(() => cb(), 10)
        }
        if (event === "error") {
          // No error by default
        }
      }),
      kill: vi.fn(),
      unref: vi.fn(),
      exitCode: 0,
    }
    return vi.fn().mockReturnValue(mockProc as any)
  }

  test("should handle complex commands without crashing", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Create a complex command that might cause parsing issues
        const complexCommand = 'find . -name "*.ts" -exec grep "TODO" {} \\; | xargs -I {} cp {} /tmp/backup/'

        mocks.childProcessSpawn.mockImplementation(mockSpawn("success"))

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
        expect(mocks.childProcessSpawn).toHaveBeenCalled()
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

        mocks.childProcessSpawn.mockImplementation(mockSpawn("success"))

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

        mocks.childProcessSpawn.mockImplementation(mockSpawn("success"))

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

        mocks.childProcessSpawn.mockImplementation(mockSpawn("hello world"))

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
