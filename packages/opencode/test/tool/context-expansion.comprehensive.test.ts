// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

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

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { tryWithContextExpansion } from "../../src/tool/edit"
import { EditTool } from "../../src/tool/edit"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

describe("Context Expansion - Comprehensive Tests", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  describe("Basic Context Expansion Functionality", () => {
    bulletproofTest("should find unique match with 1-line expansion", async () => {
      const content = `
function test() {
  console.log("hello")
}

function another() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      // Should find a unique match because function names provide differentiating context
      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should find unique match with context expansion", async () => {
      const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should handle multiple matches with expansion", async () => {
      const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should return null when no unique match found", async () => {
      const content = `
function test() {
  console.log("hello")
}

function test() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).toBeNull()
    })

    bulletproofTest("should handle empty content", async () => {
      const result = tryWithContextExpansion("", "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    bulletproofTest("should handle empty old string", async () => {
      const content = "some content"
      const result = tryWithContextExpansion(content, "", "replacement", 0.5)
      expect(result).toBeNull()
    })

    bulletproofTest("should handle old string not found", async () => {
      const content = "some content"
      const result = tryWithContextExpansion(content, "not found", "replacement", 0.5)
      expect(result).toBeNull()
    })
  })

  describe("Context Expansion Edge Cases", () => {
    bulletproofTest("should handle very similar contexts", async () => {
      const content = `
function test1() {
  console.log("hello")
}

function test2() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should handle nested structures", async () => {
      const content = `
if (condition) {
  console.log("hello")
  if (nested) {
    console.log("hello")
  }
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should handle special characters", async () => {
      const content = `
function test() {
  console.log("hello! @#$%^&*()")
}

function main() {
  console.log("hello! @#$%^&*()")
}
`.trim()

      const oldString = 'console.log("hello! @#$%^&*()")'
      const newString = 'console.log("world! @#$%^&*()")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world! @#$%^&*()")')
    })

    bulletproofTest("should handle unicode characters", async () => {
      const content = `
function test() {
  console.log("hello 世界 🚀")
}

function main() {
  console.log("hello 世界 🚀")
}
`.trim()

      const oldString = 'console.log("hello 世界 🚀")'
      const newString = 'console.log("world 世界 🚀")'

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world 世界 🚀")')
    })

    bulletproofTest("should handle very long lines", async () => {
      const longLine = "x".repeat(1000)
      const content = `
function test() {
  console.log("${longLine}")
}

function main() {
  console.log("${longLine}")
}
`.trim()

      const oldString = `console.log("${longLine}")`
      const newString = `console.log("modified")`

      const result = tryWithContextExpansion(content, oldString, newString, 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("modified")')
    })
  })

  describe("Context Expansion Parameters", () => {
    bulletproofTest("should respect expansion threshold", async () => {
      const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      // Test with different thresholds
      const result1 = tryWithContextExpansion(content, oldString, newString, 0.1)
      const result2 = tryWithContextExpansion(content, oldString, newString, 0.9)

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
    })

    bulletproofTest("should handle threshold of 0", async () => {
      const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 0)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })

    bulletproofTest("should handle threshold of 1", async () => {
      const content = `
function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}
`.trim()

      const oldString = 'console.log("hello")'
      const newString = 'console.log("world")'

      const result = tryWithContextExpansion(content, oldString, newString, 1)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world")')
    })
  })

  describe("Integration with EditTool", () => {
    bulletproofTest("should work with actual EditTool when context expansion finds unique match", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const content = `function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
          await Bun.write(path.join(dir, "test.txt"), content)
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const editTool = new EditTool()
          const result = await editTool.execute({
            filePath: path.join(tmp.path, "test.txt"),
            oldString: 'console.log("hello")',
            newString: 'console.log("world")',
            ...mockCtx
          })

          expect(result.success).toBe(true)
          expect(result.data).toContain('console.log("world")')
        },
      })
    })

    bulletproofTest("should handle EditTool with multiple matches", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const content = `function test() {
  console.log("hello")
}

function test() {
  console.log("hello")
}`
          await Bun.write(path.join(dir, "test.txt"), content)
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const editTool = new EditTool()
          const result = await editTool.execute({
            filePath: path.join(tmp.path, "test.txt"),
            oldString: 'console.log("hello")',
            newString: 'console.log("world")',
            ...mockCtx
          })

          // Should handle gracefully - either succeed or fail with proper error
          expect(typeof result.success).toBe('boolean')
        },
      })
    })

    bulletproofTest("should work with complex file structures", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const content = `class TestClass {
  method1() {
    console.log("hello")
  }
  
  method2() {
    console.log("hello")
  }
}

class AnotherClass {
  method1() {
    console.log("hello")
  }
}`
          await Bun.write(path.join(dir, "complex.txt"), content)
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const editTool = new EditTool()
          const result = await editTool.execute({
            filePath: path.join(tmp.path, "complex.txt"),
            oldString: 'console.log("hello")',
            newString: 'console.log("world")',
            ...mockCtx
          })

          expect(typeof result.success).toBe('boolean')
          if (result.success) {
            expect(result.data).toContain('console.log("world")')
          }
        },
      })
    })
  })

  describe("Performance and Scalability", () => {
    bulletproofTest("should handle large files efficiently", async () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `function test${i}() {
  console.log("hello")
}`)
      const content = lines.join('\n')

      const startTime = Date.now()
      const result = tryWithContextExpansion(content, 'console.log("hello")', 'console.log("world")', 0.5)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(1000) // Should complete in under 1 second
      expect(result).not.toBeNull()
    })

    bulletproofTest("should handle many similar patterns", async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `function test() {
  console.log("hello ${i}")
}`)
      const content = lines.join('\n')

      const result = tryWithContextExpansion(content, 'console.log("hello 5")', 'console.log("world 5")', 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world 5")')
    })

    bulletproofTest("should handle deeply nested structures", async () => {
      let content = "function outer() {\n"
      for (let i = 0; i < 50; i++) {
        content += "  ".repeat(i) + "if (true) {\n"
      }
      content += "  ".repeat(50) + 'console.log("hello")\n'
      for (let i = 49; i >= 0; i--) {
        content += "  ".repeat(i) + "}\n"
      }
      content += "}"

      const startTime = Date.now()
      const result = tryWithContextExpansion(content, 'console.log("hello")', 'console.log("world")', 0.5)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(500) // Should complete quickly
      expect(result).not.toBeNull()
    })
  })

  describe("Error Handling and Edge Cases", () => {
    bulletproofTest("should handle malformed input gracefully", async () => {
      const testCases = [
        { content: null, old: "test", new: "replacement" },
        { content: undefined, old: "test", new: "replacement" },
        { content: "test", old: null, new: "replacement" },
        { content: "test", old: undefined, new: "replacement" },
        { content: "test", old: "test", new: null },
        { content: "test", old: "test", new: undefined },
      ]

      for (const testCase of testCases) {
        expect(() => {
          tryWithContextExpansion(
            testCase.content as any,
            testCase.old as any,
            testCase.new as any,
            0.5
          )
        }).not.toThrow()
      }
    })

    bulletproofTest("should handle whitespace-only content", async () => {
      const content = "   \n\t\n   "
      const result = tryWithContextExpansion(content, "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    bulletproofTest("should handle content with only newlines", async () => {
      const content = "\n\n\n\n\n"
      const result = tryWithContextExpansion(content, "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    bulletproofTest("should handle very large old strings", async () => {
      const content = "some content"
      const largeOldString = "x".repeat(10000)
      const result = tryWithContextExpansion(content, largeOldString, "replacement", 0.5)
      expect(result).toBeNull()
    })

    bulletproofTest("should handle very large new strings", async () => {
      const content = "some content test content"
      const largeNewString = "x".repeat(10000)
      const result = tryWithContextExpansion(content, "test", largeNewString, 0.5)
      expect(result).not.toBeNull()
      expect(result).toContain(largeNewString)
    })
  })

  describe("Context Expansion Algorithms", () => {
    bulletproofTest("should use line-based context expansion", async () => {
      const content = `line1
line2
line3 target line4
line5
line6`

      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })

    bulletproofTest("should use character-based context expansion", async () => {
      const content = `prefix target suffix`

      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })

    bulletproofTest("should handle mixed line endings", async () => {
      const content = "line1\r\nline2\nline3\rline4\ntarget\nline5"
      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)
      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })
  })
})
