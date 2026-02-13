import { describe, expect, test } from "bun:test"
import { Shell } from "../../src/shell/shell"
import type { ChildProcess } from "child_process"

describe("Shell additional coverage", () => {
  test("killTree exits early when no pid", async () => {
    const proc = { pid: 0 } as unknown as ChildProcess
    await Shell.killTree(proc)
  })

  test("killTree sends signals on unix-like platforms", async () => {
    const originalPlatform = process.platform
    const originalKill = process.kill

    // override for testing
    process.kill = (() => {
      return undefined
    }) as any

    Object.defineProperty(process, "platform", { value: "linux" })

    const proc = {
      pid: 12345,
      kill: () => {},
    } as unknown as ChildProcess

    await Shell.killTree(proc, { exited: () => false })

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.kill = originalKill
  })

  test("fallback selects COMSPEC on win32 when no bash or git", () => {
    const originalPlatform = process.platform
    const originalEnv = { ...process.env }
    const originalWhich = Bun.which

    Object.defineProperty(process, "platform", { value: "win32" })
    process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe"

    // override for testing
    Bun.which = (() => null) as any

    const shell = Shell.acceptable()
    expect(shell).toBe(process.env.COMSPEC)

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
    Bun.which = originalWhich
  })

  test("preferred returns SHELL when set", () => {
    const originalEnv = { ...process.env }
    process.env.SHELL = "/usr/bin/custom-shell"

    const shell = Shell.preferred()
    expect(shell).toBe("/usr/bin/custom-shell")

    process.env = originalEnv
  })

  test("acceptable falls back when BLACKLISTed", () => {
    const originalEnv = { ...process.env }
    const originalPlatform = process.platform

    Object.defineProperty(process, "platform", { value: "win32" })
    process.env.SHELL = "C:\\Program Files\\nu\\nu.exe"

    const shell = Shell.acceptable()
    expect(shell).not.toBe(process.env.SHELL)

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
  })

  test("getShellArgs covers all shell types", () => {
    const zsh = Shell.getShellArgs("/bin/zsh", "echo 1")
    expect(zsh).toContain("-l")

    const bash = Shell.getShellArgs("/bin/bash", "echo 1")
    expect(bash).toContain("-l")

    const pwsh = Shell.getShellArgs("pwsh.exe", "echo 1")
    expect(pwsh).toEqual(["-NoProfile", "-Command", "echo 1"])

    const fish = Shell.getShellArgs("fish", "echo 1")
    expect(fish).toEqual(["-c", "echo 1"])

    const other = Shell.getShellArgs("/usr/bin/env", "echo 1")
    expect(other).toEqual(["-c", "-l", "echo 1"])
  })

  test("hasDynamicEnvVars detects dynamic vars", () => {
    expect(Shell.hasDynamicEnvVars("echo %cd%")).toBe(true)
    expect(Shell.hasDynamicEnvVars("echo %random%")).toBe(true)
    expect(Shell.hasDynamicEnvVars("echo %NORMAL_VAR%")).toBe(false)
  })

  test("isCmdCommand detects cmd invocations", () => {
    expect(Shell.isCmdCommand("cmd /c dir")).toBe(true)
    expect(Shell.isCmdCommand("cmd.exe /c dir")).toBe(true)
    expect(Shell.isCmdCommand("echo hello")).toBe(false)
  })

  test("normalizeExitCode handles undefined and error cases", () => {
    expect(Shell.normalizeExitCode(0, false)).toBe(0)
    expect(Shell.normalizeExitCode(0, true)).toBe(1)
    expect(Shell.normalizeExitCode(undefined, true)).toBe(1)
    expect(Shell.normalizeExitCode(undefined, false)).toBe(0)
  })

  test("getSpawnConfig non-win32 path returns shell args without using shell flag", () => {
    const originalPlatform = process.platform

    Object.defineProperty(process, "platform", { value: "linux" })

    const config = Shell.getSpawnConfig("echo 1")
    expect(config.useShellFlag).toBe(false)
    expect(config.args.length).toBeGreaterThan(0)

    Object.defineProperty(process, "platform", { value: originalPlatform })
  })
})

