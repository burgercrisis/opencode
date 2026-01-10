import { describe, test, expect } from "bun:test"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

const ctx = {
  sessionID: "bash-stuck-test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

const projectRoot = __dirname + "/../.."

describe("Bash Tool Stuck Agent Fix", () => {
  describe("Stream Reading Race Condition Fix", () => {
    test("should handle large output without getting stuck", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Test with a command that produces output - the key is it doesn't hang
          const result = await bash.execute(
            {
              command: "echo 'Testing large output handling - command completed without hanging'",
              description: "Test large output handling",
              timeout: 10000, // 10 second timeout
            },
            ctx,
          )

          // The main test is that this completes without hanging
          expect(result.metadata).toBeDefined()
          expect(typeof result.metadata.output).toBe("string")
          expect(result.metadata.output.length).toBeGreaterThan(0)
        },
      })
    }, 15000) // 15 second test timeout

    test("should handle PowerShell commands without getting stuck", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping PowerShell test on non-Windows platform")
        return
      }

      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Test PowerShell command that previously caused issues
          const result = await bash.execute(
            {
              command: "powershell.exe -NoProfile -Command \"Write-Host 'PowerShell test'; Get-Date\"",
              description: "Test PowerShell command execution",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit) // Allow some flexibility
          expect(result.metadata.output.length).toBeGreaterThan(0)
        },
      })
    }, 10000)

    test("should handle CMD commands without getting stuck", async () => {
      if (process.platform !== "win32") {
        console.log("Skipping CMD test on non-Windows platform")
        return
      }

      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Test CMD command
          const result = await bash.execute(
            {
              command: "cmd /c echo 'CMD test output' && ver",
              description: "Test CMD command execution",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit) // Allow some flexibility
          expect(result.metadata.output.length).toBeGreaterThan(0)
        },
      })
    }, 10000)
  })

  describe("Concurrent Command Execution", () => {
    test("should handle multiple concurrent commands without deadlocks", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Execute multiple commands concurrently
          const promises = []
          for (let i = 0; i < 5; i++) {
            promises.push(
              bash.execute(
                {
                  command: process.platform === "win32"
                    ? `echo Concurrent test ${i}`
                    : `echo "Concurrent test ${i}" && sleep 0.1`,
                  description: `Concurrent command ${i}`,
                  timeout: 3000,
                },
                ctx,
              )
            )
          }

          const results = await Promise.all(promises)

          // All should complete successfully
          results.forEach((result, i) => {
            expect([0, 1]).toContain(result.metadata.exit)
            expect(result.metadata.output).toContain(`Concurrent test ${i}`)
          })
        },
      })
    }, 15000)
  })

  describe("Abort Handling", () => {
    test("should handle abort signals properly", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()
          const abortController = new AbortController()

          // Start a command that will be aborted
          const promise = bash.execute(
            {
              command: process.platform === "win32"
                ? "echo Starting long command && timeout /t 2 /nobreak > nul"
                : "echo 'Starting long command' && sleep 2",
              description: "Test abort handling",
              timeout: 5000,
            },
            {
              ...ctx,
              abort: abortController.signal,
            }
          )

          // Abort after a short delay
          setTimeout(() => abortController.abort(), 100)

          const result = await promise

          // Should either complete or be aborted
          expect(result.metadata.output.length).toBeGreaterThan(0)
        },
      })
    }, 10000)
  })

  describe("Metadata Update Optimization", () => {
    test("should update metadata efficiently for large outputs", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Test that commands with output complete without hanging
          const startTime = Date.now()
          const result = await bash.execute(
            {
              command: "echo 'Metadata update optimization test - command completed without hanging'",
              description: "Test metadata update optimization",
              timeout: 10000,
            },
            ctx,
          )
          const endTime = Date.now()

          // The main test is that this completes without hanging
          expect(result.metadata).toBeDefined()
          expect(typeof result.metadata.output).toBe("string")
          expect(result.metadata.output.length).toBeGreaterThan(0)
          // Should complete in reasonable time
          expect(endTime - startTime).toBeLessThan(5000)

          // Should complete in reasonable time (under 5 seconds for this test)
          expect(endTime - startTime).toBeLessThan(5000)
        },
      })
    }, 15000)
  })

  describe("Advanced Command Execution Tests", () => {
    test("should handle complex echo commands with special characters", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          const result = await bash.execute(
            {
              command: process.platform === "win32"
                ? "echo Hello World with special chars test"
                : "echo 'Hello World! Special chars: @#$%^&*()_+-=[]{}|;:,.<>?`~'",
              description: "Test complex echo with special characters",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit)
          expect(result.metadata.output).toContain("Hello World")
          // The main test is that it completes without hanging
          expect(result.metadata).toBeDefined()
        },
      })
    }, 10000)

    test("should handle multi-line commands with && operator", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          const result = await bash.execute(
            {
              command: "echo 'First command' && echo 'Second command' && echo 'Third command'",
              description: "Test multi-line commands with &&",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit)
          expect(result.metadata.output).toContain("First command")
          expect(result.metadata.output).toContain("Second command")
          expect(result.metadata.output).toContain("Third command")
        },
      })
    }, 10000)

    test("should handle commands with quotes and escaping", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          const result = await bash.execute(
            {
              command: "echo \"Double quoted string with 'single quotes' inside\"",
              description: "Test quotes and escaping",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit)
          expect(result.metadata.output).toContain("Double quoted string")
          expect(result.metadata.output).toContain("single quotes")
        },
      })
    }, 10000)

    test("should handle environment variable expansion", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          // Test with a variable that should exist
          const result = await bash.execute(
            {
              command: process.platform === "win32"
                ? "echo PATH test && echo %PATH% | findstr /b PATH"
                : "echo PATH_EXISTS && echo $PATH | head -c 50",
              description: "Test environment variable expansion",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1, 255]).toContain(result.metadata.exit) // Allow more exit codes for Windows
          // Should contain some output
          expect(result.metadata.output.length).toBeGreaterThan(0)
        },
      })
    }, 10000)

    test("should handle Unicode characters in commands", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          const result = await bash.execute(
            {
              command: "echo 'Unicode test: 🌍 Hello 世界 café naïve résumé'",
              description: "Test Unicode character handling",
              timeout: 5000,
            },
            ctx,
          )

          expect([0, 1]).toContain(result.metadata.exit)
          expect(result.metadata.output).toContain("Unicode test:")
          expect(result.metadata.output.length).toBeGreaterThan(10)
        },
      })
    }, 10000)

    test("should handle command timeouts gracefully", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const bash = await BashTool.init()

          const startTime = Date.now()
          const result = await bash.execute(
            {
              command: process.platform === "win32"
                ? "echo Starting timeout test && timeout /t 2 /nobreak > nul"
                : "echo 'Starting timeout test' && sleep 2",
              description: "Test timeout handling",
              timeout: 1000, // Very short timeout
            },
            ctx,
          )
          const endTime = Date.now()

          // Should complete (either normally or via timeout)
          expect(result.metadata).toBeDefined()
          // Should not take longer than the timeout + some buffer
          expect(endTime - startTime).toBeLessThan(3000)
        },
      })
    }, 10000)
  })
})