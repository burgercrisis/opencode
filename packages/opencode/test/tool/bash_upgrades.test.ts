import { expect, test, describe, beforeAll } from "bun:test"
import { BashTool, processPowerShellOutput, processCmdOutput } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { Shell } from "../../src/shell/shell"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const baseCtx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  messages: [],
  abort: AbortSignal.any([]),
  metadata: () => {},
}

type ToolCtx = typeof baseCtx & {
  ask: (input: any) => Promise<void>
}

const makeCtx = () => {
  const ctx: ToolCtx = {
    ...baseCtx,
    ask: async () => {},
  }
  return { ctx }
}

describe("Bash Tool Upgrades (Reflecting 5a87a6a Branch Point)", () => {
  let projectRoot: string
  const { ctx } = makeCtx()

  beforeAll(async () => {
    projectRoot = process.cwd()
  })

  describe("Unit Tests: Output Post-processing", () => {
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

    test("processPowerShellOutput: handles Get-Credential non-interactive error", () => {
      const output = "Get-Credential : Cannot prompt for input in this environment"
      const result = processPowerShellOutput(output, "Get-Credential")
      expect(result.output).toContain("Error: Get-Credential requires interactive input")
      expect(result.output).toContain("Alternative approaches")
    })

    test("processCmdOutput: strips trailing quote from variable expansion", () => {
      const output = 'C:\\Users\\Temp"'
      const result = processCmdOutput(output, "echo %TEMP%")
      expect(result.output).toBe('C:\\Users\\Temp')
    })

    test("processCmdOutput: detects non-recognized command error", () => {
      const output = "'nonexistent' is not recognized as an internal or external command, operable program or batch file."
      const result = processCmdOutput(output, "nonexistent")
      expect(result.exitCode).toBe(9009)
      expect(result.hasErrors).toBe(true)
    })
  })

  describe("Integration Tests", () => {
    test("Windows: CMD exit code 9009 for non-existent command", async () => {
      if (process.platform !== "win32") return

      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "cmd /c nonexistent_command_12345",
              description: "Test non-existent command exit code",
            },
            ctx as any,
          )
          // 9009 is the standard CMD exit code for "command not found"
          expect(result.metadata.exit).toBe(9009)
        },
      })
    })

    test("Windows: CMD exit code 0 for successful pipe with findstr", async () => {
      if (process.platform !== "win32") return

      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "echo hello | findstr hello",
              description: "Test successful pipe exit code",
            },
            ctx as any,
          )
          expect(result.metadata.exit).toBe(0)
        },
      })
    })

    test("Windows: if not exist returns exit code 0 when file is missing", async () => {
      if (process.platform !== "win32") return

      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          const result = await bash.execute(
            {
              command: "if not exist nonexistent_file_999 exit 0",
              description: "Test if not exist exit code",
            },
            ctx as any,
          )
          expect(result.metadata.exit).toBe(0)
        },
      })
    })
  })
})
