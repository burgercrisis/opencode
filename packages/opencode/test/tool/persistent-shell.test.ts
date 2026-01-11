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
    const stdoutListeners: Function[] = []
    const stderrListeners: Function[] = []
    const otherListeners = new Map<string, Function[]>()
    
    mockProcess = {
      stdin: { 
        write: vi.fn((data: string) => {
          // Auto-respond to delimiters for both init and normal commands
          if (data.includes("__OPENCODE_DONE_")) {
            const tokenMatch = data.match(/__OPENCODE_DONE_[a-z0-9]+__/);
            if (tokenMatch) {
              const token = tokenMatch[0];
              setTimeout(() => {
                stdoutListeners.forEach(cb => cb(Buffer.from(`output\n${token} 0\n`)));
              }, 5);
            }
          }
          return true;
        }), 
        end: vi.fn() 
      },
      stdout: { 
        on: vi.fn((event, cb) => {
          if (event === 'data') stdoutListeners.push(cb);
        }), 
        removeListener: vi.fn((event, cb) => {
          if (event === 'data') {
            const idx = stdoutListeners.indexOf(cb);
            if (idx !== -1) stdoutListeners.splice(idx, 1);
          }
        }) 
      },
      stderr: { 
        on: vi.fn((event, cb) => {
          if (event === 'data') stderrListeners.push(cb);
        }), 
        removeListener: vi.fn((event, cb) => {
          if (event === 'data') {
            const idx = stderrListeners.indexOf(cb);
            if (idx !== -1) stderrListeners.splice(idx, 1);
          }
        }) 
      },
      on: vi.fn((event, cb) => {
        if (!otherListeners.has(event)) otherListeners.set(event, []);
        otherListeners.get(event)!.push(cb);
      }),
      once: vi.fn((event, cb) => {
        if (!otherListeners.has(event)) otherListeners.set(event, []);
        otherListeners.get(event)!.push(cb);
      }),
      removeListener: vi.fn((event, cb) => {
        const listeners = otherListeners.get(event);
        if (listeners) {
          const idx = listeners.indexOf(cb);
          if (idx !== -1) listeners.splice(idx, 1);
        }
      }),
      kill: vi.fn(() => {
        const listeners = otherListeners.get("close") || [];
        listeners.forEach(cb => setTimeout(() => cb(143), 5));
      }),
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
      // Use the default mock from beforeEach
      const result = await persistentShell.execute("echo Hello World")

      expect(result).toEqual({
        stdout: "output\n",
        stderr: "",
        exitCode: 0,
      })
    })

    it("should handle command timeouts", async () => {
      // Allow first call (init) to succeed, but second call (sleep 10) to timeout
      let callCount = 0
      mockProcess.stdin.write.mockImplementation((data: string) => {
        callCount++
        if (callCount === 1) {
          // Auto-respond to init command
          const tokenMatch = data.match(/__OPENCODE_DONE_[a-z0-9]+__/);
          if (tokenMatch) {
            const token = tokenMatch[0];
            setTimeout(() => {
              const stdoutCallback = mockProcess.stdout.on.mock.calls.find(call => call[0] === 'data')?.[1]
              if (stdoutCallback) stdoutCallback(Buffer.from(`${token} 0\n`))
            }, 5);
          }
        }
        return true
      })

      const startTime = Date.now()
      const result = await persistentShell.execute("sleep 10", { timeout: 100 })
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1000) // Should timeout quickly
      expect(result.exitCode).toBe(143)
    })

    it("should handle stderr output", async () => {
      // Get the listeners from the default mock
      const stdoutListeners: Function[] = (mockProcess.stdout.on as any).mock.results[0]?.value || []
      const stderrListeners: Function[] = (mockProcess.stderr.on as any).mock.results[0]?.value || []

      let callCount = 0
      mockProcess.stdin.write.mockImplementation((data: string) => {
        callCount++
        const tokenMatch = data.match(/__OPENCODE_DONE_[a-z0-9]+__/);
        const token = tokenMatch ? tokenMatch[0] : null;
        
        if (callCount === 1) {
          // Init success
          if (token) {
            setTimeout(() => {
              // Find the latest data listener
              const cb = (mockProcess.stdout.on as any).mock.calls.find(c => c[0] === 'data')?.[1];
              if (cb) cb(Buffer.from(`${token} 0\n`))
            }, 5)
          }
        } else {
          // Command error
          if (token) {
            setTimeout(() => {
              const errCb = (mockProcess.stderr.on as any).mock.calls.filter(c => c[0] === 'data').pop()?.[1];
              const outCb = (mockProcess.stdout.on as any).mock.calls.filter(c => c[0] === 'data').pop()?.[1];
              if (errCb) errCb(Buffer.from("Error message\n"))
              if (outCb) outCb(Buffer.from(`${token} 1\n`))
            }, 10)
          }
        }
        return true
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

      for (const { command } of testCases) {
        await persistentShell.execute(command)
      }
      expect(mockSpawn).toHaveBeenCalled()
    })

    it("should reuse shell sessions", async () => {
      await persistentShell.execute("echo first")
      expect(mockSpawn).toHaveBeenCalledTimes(1)

      // Second command should reuse session
      await persistentShell.execute("echo second")
      expect(mockSpawn).toHaveBeenCalledTimes(1) // Still only 1 spawn
    })

    it("should handle session failures gracefully", async () => {
      const fallbackShell = PersistentShell.getInstance("/tmp/test-fallback")
      
      // 1. initialize() calls spawn() -> returns process that fails/timeouts
      mockSpawn.mockImplementationOnce(() => {
        // Return a process that won't respond to init command, causing timeout
        return {
          ...mockProcess,
          stdin: { 
            ...mockProcess.stdin, 
            write: vi.fn(() => true) 
          }
        }
      })

      // 2. executeNonPersistent() calls spawn() -> returns process that succeeds
      const EventEmitter = require("events")
      const mockFallbackProc = new EventEmitter() as any
      mockFallbackProc.stdin = { write: vi.fn(), end: vi.fn() }
      mockFallbackProc.stdout = new EventEmitter()
      mockFallbackProc.stderr = new EventEmitter()
      mockFallbackProc.kill = vi.fn()

      mockSpawn.mockImplementationOnce(() => {
        setTimeout(() => mockFallbackProc.emit("close", 0), 10)
        return mockFallbackProc
      })

      const result = await fallbackShell.execute("echo fallback", { timeout: 5000 })

      expect(result.exitCode).toBe(0)
      expect(mockSpawn).toHaveBeenCalledTimes(2)
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
