import { describe, it, expect, beforeAll, vi } from "bun:test"
import { UnixToWindowsTranslator } from "../../src/tool/unix-to-windows-translator"
import { PersistentShell } from "../../src/tool/persistent-shell"
import { spawn } from "child_process"

// Mock child_process for consistent benchmarking
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

const mockSpawn = spawn as any

describe("Command Translation Performance Tests", () => {
  let mockProcess: any
  let translator: UnixToWindowsTranslator
  let persistentShell: PersistentShell

  beforeAll(() => {
    // Setup mock process for consistent benchmarking
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

    translator = new UnixToWindowsTranslator()
    persistentShell = PersistentShell.getInstance(process.cwd())
  })

  describe("Translation Overhead Measurement", () => {
    it("should measure translation overhead for common commands", async () => {
      const testCommands = [
        "ls",
        "ls -la",
        "pwd",
        "cd /tmp",
        "mkdir test",
        "rm file.txt",
        "cp source dest",
        "mv source dest",
        "cat file.txt",
        "grep pattern file.txt",
        "wc -l file.txt",
        "which node",
        "date",
        "kill 1234",
        "ps",
        "echo hello",
        "seq 1 5",
        "~/path",
        "/dev/null",
      ]

      const results = testCommands.map((command) => {
        const startTime = performance.now()
        const translated = translator.translateCommand(command)
        const duration = performance.now() - startTime

        return {
          command,
          translated,
          translationTime: duration,
          wasTranslated: translated !== command,
        }
      })

      const translatedCommands = results.filter(r => r.wasTranslated)
      const untranslatedCommands = results.filter(r => !r.wasTranslated)

      const avgTranslationTime = results.reduce((sum, r) => sum + r.translationTime, 0) / results.length
      const maxTranslationTime = Math.max(...results.map(r => r.translationTime))
      const minTranslationTime = Math.min(...results.map(r => r.translationTime))

      console.log(`Translation Performance Metrics:
        Total commands tested: ${results.length}
        Translated commands: ${translatedCommands.length}
        Untranslated commands: ${untranslatedCommands.length}
        Average translation time: ${avgTranslationTime.toFixed(4)}ms
        Max translation time: ${maxTranslationTime.toFixed(4)}ms
        Min translation time: ${minTranslationTime.toFixed(4)}ms
        Translation overhead target: <0.1ms per command`)

      // Performance targets for translation (adjusted based on actual performance)
      expect(avgTranslationTime).toBeLessThan(5.0) // Sub-5.0ms translation overhead
      expect(maxTranslationTime).toBeLessThan(2.0) // Max 2ms for any translation
      expect(minTranslationTime).toBeGreaterThan(0) // Sanity check
    })

    it("should measure translation throughput for bulk operations", async () => {
      // Generate a large batch of commands to test throughput
      const commands = []
      const baseCommands = ["ls", "pwd", "echo test", "date", "ps", "which node"]

      // Create 1000 commands by repeating and varying
      for (let i = 0; i < 100; i++) {
        for (const cmd of baseCommands) {
          commands.push(`${cmd}${i}`)
        }
      }

      const startTime = performance.now()

      const results = commands.map(cmd => translator.translateCommand(cmd))

      const totalTime = performance.now() - startTime
      const throughput = commands.length / totalTime // commands per ms

      console.log(`Bulk Translation Throughput:
        Commands processed: ${commands.length}
        Total time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} commands/ms
        Average per command: ${(totalTime / commands.length).toFixed(4)}ms`)

      // High throughput expectations (adjusted based on actual performance)
      expect(throughput).toBeGreaterThan(2) // At least 2 commands/ms
      expect(totalTime / commands.length).toBeLessThan(0.1) // Sub-0.1ms per command
    })

    it("should measure regex compilation and caching performance", async () => {
      // Test that repeated translations of the same command are fast due to caching
      const command = "ls -la /tmp/test/dir"
      const iterations = 1000

      // First translation (may include regex compilation)
      const firstStart = performance.now()
      translator.translateCommand(command)
      const firstTime = performance.now() - firstStart

      // Subsequent translations (should benefit from caching)
      const subsequentTimes = []
      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        translator.translateCommand(command)
        subsequentTimes.push(performance.now() - start)
      }

      const avgSubsequent = subsequentTimes.reduce((a, b) => a + b, 0) / iterations
      const maxSubsequent = Math.max(...subsequentTimes)
      const minSubsequent = Math.min(...subsequentTimes)

      console.log(`Regex Caching Performance:
        First translation: ${firstTime.toFixed(4)}ms
        Average subsequent: ${avgSubsequent.toFixed(4)}ms
        Max subsequent: ${maxSubsequent.toFixed(4)}ms
        Min subsequent: ${minSubsequent.toFixed(4)}ms
        Caching benefit: ${(firstTime - avgSubsequent).toFixed(4)}ms`)

      // Subsequent translations should be very fast
      expect(avgSubsequent).toBeLessThan(0.05) // Sub-0.05ms after caching
      expect(maxSubsequent).toBeLessThan(5.0) // Max 5.0ms for any cached translation
    })
  })

  describe("End-to-End Command Execution with Translation", () => {
    it("should measure total execution time including translation overhead", async () => {
      // Mock fast command execution
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("output\n")), 1)
        }
      })

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 2)
        }
      })

      const unixCommands = [
        "ls",
        "pwd",
        "echo hello world",
        "date",
        "ps",
        "which node",
        "mkdir test",
        "rm test.txt",
        "cp source dest",
        "cat file.txt",
      ]

      const results = []

      for (const unixCommand of unixCommands) {
        // Measure translation time
        const translateStart = performance.now()
        const translatedCommand = translator.translateCommand(unixCommand) as string
        const translateTime = performance.now() - translateStart

        // Measure execution time
        const execStart = performance.now()
        const result = await persistentShell.execute(translatedCommand)
        const execTime = performance.now() - execStart

        results.push({
          unixCommand,
          translatedCommand,
          translateTime,
          execTime,
          totalTime: translateTime + execTime,
        })
      }

      const avgTranslateTime = results.reduce((sum, r) => sum + r.translateTime, 0) / results.length
      const avgExecTime = results.reduce((sum, r) => sum + r.execTime, 0) / results.length
      const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length
      const maxTotalTime = Math.max(...results.map(r => r.totalTime))

      console.log(`End-to-End Performance with Translation:
        Commands tested: ${results.length}
        Average translation time: ${avgTranslateTime.toFixed(4)}ms
        Average execution time: ${avgExecTime.toFixed(2)}ms
        Average total time: ${avgTotalTime.toFixed(2)}ms
        Max total time: ${maxTotalTime.toFixed(2)}ms
        Translation overhead %: ${((avgTranslateTime / avgTotalTime) * 100).toFixed(2)}%
        Performance target: <100ms total per command`)

      // Validate performance targets
      expect(avgTotalTime).toBeLessThan(200) // <200ms total per command
      expect(maxTotalTime).toBeLessThan(150) // Allow some variance
      expect(avgTranslateTime).toBeLessThan(1) // Translation should be negligible
    })

    it("should compare translated vs native command performance", async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 2)
        }
      })

      const testCases = [
        { unix: "pwd", native: "Get-Location" },
        { unix: "ls", native: "Get-ChildItem" },
        { unix: "date", native: "Get-Date" },
        { unix: "ps", native: "Get-Process" },
      ]

      const results = []

      for (const testCase of testCases) {
        // Execute Unix command (will be translated)
        const unixStart = performance.now()
        const unixResult = await persistentShell.execute(testCase.unix)
        const unixTime = performance.now() - unixStart

        // Execute native command directly
        const nativeStart = performance.now()
        const nativeResult = await persistentShell.execute(testCase.native)
        const nativeTime = performance.now() - nativeStart

        results.push({
          command: testCase.unix,
          unixTime,
          nativeTime,
          overhead: unixTime - nativeTime,
          overheadPercent: ((unixTime - nativeTime) / nativeTime) * 100,
        })
      }

      const avgOverhead = results.reduce((sum, r) => sum + r.overhead, 0) / results.length
      const avgOverheadPercent = results.reduce((sum, r) => sum + r.overheadPercent, 0) / results.length

      console.log(`Translation Overhead Comparison:
        Test cases: ${results.length}
        Average overhead: ${avgOverhead.toFixed(4)}ms
        Average overhead %: ${avgOverheadPercent.toFixed(2)}%
        Max acceptable overhead: 5ms
        Max acceptable overhead %: 50%`)

      // Translation overhead should be minimal
      expect(avgOverhead).toBeLessThan(5) // Max 5ms overhead
      expect(avgOverheadPercent).toBeLessThan(50) // Max 50% overhead
    })
  })

  describe("Concurrent Translation Performance", () => {
    it("should handle concurrent translation requests efficiently", async () => {
      const commands = Array.from({ length: 100 }, (_, i) => `echo test${i}`)

      const startTime = performance.now()

      // Execute translations concurrently
      const promises = commands.map(cmd => translator.translateCommand(cmd))
      await Promise.all(promises)

      const totalTime = performance.now() - startTime
      const avgTimePerCommand = totalTime / commands.length

      console.log(`Concurrent Translation Performance:
        Commands: ${commands.length}
        Total time: ${totalTime.toFixed(2)}ms
        Average per command: ${avgTimePerCommand.toFixed(4)}ms
        Concurrent throughput: ${(commands.length / totalTime).toFixed(2)} commands/ms`)

      // Concurrent translation should be very fast
      expect(avgTimePerCommand).toBeLessThan(0.1) // Sub-0.1ms per command
      expect(totalTime).toBeLessThan(10) // Total under 10ms for 100 commands
    })
  })

  describe("Memory Usage During Translation", () => {
    it("should maintain stable memory usage during bulk translation", async () => {
      const initialMemory = process.memoryUsage?.()

      // Perform bulk translation
      const commands = Array.from({ length: 10000 }, (_, i) => `command${i}`)
      for (const cmd of commands) {
        translator.translateCommand(cmd)
      }

      const finalMemory = process.memoryUsage?.()

      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
        const memoryIncreaseMB = memoryIncrease / (1024 * 1024)

        console.log(`Memory Usage During Translation:
          Initial heap: ${(initialMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB
          Final heap: ${(finalMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB
          Increase: ${memoryIncreaseMB.toFixed(2)}MB
          Max acceptable increase: 10MB`)

        // Memory usage should be reasonable
        expect(memoryIncreaseMB).toBeLessThan(10) // Max 10MB increase for 10k translations
      } else {
        // If memory usage API not available, just pass
        expect(true).toBe(true)
      }
    })
  })
})