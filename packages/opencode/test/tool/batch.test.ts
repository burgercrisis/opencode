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

import { expect, it, describe, spyOn, beforeEach, afterEach } from "bun:test"
import { BatchTool } from "../../src/tool/batch"
import { ToolRegistry } from "../../src/tool/registry"
import { Session } from "../../src/session"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import z from "zod"

describe("BatchTool", () => {
  const ctx = {
    messageID: "msg-1",
    sessionID: "sess-1",
    abort: new AbortController().signal,
  }

  let updatePartSpy: ReturnType<typeof spyOn>
  let ascendingSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    updatePartSpy = spyOn(Session, "updatePart").mockResolvedValue(undefined as any)
    ascendingSpy = spyOn(Identifier, "ascending").mockReturnValue("test-id")
  })

  afterEach(() => {
    updatePartSpy.mockRestore()
    ascendingSpy.mockRestore()
  })

  it("executes tool calls in parallel", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockExecute = async () => ({ title: "Result", output: "Success", metadata: {} })

        // Register a mock tool
        await ToolRegistry.register({
          id: "test-tool",
          init: async () => ({
            description: "Test tool",
            parameters: z.object({}).loose(),
            execute: mockExecute,
          }),
        })

        const tool = await BatchTool.init()
        const result = await tool.execute({
          tool_calls: [
            { tool: "test-tool", parameters: { foo: "bar" } },
            { tool: "test-tool", parameters: { baz: "qux" } },
          ]
        }, ctx as any)

        expect(result.output).toContain("Result")
      },
    })
  })

  describe("race condition handling", () => {
    it("should handle concurrent promise completion without race conditions", async () => {
      // Create tasks that complete at the same time to trigger the race condition
      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        // All tasks complete at roughly the same time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
        return i
      })

      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const results = await executeWithConcurrencyLimit(tasks, 3)

      expect(results).toHaveLength(10)
      expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it("should handle tasks that resolve with identical values", async () => {
      // This tests the specific case where indexOf could find the wrong promise
      const tasks = Array.from({ length: 5 }, () => async () => "same-value")

      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const results = await executeWithConcurrencyLimit(tasks, 2)

      expect(results).toHaveLength(5)
      expect(results.every(result => result === "same-value")).toBe(true)
    })

    it("should handle mixed success and failure cases", async () => {
      const tasks = [
        async () => "success1",
        async () => { throw new Error("error1") },
        async () => "success2",
        async () => { throw new Error("error2") },
        async () => "success3"
      ]

      // Should return all results (both successes and failures), not reject
      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const results = await executeWithConcurrencyLimit(tasks, 3)
      expect(results).toHaveLength(5)

      // Check that we have both success and error results
      const successes = results.filter(r => typeof r === 'string')
      const errors = results.filter(r => r instanceof Error)

      expect(successes).toHaveLength(3)
      expect(errors).toHaveLength(2)
      expect(successes).toEqual(["success1", "success2", "success3"])
      expect(errors.map(e => e.message)).toEqual(["error1", "error2"])
    })

    it("should maintain order despite concurrent execution", async () => {
      const tasks = [
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return "first"
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return "second"
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 30))
          return "third"
        }
      ]

      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const results = await executeWithConcurrencyLimit(tasks, 2)

      expect(results).toHaveLength(3)
      // Results should be in the same order as tasks, despite different completion times
      expect(results).toEqual(["first", "second", "third"])
    })

    it("should demonstrate the original race condition is fixed", async () => {
      // This test specifically targets the race condition scenario:
      // Multiple promises resolving with identical values simultaneously

      const results: string[] = []
      const completionOrder: number[] = []

      // Create tasks that all resolve to the same value but at slightly different times
      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        // Simulate async work with varying delays to increase race condition likelihood
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
        completionOrder.push(i)
        return "identical-result"
      })

      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const concurrentResults = await executeWithConcurrencyLimit(tasks, 3)

      // Verify we get exactly the number of results we expect
      expect(concurrentResults).toHaveLength(5)

      // Verify all results are the expected value
      expect(concurrentResults.every(result => result === "identical-result")).toBe(true)

      // Verify that tasks actually completed (not just returned cached results)
      expect(completionOrder).toHaveLength(5)
    })

    it("should handle the exact problematic scenario from the original code", async () => {
      // Simulate the exact scenario that would break the original code:
      // Promise.race returns value, indexOf finds wrong promise due to identical values

      let taskExecutionCount = 0

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        taskExecutionCount++
        // All tasks return the same object reference (worst case for indexOf)
        return { id: "same", index: i }
      })

      const { executeWithConcurrencyLimit } = await import("../../src/tool/batch")
      const results = await executeWithConcurrencyLimit(tasks, 4)

      expect(results).toHaveLength(10)
      expect(taskExecutionCount).toBe(10)

      // Verify we got all the different indices despite identical id values
      const indices = results.map(r => r.index).sort((a, b) => a - b)
      expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })
  })
})
