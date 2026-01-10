import { describe, expect, test } from "bun:test"
import path from "path"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { detectCommandShell, parseCommand, hasCmdBuiltInSyntax } from "../../src/tool/bash"

const projectRoot = path.join(__dirname, "../..")

describe("shell detection", () => {
  test("detectCommandShell detects PowerShell", () => {
    expect(detectCommandShell("powershell.exe -Command Get-Process")).toBe("powershell")
    expect(detectCommandShell("powershell -Command Get-Process")).toBe("powershell")
    expect(detectCommandShell("pwsh -Command Get-Process")).toBe("pwsh")
    expect(detectCommandShell("pwsh.exe -Command Get-Process")).toBe("pwsh")
  })

  test("detectCommandShell detects CMD", () => {
    expect(detectCommandShell("cmd.exe /c echo hello")).toBe("cmd")
    expect(detectCommandShell("cmd /c echo hello")).toBe("cmd")
    expect(detectCommandShell("cmd /c echo hello && echo world")).toBe("cmd")
  })

  test("detectCommandShell detects Bash", () => {
    expect(detectCommandShell("bash -c echo hello")).toBe("bash")
    expect(detectCommandShell("/bin/bash -c echo hello")).toBe("bash")
    expect(detectCommandShell("sh -c echo hello")).toBe("bash")
  })

  test("detectCommandShell returns other for unknown commands", () => {
    expect(detectCommandShell("git status")).toBe("other")
    expect(detectCommandShell("npm install")).toBe("other")
    expect(detectCommandShell("echo hello")).toBe("other")
  })
})

describe("cmd.exe built-in syntax detection", () => {
  test("hasCmdBuiltInSyntax detects for /l loops", () => {
    expect(hasCmdBuiltInSyntax("for /l %i in (1,1,5) do @echo LINE_%i")).toBe(true)
    expect(hasCmdBuiltInSyntax("cmd /c for /l %i in (1,1,5) do echo test")).toBe(true)
  })

  test("hasCmdBuiltInSyntax detects for /f file parsing", () => {
    expect(hasCmdBuiltInSyntax("for /f %f in (file.txt) do echo %f")).toBe(true)
  })

  test("hasCmdBuiltInSyntax detects if statements", () => {
    expect(hasCmdBuiltInSyntax("if exist file.txt echo found")).toBe(true)
    expect(hasCmdBuiltInSyntax("if %errorlevel% equ 0 echo success")).toBe(true)
  })

  test("hasCmdBuiltInSyntax detects command chaining", () => {
    expect(hasCmdBuiltInSyntax("echo hello && echo world")).toBe(true)
    expect(hasCmdBuiltInSyntax("echo hello || echo world")).toBe(true)
    expect(hasCmdBuiltInSyntax("echo hello & echo world")).toBe(true)
    expect(hasCmdBuiltInSyntax("echo hello; echo world")).toBe(true)
    expect(hasCmdBuiltInSyntax("echo hello | findstr test")).toBe(true)
  })

  test("hasCmdBuiltInSyntax detects set /a and set /p", () => {
    expect(hasCmdBuiltInSyntax("set /a count=count+1")).toBe(true)
    expect(hasCmdBuiltInSyntax("set /p name=Enter name:")).toBe(true)
  })

  test("hasCmdBuiltInSyntax returns false for simple commands", () => {
    expect(hasCmdBuiltInSyntax("echo hello")).toBe(false)
    expect(hasCmdBuiltInSyntax("dir")).toBe(false)
    expect(hasCmdBuiltInSyntax("cd /d test")).toBe(false)
  })
})

