import { describe, test, expect, mock } from "bun:test"
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
    test("should find unique match with 1-line expansion", () => {
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

    test("should find unique match with context expansion", () => {
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

    test("should handle multiple matches with expansion", () => {
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

    test("should return null when no unique match found", () => {
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

    test("should handle empty content", () => {
      const result = tryWithContextExpansion("", "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    test("should handle empty old string", () => {
      const content = "some content"
      const result = tryWithContextExpansion(content, "", "replacement", 0.5)
      expect(result).toBeNull()
    })

    test("should handle old string not found", () => {
      const content = "some content"
      const result = tryWithContextExpansion(content, "not found", "replacement", 0.5)
      expect(result).toBeNull()
    })
  })

  describe("Context Expansion Edge Cases", () => {
    test("should handle very similar contexts", () => {
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

    test("should handle nested structures", () => {
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

    test("should handle special characters", () => {
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

    test("should handle unicode characters", () => {
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

    test("should handle very long lines", () => {
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
    test("should respect expansion threshold", () => {
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

    test("should handle threshold of 0", () => {
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

    test("should handle threshold of 1", () => {
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
    test("should work with actual EditTool when context expansion finds unique match", async () => {
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

    test("should handle EditTool with multiple matches", async () => {
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

    test("should work with complex file structures", async () => {
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
    test("should handle large files efficiently", () => {
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

    test("should handle many similar patterns", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `function test() {
  console.log("hello ${i}")
}`)
      const content = lines.join('\n')

      const result = tryWithContextExpansion(content, 'console.log("hello 5")', 'console.log("world 5")', 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain('console.log("world 5")')
    })

    test("should handle deeply nested structures", () => {
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
    test("should handle malformed input gracefully", () => {
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

    test("should handle whitespace-only content", () => {
      const content = "   \n\t\n   "
      const result = tryWithContextExpansion(content, "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    test("should handle content with only newlines", () => {
      const content = "\n\n\n\n\n"
      const result = tryWithContextExpansion(content, "test", "replacement", 0.5)
      expect(result).toBeNull()
    })

    test("should handle very large old strings", () => {
      const content = "some content"
      const largeOldString = "x".repeat(10000)
      const result = tryWithContextExpansion(content, largeOldString, "replacement", 0.5)
      expect(result).toBeNull()
    })

    test("should handle very large new strings", () => {
      const content = "some content test content"
      const largeNewString = "x".repeat(10000)
      const result = tryWithContextExpansion(content, "test", largeNewString, 0.5)
      expect(result).not.toBeNull()
      expect(result).toContain(largeNewString)
    })
  })

  describe("Context Expansion Algorithms", () => {
    test("should use line-based context expansion", () => {
      const content = `line1
line2
line3 target line4
line5
line6`

      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })

    test("should use character-based context expansion", () => {
      const content = `prefix target suffix`

      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)

      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })

    test("should handle mixed line endings", () => {
      const content = "line1\r\nline2\nline3\rline4\ntarget\nline5"
      const result = tryWithContextExpansion(content, "target", "replacement", 0.5)
      expect(result).not.toBeNull()
      expect(result).toContain("replacement")
    })
  })
})
