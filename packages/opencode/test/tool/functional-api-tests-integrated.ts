import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { CodeSearchTool } from "../../src/tool/codesearch"
import { WebSearchTool } from "../../src/tool/websearch"
import { WebFetchTool } from "../../src/tool/webfetch"
import { LspTool } from "../../src/tool/lsp"
import { SkillTool } from "../../src/tool/skill"
import { QuestionTool } from "../../src/tool/question"
import { PlanEnterTool, PlanExitTool } from "../../src/tool/plan"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

// Cross-platform test context
const createTestContext = () => ({
  sessionID: "test-session",
  messageID: "test-message",
  callID: "test-call",
  agent: "test-agent",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => { },
  ask: async () => { },
})

describe("Functional API Tool Tests - Integrated (No Mocking)", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
  })

  afterAll(async () => {
    // Cleanup any test files
    try {
      const files = await fs.readdir(testDir)
      for (const file of files) {
        await fs.rm(path.join(testDir, file), { recursive: true })
      }
    } catch (error) {
      console.warn("Cleanup warning:", error)
    }
  })

  describe("CodeSearchTool with integrated testing", () => {
    test("performs actual code search with real API", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await CodeSearchTool.init()

          // Test with a simple query that should return results
          const result = await tool.execute({
            query: "React hooks",
            tokensNum: 1000
          }, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("Code search")
          expect(result.metadata.query).toBe("React hooks")
          expect(result.metadata.tokensNum).toBe(1000)

          // Should contain actual search results, not mocked data
          expect(result.output).not.toContain("React hooks are functions that let you use state and other React features")
        }
      })
    }, 30000) // 30 second timeout for real API calls

    test("handles API errors gracefully", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await CodeSearchTool.init()

          // Test with a query that might cause issues
          const result = await tool.execute({
            query: "", // Empty query
            tokensNum: 1000
          }, ctx)

          // Should handle empty query gracefully
          expect(result.output).toContain("No code snippets or documentation found")
          expect(result.title).toBe("Code search: ") // Empty query in title
        }
      })
    }, 30000)

    test("validates input parameters correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await CodeSearchTool.init()

          // Test with various token numbers
          const result1 = await tool.execute({
            query: "test",
            tokensNum: 500
          }, ctx)

          const result2 = await tool.execute({
            query: "test",
            tokensNum: 10000
          }, ctx)

          expect(result1.metadata.tokensNum).toBe(500)
          expect(result2.metadata.tokensNum).toBe(10000)
          expect(result1.output).toBeTruthy()
          expect(result2.output).toBeTruthy()
        }
      })
    }, 30000)
  })

  describe("WebSearchTool with integrated testing", () => {
    test("performs actual web search with real API", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebSearchTool.init()

          // Test with a simple search query
          const result = await tool.execute({
            query: "TypeScript tutorial",
            domain: "typescript.org"
          }, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("Web search")
          expect(result.metadata.query).toBe("TypeScript tutorial")
          expect(result.metadata.domain).toBe("typescript.org")

          // Should contain actual search results
          expect(result.output).not.toContain("mocked search result")
        }
      })
    }, 30000)

    test("handles search errors gracefully", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebSearchTool.init()

          // Test with problematic query
          const result = await tool.execute({
            query: "", // Empty query
            domain: "invalid-domain-that-does-not-exist.com"
          }, ctx)

          // Should handle errors gracefully
          expect(result.output).toContain("No results found")
          expect(result.title).toBe("Web search")
        }
      })
    }, 30000)
  })

  describe("WebFetchTool with integrated testing", () => {
    test("fetches actual web content", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebFetchTool.init()

          // Test fetching a reliable URL
          const result = await tool.execute({
            url: "https://httpbin.org/json" // Simple test endpoint
          }, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("Web fetch")
          expect(result.metadata.url).toBe("https://httpbin.org/json")

          // Should contain actual JSON response
          expect(result.output).toContain("slideshow") // httpbin.org/json contains this field
        }
      })
    }, 30000)

    test("handles network errors gracefully", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebFetchTool.init()

          // Test with invalid URL
          const result = await tool.execute({
            url: "https://invalid-domain-that-does-not-exist-12345.com"
          }, ctx)

          // Should handle network errors gracefully
          expect(result.output).toContain("Failed to fetch")
          expect(result.title).toBe("Web fetch")
        }
      })
    }, 30000)

    test("validates URL format correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebFetchTool.init()

          // Test URL validation
          await expect(tool.execute({
            url: "not-a-url" // Invalid URL format
          }, ctx)).rejects.toThrow()

          await expect(tool.execute({
            url: "" // Empty URL
          }, ctx)).rejects.toThrow()
        }
      })
    }, 15000)
  })

  describe("QuestionTool with integrated testing", () => {
    test("asks questions and formats responses", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await QuestionTool.init()

          // Mock the ask function to capture the question
          const mockAsk = async (options: any) => {
            expect(options.question).toBe("Test question")
            return ["Test answer"]
          }

          const result = await tool.execute({
            question: "Test question"
          }, { ...ctx, ask: mockAsk })

          expect(result.output).toContain("Test answer")
          expect(result.title).toBe("Question")
          expect(result.metadata.answers).toEqual(["Test answer"])
        }
      })
    }, 15000)

    test("handles unanswered questions", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await QuestionTool.init()

          // Mock the ask function to return undefined (unanswered)
          const mockAsk = async (options: any) => {
            expect(options.question).toBe("Unanswered question")
            return undefined
          }

          const result = await tool.execute({
            question: "Unanswered question"
          }, { ...ctx, ask: mockAsk })

          expect(result.output).toContain("Unanswered")
          expect(result.title).toBe("Question")
          expect(result.metadata.answers).toEqual([])
        }
      })
    }, 15000)
  })

  describe("SkillTool with integrated testing", () => {
    let skillDir: string

    beforeAll(async () => {
      skillDir = path.join(testDir, "skills")
      await fs.mkdir(skillDir, { recursive: true })
    })

    test("lists available skills", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await SkillTool.init()

          // Create a test skill file
          await fs.writeFile(path.join(skillDir, "test-skill.md"), "# Test Skill\nThis is a test skill.")

          const result = await tool.execute({}, ctx)

          expect(result.output).toContain("test-skill")
          expect(result.title).toBe("Available skills")
          expect(result.output).toContain("Test Skill")
        }
      })
    }, 15000)

    test("loads skill content correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await SkillTool.init()

          const result = await tool.execute({
            skill: "test-skill"
          }, ctx)

          expect(result.output).toContain("This is a test skill")
          expect(result.title).toBe("Skill: test-skill")
          expect(result.output).toContain("# Test Skill")
        }
      })
    }, 15000)
  })

  describe("LspTool with integrated testing", () => {
    test("performs LSP operations", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await LspTool.init()

          // Create a test file for LSP operations
          const testFile = path.join(testDir, "test.ts")
          await fs.writeFile(testFile, "export const test = 'hello world'")

          const result = await tool.execute({
            action: "goToDefinition",
            textDocument: {
              uri: `file://${testFile}`,
              languageId: "typescript"
            },
            position: {
              line: 1,
              character: 1
            }
          }, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("LSP")
        }
      })
    }, 30000)

    test("handles LSP errors gracefully", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await LspTool.init()

          // Test with non-existent file
          const result = await tool.execute({
            action: "goToDefinition",
            filePath: "non-existent.ts",
            line: 1,
            character: 1
          }, ctx)

          // Should handle file not found gracefully
          expect(result.output).toContain("not found") || expect(result.output).toContain("File not found")
        }
      })
    }, 30000)
  })

  describe("Plan tools with integrated testing", () => {
    test("PlanEnterTool functionality", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await PlanEnterTool.init()

          const result = await tool.execute({}, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("Plan")
        }
      })
    }, 15000)

    test("PlanExitTool functionality", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await PlanExitTool.init()

          const result = await tool.execute({}, ctx)

          expect(result.output).toBeTruthy()
          expect(result.title).toContain("Plan")
        }
      })
    }, 15000)
  })
})
