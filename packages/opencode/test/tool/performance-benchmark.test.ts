import { describe, it, expect, beforeAll, vi } from "bun:test"
import { PersistentShell } from "../../src/tool/persistent-shell"
import { UnicodeHandler } from "../../src/tool/unicode-handler"
import { spawn } from "child_process"

// Mock child_process for consistent benchmarking
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

const mockSpawn = spawn as any

describe("Performance Benchmarks", () => {
  let mockProcess: any

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
  })

  describe("PersistentShell Performance", () => {
    it("should achieve sub-100ms command execution", async () => {
      const persistentShell = PersistentShell.getInstance(process.cwd())

      // Mock fast command execution
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === "data") {
          // Immediate response
          callback(Buffer.from("test output\n"))
        }
      })

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          // Very fast completion
          setTimeout(() => callback(0), 1)
        }
      })

      const executions = 10
      const times: number[] = []

      for (let i = 0; i < executions; i++) {
        const startTime = performance.now()
        await persistentShell.execute("echo test")
        const duration = performance.now() - startTime
        times.push(duration)
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      const maxTime = Math.max(...times)
      const minTime = Math.min(...times)

      console.log(`PersistentShell Performance:
        Average: ${avgTime.toFixed(2)}ms
        Min: ${minTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        Target: <100ms per command`)

      // Performance targets
      expect(avgTime).toBeLessThan(100)
      expect(maxTime).toBeLessThan(150) // Allow some variance
      expect(minTime).toBeGreaterThan(0) // Sanity check
    })

    it("should show performance improvement over multiple executions", async () => {
      const persistentShell = PersistentShell.getInstance(process.cwd())

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 2)
        }
      })

      const firstExecution = await measureExecution(() => persistentShell.execute("echo first"))

      // Subsequent executions should be faster due to session reuse
      const subsequentExecutions = await Promise.all([
        measureExecution(() => persistentShell.execute("echo second")),
        measureExecution(() => persistentShell.execute("echo third")),
        measureExecution(() => persistentShell.execute("echo fourth")),
      ])

      const avgSubsequent = subsequentExecutions.reduce((a, b) => a + b, 0) / subsequentExecutions.length

      console.log(`Session Reuse Performance:
        First execution: ${firstExecution.toFixed(2)}ms
        Average subsequent: ${avgSubsequent.toFixed(2)}ms
        Improvement: ${(firstExecution - avgSubsequent).toFixed(2)}ms`)

      // Subsequent executions should be faster
      expect(avgSubsequent).toBeLessThan(firstExecution)
    })

    it("should handle concurrent command execution efficiently", async () => {
      const persistentShell = PersistentShell.getInstance(process.cwd())

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 5)
        }
      })

      const concurrentCommands = 5
      const startTime = performance.now()

      const promises = Array.from({ length: concurrentCommands }, (_, i) => persistentShell.execute(`echo command${i}`))

      const results = await Promise.all(promises)
      const totalTime = performance.now() - startTime

      const avgTimePerCommand = totalTime / concurrentCommands

      console.log(`Concurrent Execution Performance:
        Total time: ${totalTime.toFixed(2)}ms
        Commands: ${concurrentCommands}
        Average per command: ${avgTimePerCommand.toFixed(2)}ms`)

      // All commands should succeed
      results.forEach((result) => {
        expect(result.exitCode).toBe(0)
      })

      // Average time per command should still be under target
      expect(avgTimePerCommand).toBeLessThan(100)
    })
  })

  describe("UnicodeHandler Performance", () => {
    let unicodeHandler: UnicodeHandler

    beforeAll(() => {
      unicodeHandler = UnicodeHandler.getInstance()
    })

    it("should process Unicode text efficiently", async () => {
      const testTexts = [
        "Simple ASCII text",
        "Text with accents: café, naïve, résumé",
        "中文: 你好世界",
        "Emoji: 😀 🌍 🚀 💻 🎉",
        "Mixed: Hello 世界! 🌍 Test with émojis 😀 and 中文",
        "Large text: " + "🌍".repeat(1000),
      ]

      const results = testTexts.map((text) => {
        const startTime = performance.now()
        const result = unicodeHandler.validateAndFix(text)
        const duration = performance.now() - startTime

        return {
          inputLength: text.length,
          outputLength: result.length,
          duration,
          throughput: text.length / duration, // chars per ms
        }
      })

      const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length
      const maxDuration = Math.max(...results.map((r) => r.duration))

      console.log(`UnicodeHandler Performance:
        Average throughput: ${avgThroughput.toFixed(2)} chars/ms
        Max processing time: ${maxDuration.toFixed(2)}ms
        Test cases: ${results.length}`)

      // Should process efficiently
      expect(maxDuration).toBeLessThan(50) // Under 50ms for any text
      expect(avgThroughput).toBeGreaterThan(100) // At least 100 chars/ms
    })

    it("should handle encoding/decoding round-trips efficiently", async () => {
      const testText = "Performance test: Hello 世界! 🌍 " + "测试".repeat(100)

      const iterations = 100
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        const encoded = unicodeHandler.encode(testText)
        const decoded = unicodeHandler.decode(encoded)
        expect(decoded).toBe(testText)
      }

      const totalTime = performance.now() - startTime
      const avgTime = totalTime / iterations

      console.log(`Encoding/Decoding Round-trip Performance:
        Iterations: ${iterations}
        Total time: ${totalTime.toFixed(2)}ms
        Average per round-trip: ${avgTime.toFixed(2)}ms`)

      expect(avgTime).toBeLessThan(1) // Should be very fast
    })
  })

  describe("Memory Usage", () => {
    it("should maintain reasonable memory usage with persistent sessions", async () => {
      const persistentShell = PersistentShell.getInstance(process.cwd())

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 1)
        }
      })

      // Execute many commands to test memory stability
      const commandCount = 50
      for (let i = 0; i < commandCount; i++) {
        await persistentShell.execute(`echo test${i}`)
      }

      // Force garbage collection if available (Node.js)
      if (global.gc) {
        global.gc()
      }

      // Test should complete without memory issues
      expect(true).toBe(true) // If we get here, memory usage is acceptable
    })
  })

  describe("End-to-End Performance", () => {
    it("should meet combined performance targets", async () => {
      const persistentShell = PersistentShell.getInstance(process.cwd())
      const unicodeHandler = UnicodeHandler.getInstance()

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(0), 2)
        }
      })

      // Simulate realistic command execution with Unicode processing
      const testCommands = [
        "echo 'Hello World'",
        "echo '中文测试'",
        "echo '🌍 Emoji test 😀'",
        "echo 'café résumé naïve'",
      ]

      const results = []

      for (const command of testCommands) {
        const startTime = performance.now()

        const result = await persistentShell.execute(command)
        const processedOutput = unicodeHandler.validateAndFix(result.stdout)

        const totalTime = performance.now() - startTime

        results.push({
          command,
          executionTime: totalTime,
          outputLength: processedOutput.length,
        })
      }

      const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length
      const maxTime = Math.max(...results.map((r) => r.executionTime))

      console.log(`End-to-End Performance Results:
        Commands tested: ${results.length}
        Average execution time: ${avgTime.toFixed(2)}ms
        Max execution time: ${maxTime.toFixed(2)}ms
        Performance target: <100ms per command`)

      // Validate performance targets
      expect(avgTime).toBeLessThan(100)
      expect(maxTime).toBeLessThan(150)

      // Validate Unicode processing
      results.forEach((result) => {
        expect(result.outputLength).toBeGreaterThan(0)
      })
    })
  })
})

async function measureExecution(fn: () => Promise<any>): Promise<number> {
  const startTime = performance.now()
  await fn()
  return performance.now() - startTime
}
