import { describe, expect, test, mock, spyOn, beforeAll, afterAll } from "bun:test"
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

const createTestContext = () => ({
  sessionID: "test-session",
  messageID: "test-message", 
  callID: "test-call",
  agent: "test-agent",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => {},
  ask: async () => {},
})

describe("Functional API Tool Tests", () => {
  let testDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    testDir = tmp.path
    ctx = createTestContext()
  })

  describe("CodeSearchTool with functional testing", () => {
    test("handles API responses correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          // Mock fetch but test the actual parsing logic
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"React hooks are functions that let you use state and other React features in functional components."}]}}\n'),
          } as any)
          
          const tool = await CodeSearchTool.init()
          const result = await tool.execute({ 
            query: "React hooks", 
            tokensNum: 5000 
          }, ctx)
          
          expect(result.output).toContain("React hooks are functions")
          expect(result.title).toBe("Code search: React hooks")
          expect(mockFetch).toHaveBeenCalledWith(
            "https://mcp.exa.ai/mcp",
            expect.objectContaining({
              method: "POST",
              body: expect.stringContaining("React hooks"),
            })
          )
          
          mockFetch.mockRestore()
        }
      })
    })

    test("handles empty results gracefully", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[]}}\n'),
          } as any)
          
          const tool = await CodeSearchTool.init()
          const result = await tool.execute({ 
            query: "nonexistent query", 
            tokensNum: 1000 
          }, ctx)
          
          expect(result.output).toContain("No code snippets or documentation found")
          expect(result.title).toBe("Code search: nonexistent query")
          
          mockFetch.mockRestore()
        }
      })
    })

    test("handles API errors", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Internal Server Error"),
          } as any)
          
          const tool = await CodeSearchTool.init()
          
          await expect(tool.execute({ 
            query: "test query", 
            tokensNum: 1000 
          }, ctx)).rejects.toThrow("Code search error (500)")
          
          mockFetch.mockRestore()
        }
      })
    })

    test("validates parameters correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await CodeSearchTool.init()
          
          // Test tokensNum validation
          await expect(tool.execute({ 
            query: "test", 
            tokensNum: 500 // Below minimum
          }, ctx)).rejects.toThrow()
          
          await expect(tool.execute({ 
            query: "test", 
            tokensNum: 100000 // Above maximum
          }, ctx)).rejects.toThrow()
          
          // Test default tokensNum
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"test"}]}}\n'),
          } as any)
          
          const result = await tool.execute({ 
            query: "test" // No tokensNum specified
          }, ctx)
          
          expect(mockFetch).toHaveBeenCalledWith(
            "https://mcp.exa.ai/mcp",
            expect.objectContaining({
              body: expect.stringContaining('"tokensNum":5000'), // Default value
            })
          )
          
          mockFetch.mockRestore()
        }
      })
    })
  })

  describe("WebSearchTool with functional testing", () => {
    test("handles search responses correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Search results for web development"}]}}\n'),
          } as any)
          
          const tool = await WebSearchTool.init()
          const result = await tool.execute({ 
            query: "web development" 
          }, ctx)
          
          expect(result.output).toContain("Search results for web development")
          expect(result.title).toBe("Web search: web development")
          
          mockFetch.mockRestore()
        }
      })
    })

    test("uses default parameters correctly", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"test"}]}}\n'),
          } as any)
          
          const tool = await WebSearchTool.init()
          await tool.execute({ 
            query: "test" // Minimal parameters
          }, ctx)
          
          expect(mockFetch).toHaveBeenCalledWith(
            "https://mcp.exa.ai/mcp",
            expect.objectContaining({
              body: expect.stringContaining('"numResults":8'), // Default
              body: expect.stringContaining('"type":"auto"'), // Default
              body: expect.stringContaining('"livecrawl":"fallback"'), // Default
            })
          )
          
          mockFetch.mockRestore()
        }
      })
    })

    test("handles custom parameters", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"test"}]}}\n'),
          } as any)
          
          const tool = await WebSearchTool.init()
          await tool.execute({ 
            query: "test",
            numResults: 5,
            type: "deep",
            livecrawl: "preferred",
            contextMaxCharacters: 5000
          }, ctx)
          
          expect(mockFetch).toHaveBeenCalledWith(
            "https://mcp.exa.ai/mcp",
            expect.objectContaining({
              body: expect.stringContaining('"numResults":5'),
              body: expect.stringContaining('"type":"deep"'),
              body: expect.stringContaining('"livecrawl":"preferred"'),
              body: expect.stringContaining('"contextMaxCharacters":5000'),
            })
          )
          
          mockFetch.mockRestore()
        }
      })
    })
  })

  describe("WebFetchTool with functional testing", () => {
    test("fetches and processes web content", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const htmlContent = `
            <html>
              <head><title>Test Page</title></head>
              <body>
                <h1>Main Title</h1>
                <p>This is a paragraph with <strong>bold text</strong>.</p>
                <script>console.log('script');</script>
                <style>body { margin: 0; }</style>
              </body>
            </html>
          `
          
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(htmlContent),
          } as any)
          
          const tool = await WebFetchTool.init()
          const result = await tool.execute({ 
            url: "https://example.com" 
          }, ctx)
          
          expect(result.output).toContain("Main Title")
          expect(result.output).toContain("bold text")
          expect(result.output).not.toContain("console.log") // Scripts should be removed
          expect(result.output).not.toContain("margin: 0") // Styles should be removed
          
          mockFetch.mockRestore()
        }
      })
    })

    test("handles HTTP errors", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const mockFetch = spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 404,
            text: () => Promise.resolve("Not Found"),
          } as any)
          
          const tool = await WebFetchTool.init()
          
          await expect(tool.execute({ 
            url: "https://example.com/notfound" 
          }, ctx)).rejects.toThrow("Failed to fetch")
          
          mockFetch.mockRestore()
        }
      })
    })

    test("validates URL format", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await WebFetchTool.init()
          
          await expect(tool.execute({ 
            url: "not-a-url" 
          }, ctx)).rejects.toThrow()
          
          await expect(tool.execute({ 
            url: "ftp://example.com" 
          }, ctx)).rejects.toThrow() // Only HTTP/HTTPS allowed
        }
      })
    })
  })

  describe("QuestionTool with functional testing", () => {
    test("asks questions and formats responses", async () => {
      const mockAsk = spyOn(await import("../../src/question"), "Question").ask.mockResolvedValue([
        ["Option 1"],
        ["Option 2", "Option 3"]
      ])
      
      const tool = await QuestionTool.init()
      const questions = [
        { question: "First question?", header: "First", options: [{ label: "Option 1", description: "Desc" }] },
        { question: "Second question?", header: "Second", options: [{ label: "Option 2", description: "Desc" }, { label: "Option 3", description: "Desc" }] }
      ]
      
      const result = await tool.execute({ questions }, ctx)
      
      expect(result.title).toBe("Asked 2 questions")
      expect(result.output).toContain('"First question?"="Option 1"')
      expect(result.output).toContain('"Second question?"="Option 2, Option 3"')
      expect(result.metadata.answers).toEqual([["Option 1"], ["Option 2", "Option 3"]])
      
      mockAsk.mockRestore()
    })

    test("handles unanswered questions", async () => {
      const mockAsk = spyOn(await import("../../src/question"), "Question").ask.mockResolvedValue([
        undefined,
        []
      ])
      
      const tool = await QuestionTool.init()
      const questions = [
        { question: "Unanswered?", header: "Test", options: [] },
        { question: "Empty?", header: "Test", options: [] }
      ]
      
      const result = await tool.execute({ questions }, ctx)
      
      expect(result.output).toContain('"Unanswered?"="Unanswered"')
      expect(result.output).toContain('"Empty?"="Unanswered"')
      
      mockAsk.mockRestore()
    })
  })

  describe("SkillTool with functional testing", () => {
    test("lists available skills", async () => {
      const mockSkillAll = spyOn(await import("../../src/skill"), "Skill").all.mockResolvedValue([
        {
          name: "test-skill",
          description: "A test skill",
          location: path.join(testDir, "skills", "test-skill"),
          content: "# Test Skill\nThis is a test skill."
        }
      ])
      
      const tool = await SkillTool.init()
      const description = (await tool.init?.(ctx))?.description || ""
      
      expect(description).toContain("test-skill")
      expect(description).toContain("A test skill")
      
      mockSkillAll.mockRestore()
    })

    test("loads skill content", async () => {
      const skillDir = path.join(testDir, "test-skill")
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Test Skill\nThis is test content.")
      await fs.writeFile(path.join(skillDir, "script.js"), "console.log('test');")
      
      const mockSkillGet = spyOn(await import("../../src/skill"), "Skill").get.mockResolvedValue({
        name: "test-skill",
        description: "A test skill",
        location: path.join(skillDir, "SKILL.md"),
        content: "# Test Skill\nThis is test content."
      })
      
      const tool = await SkillTool.init()
      const result = await tool.execute({ name: "test-skill" }, ctx)
      
      expect(result.title).toBe("Loaded skill: test-skill")
      expect(result.output).toContain("<skill_content name=\"test-skill\">")
      expect(result.output).toContain("# Test Skill")
      expect(result.output).toContain("This is test content.")
      expect(result.output).toContain("<skill_files>")
      expect(result.output).toContain("script.js")
      
      mockSkillGet.mockRestore()
    })

    test("handles missing skill", async () => {
      const mockSkillGet = spyOn(await import("../../src/skill"), "Skill").get.mockResolvedValue(null)
      const mockSkillAll = spyOn(await import("../../src/skill"), "Skill").all.mockResolvedValue([])
      
      const tool = await SkillTool.init()
      
      await expect(tool.execute({ name: "nonexistent-skill" }, ctx)).rejects.toThrow("Skill \"nonexistent-skill\" not found")
      
      mockSkillGet.mockRestore()
      mockSkillAll.mockRestore()
    })
  })

  describe("LspTool with functional testing", () => {
    test("validates file existence", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await LspTool.init()
          
          await expect(tool.execute({
            operation: "goToDefinition",
            filePath: "nonexistent.ts",
            line: 1,
            character: 1
          }, ctx)).rejects.toThrow("File not found")
        }
      })
    })

    test("validates line and character numbers", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await LspTool.init()
          const testFile = path.join(testDir, "test.ts")
          await fs.writeFile(testFile, "console.log('test');")
          
          // Test invalid line numbers
          await expect(tool.execute({
            operation: "goToDefinition",
            filePath: testFile,
            line: 0, // Invalid (must be >= 1)
            character: 1
          }, ctx)).rejects.toThrow()
          
          await expect(tool.execute({
            operation: "goToDefinition",
            filePath: testFile,
            line: 1,
            character: 0 // Invalid (must be >= 1)
          }, ctx)).rejects.toThrow()
        }
      })
    })

    test("handles LSP unavailability", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await LspTool.init()
          const testFile = path.join(testDir, "test.ts")
          await fs.writeFile(testFile, "console.log('test');")
          
          // Mock LSP.hasClients to return false
          const mockHasClients = spyOn(await import("../../src/lsp"), "LSP").hasClients.mockResolvedValue(false)
          
          await expect(tool.execute({
            operation: "goToDefinition",
            filePath: testFile,
            line: 1,
            character: 1
          }, ctx)).rejects.toThrow("No LSP server available")
          
          mockHasClients.mockRestore()
        }
      })
    })
  })

  describe("Plan tools with functional testing", () => {
    test("PlanEnterTool creates plan file", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          const tool = await PlanEnterTool.init()
          const planContent = "# Test Plan\nThis is a test plan."
          
          const result = await tool.execute({
            planContent
          }, ctx)
          
          expect(result.title).toContain("Plan created")
          expect(result.output).toContain("Plan saved to")
          
          // Verify plan file was created
          const planFiles = await fs.readdir(testDir)
          const planFile = planFiles.find(f => f.endsWith('.plan'))
          expect(planFile).toBeTruthy()
          
          const content = await fs.readFile(path.join(testDir, planFile!), 'utf-8')
          expect(content).toContain(planContent)
        }
      })
    })

    test("PlanExitTool handles plan completion", async () => {
      await Instance.provide({
        directory: testDir,
        fn: async () => {
          // Create a plan file first
          const planFile = path.join(testDir, "test.plan")
          await fs.writeFile(planFile, "# Test Plan\nContent here")
          
          const tool = await PlanExitTool.init()
          
          // Mock Question.ask to return "Yes" (switch to build agent)
          const mockAsk = spyOn(await import("../../src/question"), "Question").ask.mockResolvedValue([["Yes"]])
          
          const result = await tool.execute({}, ctx)
          
          expect(result.title).toBeTruthy()
          expect(result.output).toBeTruthy()
          
          mockAsk.mockRestore()
        }
      })
    })
  })
})
