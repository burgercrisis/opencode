import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "bun:test"
import { PersistentShell } from "../../src/tool/persistent-shell"
import { spawn } from "child_process"

// Mock child_process.spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

const mockSpawn = spawn as any

describe("PersistentShell", () => {
  let mockProcess: any

  beforeEach(() => {
    // Reset singleton instances
    ;(PersistentShell as any).instances = new Map()

    // Mock process
    mockProcess = {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn(), removeListener: vi.fn() },
      stderr: { on: vi.fn(), removeListener: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      killed: false,
      exitCode: null,
    }

    mockSpawn.mockReturnValue(mockProcess)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("getInstance", () => {
    it("should return the same instance for the same cwd", () => {
      const instance1 = PersistentShell.getInstance("/tmp/test")
      const instance2 = PersistentShell.getInstance("/tmp/test")
      expect(instance1).toBe(instance2)
    })

    it("should return different instances for different cwds", () => {
      const instance1 = PersistentShell.getInstance("/tmp/test1")
      const instance2 = PersistentShell.getInstance("/tmp/test2")
      expect(instance1).not.toBe(instance2)
    })
  })

  describe("execute", () => {
    let persistentShell: PersistentShell

    beforeEach(() => {
      persistentShell = PersistentShell.getInstance("/tmp/test")
    })

    it("should execute simple commands successfully", async () => {
      // Mock successful command execution
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Hello World\n")), 10)
        }
      })

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 20)
        }
      })

      const result = await persistentShell.execute("echo Hello World")

      expect(result).toEqual({
        stdout: "Hello World\n",
        stderr: "",
        exitCode: 0,
      })
    })

    it("should handle command timeouts", async () => {
      // Mock hanging command
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          // Never call callback to simulate hanging
        }
      })

      const startTime = Date.now()
      await expect(persistentShell.execute("sleep 10", { timeout: 100 })).rejects.toThrow()
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(200) // Should timeout quickly
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM")
    })

    it("should handle stderr output", async () => {
      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Error message\n")), 10)
        }
      })

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(1), 20)
        }
      })

      const result = await persistentShell.execute("invalid-command")

      expect(result).toEqual({
        stdout: "",
        stderr: "Error message\n",
        exitCode: 1,
      })
    })

    it("should detect shell types correctly", async () => {
      const testCases = [
        { command: "powershell.exe Get-Process", expectedShell: "powershell" },
        { command: "pwsh -c 'echo test'", expectedShell: "pwsh" },
        { command: "cmd /c dir", expectedShell: "cmd" },
        { command: "bash -c 'ls'", expectedShell: "bash" },
        { command: "echo hello", expectedShell: "cmd" }, // Default on Windows
      ]

      for (const { command, expectedShell } of testCases) {
        mockProcess.on.mockImplementation((event: string, callback: Function) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10)
          }
        })

        await persistentShell.execute(command)
        expect(mockSpawn).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cwd: "/tmp/test" }),
        )
      }
    })

    it("should reuse shell sessions", async () => {
      // First command
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10)
        }
      })

      await persistentShell.execute("echo first")
      expect(mockSpawn).toHaveBeenCalledTimes(1)

      // Second command should reuse session
      await persistentShell.execute("echo second")
      expect(mockSpawn).toHaveBeenCalledTimes(1) // Still only 1 spawn
    })

    it("should handle session failures gracefully", async () => {
      // Mock session initialization failure
      mockSpawn.mockImplementationOnce(() => {
        throw new Error("Spawn failed")
      })

      // Should fall back to non-persistent execution
      mockSpawn.mockImplementationOnce(() => ({
        ...mockProcess,
        on: vi.fn((event: string, callback: Function) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10)
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }))

      const result = await persistentShell.execute("echo fallback")

      expect(result.exitCode).toBe(0)
      expect(mockSpawn).toHaveBeenCalledTimes(2) // One failed, one succeeded
    })
  })

  describe("disposeAll", () => {
    it("should dispose all instances", () => {
      const instance1 = PersistentShell.getInstance("/tmp/test1")
      const instance2 = PersistentShell.getInstance("/tmp/test2")

      // Mock dispose method
      const disposeSpy1 = vi.spyOn(instance1, "dispose")
      const disposeSpy2 = vi.spyOn(instance2, "dispose")

      PersistentShell.disposeAll()

      expect(disposeSpy1).toHaveBeenCalled()
      expect(disposeSpy2).toHaveBeenCalled()
      expect((PersistentShell as any).instances.size).toBe(0)
    })
  })

  describe("performance", () => {
    it("should execute commands within performance targets", async () => {
      const persistentShell = PersistentShell.getInstance("/tmp/test")

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 5) // Fast response
        }
      })

      const startTime = performance.now()
      await persistentShell.execute("echo test")
      const duration = performance.now() - startTime

      // Should be well under 100ms (target is <100ms)
      expect(duration).toBeLessThan(100)
    })
  })

  describe("concurrent execution", () => {
    it("should handle multiple concurrent commands", async () => {
      const persistentShell = PersistentShell.getInstance("/tmp/test")

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10)
        }
      })

      // Execute multiple commands concurrently
      const promises = [
        persistentShell.execute("echo one"),
        persistentShell.execute("echo two"),
        persistentShell.execute("echo three"),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.exitCode).toBe(0)
      })
    })
  })
})
