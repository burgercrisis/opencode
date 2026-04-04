import { describe, expect, test } from "bun:test"
import { Shell } from "../../src/shell/shell"
import type { ChildProcess } from "child_process"

describe("Shell additional coverage", () => {
  test("killTree exits early when no pid", async () => {
    const proc = { pid: 0 } as unknown as ChildProcess
    await Shell.killTree(proc)
  })

  test("killTree exits early when exited callback returns true", async () => {
    const proc = { pid: 12345 } as unknown as ChildProcess
    await Shell.killTree(proc, { exited: () => true })
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

  test("killTree uses taskkill on win32", async () => {
    const originalPlatform = process.platform

    Object.defineProperty(process, "platform", { value: "win32" })

    const proc = {
      pid: 12345,
    } as unknown as ChildProcess

    await Shell.killTree(proc)

    Object.defineProperty(process, "platform", { value: originalPlatform })
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

  test("acceptable returns SHELL when not blacklisted", () => {
    const originalEnv = { ...process.env }
    const originalPlatform = process.platform

    Object.defineProperty(process, "platform", { value: "linux" })
    process.env.SHELL = "/bin/bash"

    const shell = Shell.acceptable()
    expect(shell).toBe("/bin/bash")

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
  })

  test("preferred uses fallback when SHELL not set", () => {
    const originalEnv = { ...process.env }
    const originalPlatform = process.platform

    delete process.env.SHELL
    Object.defineProperty(process, "platform", { value: "darwin" })

    const shell = Shell.preferred()
    expect(shell).toBe("/bin/zsh")

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
  })

  test("fallback returns bash on linux when available", () => {
    const originalEnv = { ...process.env }
    const originalPlatform = process.platform
    const originalWhich = Bun.which

    delete process.env.SHELL
    Object.defineProperty(process, "platform", { value: "linux" })
    Bun.which = (() => "/bin/bash") as any

    const shell = Shell.preferred()
    expect(shell).toBe("/bin/bash")

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
    Bun.which = originalWhich
  })

  test("fallback returns /bin/sh on linux when no bash", () => {
    const originalEnv = { ...process.env }
    const originalPlatform = process.platform
    const originalWhich = Bun.which

    delete process.env.SHELL
    Object.defineProperty(process, "platform", { value: "linux" })
    Bun.which = (() => null) as any

    const shell = Shell.preferred()
    expect(shell).toBe("/bin/sh")

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.env = originalEnv
    Bun.which = originalWhich
  })

  test("killTree catches error and uses proc.kill", async () => {
    const originalPlatform = process.platform
    const originalKill = process.kill

    Object.defineProperty(process, "platform", { value: "linux" })
    
    // Make process.kill throw an error to trigger the catch block
    process.kill = (() => {
      throw new Error("test error")
    }) as any

    const proc = {
      pid: 12345,
      kill: () => {},
    } as unknown as ChildProcess

    await Shell.killTree(proc, { exited: () => false })

    Object.defineProperty(process, "platform", { value: originalPlatform })
    process.kill = originalKill
  })
})
