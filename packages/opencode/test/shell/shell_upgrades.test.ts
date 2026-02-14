import { expect, test, describe } from "bun:test"
import { Shell } from "../../src/shell/shell"

describe("Shell Upgrades (Reflecting 5a87a6a Branch Point)", () => {
  describe("Unit Tests: isPowerShellCommand", () => {
    test("detects powershell and pwsh", () => {
      expect(Shell.isPowerShellCommand("powershell -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("pwsh -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("powershell.exe -c \"echo 1\"")).toBe(true)
      expect(Shell.isPowerShellCommand("git status")).toBe(false)
    })
  })

  describe("Unit Tests: isCmdBuiltin", () => {
    test("detects CMD builtins", () => {
      expect(Shell.isCmdBuiltin("dir")).toBe(true)
      expect(Shell.isCmdBuiltin("copy file1 file2")).toBe(true)
      expect(Shell.isCmdBuiltin("type file.txt")).toBe(true)
      expect(Shell.isCmdBuiltin("git status")).toBe(false)
    })
  })

  describe("Unit Tests: getSpawnConfig (Routing Logic)", () => {
    test("routes bare CMD builtins to cmd.exe", () => {
      if (process.platform !== "win32") return
      
      const config = Shell.getSpawnConfig("dir")
      expect(config.executable).toMatch(/cmd\.exe$/i)
      expect(config.args).toEqual(["/c", "dir /a"])
    })

    test("routes powershell commands with correct args", () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("powershell -Command \"echo 1\"")
      expect(config.executable).toMatch(/powershell\.exe$/i)
      expect(config.args).toContain("-Command")
      // Check if any argument contains the command, accounting for preference injection
      expect(config.args.some(arg => arg.includes("echo 1"))).toBe(true)
    })

    test("routes cmd commands with correct args", () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("cmd /c echo hello")
      expect(config.executable).toMatch(/cmd\.exe$/i)
      expect(config.args).toContain("/c")
      expect(config.args).toContain("echo hello")
    })

    test("handles delayed expansion in chained commands", () => {
      if (process.platform !== "win32") return

      const config = Shell.getSpawnConfig("cmd /c cd %temp% && echo %cd%")
      expect(config.args).toContain("/V:ON")
      // Check if it converted %cd% to !cd!
      expect(config.args[config.args.length - 1]).toContain("!cd!")
    })
  })
})