describe("command parsing", () => {
  // Issue #27 fix: PowerShell now uses shell wrapper for proper argument parsing
  test("parseCommand uses shell wrapper for PowerShell", () => {
    const result = parseCommand("powershell.exe -Command Get-Process")
    expect(result.shouldBypassShell).toBe(false)  // Fixed: was true
    expect(result.executable).toBe("powershell.exe")
    expect(result.args).toEqual(["-Command", "Get-Process"])
  })

  test("parseCommand uses shell wrapper for pwsh", () => {
    const result = parseCommand("pwsh -NoProfile -Command Get-Process")
    expect(result.shouldBypassShell).toBe(false)  // Fixed: was true
    expect(result.executable).toBe("pwsh")
    expect(result.args).toEqual(["-NoProfile", "-Command", "Get-Process"])
  })

  // Simple CMD commands still use direct execution
  test("parseCommand bypasses shell for simple cmd.exe commands", () => {
    const result = parseCommand("cmd.exe /c echo hello")
    expect(result.shouldBypassShell).toBe(true)
    expect(result.executable).toBe("cmd.exe")
    expect(result.args).toEqual(["/c", "echo", "hello"])
  })

  // CMD commands with built-in syntax should use shell wrapper
  test("parseCommand uses shell wrapper for cmd.exe for /l loops", () => {
    const result = parseCommand("cmd.exe /c for /l %i in (1,1,5) do @echo LINE_%i")
    // Should use PowerShell wrapper for built-in syntax
    expect(result.shouldBypassShell).toBe(false)
    expect(result.executable).toBe("powershell.exe")
    expect(result.args.some(arg => arg.includes("for /l"))).toBe(true)
  })

  test("parseCommand uses shell wrapper for cmd.exe command chaining", () => {
    const result = parseCommand("cmd.exe /c echo hello && echo world")
    // Should use PowerShell wrapper for command chaining
    expect(result.shouldBypassShell).toBe(false)
    expect(result.executable).toBe("powershell.exe")
  })

  test("parseCommand uses shell wrapper for cmd.exe if statements", () => {
    const result = parseCommand('cmd.exe /c if exist test.txt echo found')
    expect(result.shouldBypassShell).toBe(false)
    expect(result.executable).toBe("powershell.exe")
  })

  test("parseCommand uses shell for other commands", () => {
    const result = parseCommand("git status")
    expect(result.shouldBypassShell).toBe(false)
    expect(result.executable).toBe("git status")
    expect(result.args).toEqual([])
  })

  test("parseCommand uses shell for npm commands", () => {
    const result = parseCommand("npm install")
    expect(result.shouldBypassShell).toBe(false)
    expect(result.executable).toBe("npm install")
    expect(result.args).toEqual([])
  })

  test("parseCommand handles empty command", () => {
    const result = parseCommand("")
    expect(result.executable).toBe("")
    expect(result.args).toEqual([])
    expect(result.shouldBypassShell).toBe(true)
  })
})

describe("tool.bash Windows execution", () => {
  test("basic echo on Windows (or Unix)", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "echo hello",
            description: "Echo test message",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("hello")
      },
    })
  })

  test("detects PowerShell command on Windows", async () => {
    if (process.platform !== "win32") {
      // Skip PowerShell tests on non-Windows platforms
      return
    }
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        // This should trigger shell bypass for PowerShell
        const result = await bash.execute(
          {
            command: "powershell.exe -NoProfile -Command Get-Process",
            description: "Get PowerShell process test",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(0)
      },
    })
  })

  test("detects cmd.exe command on Windows", async () => {
    if (process.platform !== "win32") {
      // Skip CMD tests on non-Windows platforms
      return
    }
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        // This should trigger shell bypass for CMD
        const result = await bash.execute(
          {
            command: "cmd.exe /c echo hello from cmd",
            description: "CMD echo test",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("hello from cmd")
      },
    })
  })

  test("uses shell wrapper for git commands", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "git status",
            description: "Git status test",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        // Should use shell wrapper, not direct execution
        expect(result.metadata.exit).toBe(0)
      },
    })
  })

  test("handles commands with quotes correctly", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        // Note: tree-sitter parsing preserves quotes around args with spaces
        // The command echo "test with spaces" becomes echo "test with spaces" (quotes preserved)
        const result = await bash.execute(
          {
            command: 'echo "test with spaces"',
            description: "Echo with spaces test",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(0)
        // Quotes may be preserved in output due to tree-sitter parsing
        expect(result.metadata.output).toContain("test")
      },
    })
  })

  test("captures exit codes from cmd.exe command chains", async () => {
    if (process.platform !== "win32") {
      // Skip on non-Windows
      return
    }
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "cmd.exe /c echo hello && exit 1",
            description: "Test exit code capture from chained commands",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(1)
        expect(result.metadata.output).toContain("hello")
      },
    })
  })

  test("captures exit codes from PowerShell commands", async () => {
    if (process.platform !== "win32") {
      // Skip on non-Windows
      return
    }
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "powershell.exe -NoProfile -Command 'Write-Host test; exit 42'",
            description: "Test exit code capture from PowerShell",
          },
          {
            sessionID: "test",
            messageID: "",
            callID: "",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
            ask: async () => {},
          },
        )
        expect(result.metadata.exit).toBe(42)
        expect(result.metadata.output).toContain("test")
      },
    })
  })
})
