// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { expect, test, describe, beforeAll, beforeEach, afterEach } from "bun:test"
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
    bulletproofTest("processPowerShellOutput: enhances non-existent cmdlet errors", async () => {
      const output = "The term 'Get-NonExistent' is not recognized as the name of a cmdlet, function, script file, or operable program."
      const result = processPowerShellOutput(output, "Get-NonExistent")
      expect(result.output).toContain("Error: Command 'Get-NonExistent' not found")
      expect(result.output).toContain("Get-Command Get-NonExistent")
    })

    bulletproofTest("processPowerShellOutput: handles Format-Table -First unsupported parameter", async () => {
      const output = "Format-Table : A parameter cannot be found that matches parameter name 'First'."
      const result = processPowerShellOutput(output, "ls | ft -First 1")
      expect(result.output).toContain("Note: The -First parameter is not supported")
      expect(result.output).toContain("Select-Object -First N")
    })

    bulletproofTest("processPowerShellOutput: handles Get-Credential non-interactive error", async () => {
      const output = "Get-Credential : Cannot prompt for input in this environment"
      const result = processPowerShellOutput(output, "Get-Credential")
      expect(result.output).toContain("Error: Get-Credential requires interactive input")
      expect(result.output).toContain("Alternative approaches")
    })

    bulletproofTest("processCmdOutput: strips trailing quote from variable expansion", async () => {
      const output = 'C:\\Users\\Temp"'
      const result = processCmdOutput(output, "echo %TEMP%")
      expect(result.output).toBe('C:\\Users\\Temp')
    })

    bulletproofTest("processCmdOutput: detects non-recognized command error", async () => {
      const output = "'nonexistent' is not recognized as an internal or external command, operable program or batch file."
      const result = processCmdOutput(output, "nonexistent")
      expect(result.exitCode).toBe(9009)
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("processCmdOutput: detects missing path error", async () => {
      const output = "The system cannot find the path specified"
      const result = processCmdOutput(output, "cd C:\\does-not-exist")
      expect(result.exitCode).toBe(1)
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("processPowerShellOutput: Get-NonExistentCmdlet variants and general not-found replacement", async () => {
      const baseError =
        "The term 'Get-NonExistentCmdlet' is not recognized as the name of a cmdlet, function, script file, or operable program."
      const withMissingParams =
        "Get-NonExistentCmdlet : Cannot process command because of one or more missing mandatory parameters"
      const genericNotFound =
        "Some wrapper says Get-NonExistentCmdlet not found but without helper text"

      const r1 = processPowerShellOutput(baseError, "Get-NonExistentCmdlet")
      const r2 = processPowerShellOutput(withMissingParams, "Get-NonExistentCmdlet")
      const r3 = processPowerShellOutput(genericNotFound, "Get-NonExistentCmdlet")

      for (const r of [r1, r2, r3]) {
        expect(r.output).toContain("Error: Command 'Get-NonExistentCmdlet' not found")
        expect(r.output).toContain("Get-Command Get-NonExistentCmdlet")
        expect(r.output).toContain("Import-Module <ModuleName>")
        expect(r.hasErrors).toBe(true)
      }
    })

    bulletproofTest("processPowerShellOutput: generic 'The term' replacement keeps other names", async () => {
      const output =
        "The term 'CustomTool' is not recognized as the name of a cmdlet, function, script file, or operable program."
      const result = processPowerShellOutput(output, "CustomTool")
      expect(result.output).toContain("Error: Command 'CustomTool' not found")
      expect(result.output).toContain("Please check the spelling")
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("processPowerShellOutput: Get-Credential non-interactive empty output path", async () => {
      const result = processPowerShellOutput("", "Get-Credential something")
      expect(result.output).toContain("Get-Credential requires interactive input")
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("processPowerShellOutput: debug-related null reference replacement", async () => {
      const output = "Object reference not set to an instance of an object."
      const command = "powershell -Debug -Command \"Write-Debug 'x'\""
      const result = processPowerShellOutput(output, command)
      expect(result.output).toContain("Debug functionality is not supported in non-interactive PowerShell sessions")
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("processPowerShellOutput: parameter errors mapped to friendly messages", async () => {
      const missingParam = "Missing an argument for parameter 'Name'"
      const unknownParam = "A positional parameter cannot be found that matches parameter 'Foo'"

      const r1 = processPowerShellOutput(missingParam, "cmd")
      const r2 = processPowerShellOutput(unknownParam, "cmd")

      expect(r1.output).toContain("Error: Missing required value for parameter 'Name'")
      expect(r2.output).toContain("Error: Unknown parameter 'Foo'")
      expect(r1.hasErrors).toBe(true)
      expect(r2.hasErrors).toBe(true)
    })
  })

  describe("Integration Tests", () => {
    bulletproofTest("Windows: CMD exit code 9009 for non-existent command", async () => {
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
    }, 15000)

    bulletproofTest("Windows: CMD exit code 0 for successful pipe with findstr", async () => {
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
    }, 15000)

    bulletproofTest("Windows: if not exist returns exit code 0 when file is missing", async () => {
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
    }, 15000)

    bulletproofTest("BashTool: rejects negative timeout value", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          await expect(
            bash.execute(
              {
                command: "echo hello",
                description: "Negative timeout test",
                timeout: -1,
              } as any,
              ctx as any,
            ),
          ).rejects.toThrow("Invalid timeout value")
        },
      })
    })
  })
})
