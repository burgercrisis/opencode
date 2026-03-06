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

import { expect, test, describe, vi, mock } from "bun:test"
import { ConfigMarkdown } from "../../src/config/markdown"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"

// @ts-ignore
const actualMatter = require("gray-matter")
mock.module("gray-matter", () => {
  return {
    default: (content: string, options: any) => {
      if (content && typeof content === "string" && content.includes("FORCE_FAILURE")) {
        throw new Error("forced failure")
      }
      return actualMatter(content, options)
    }
  }
})

describe("ConfigMarkdown: normal template", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  const template = `This is a @valid/path/to/a/file and it should also match at
  the beginning of a line:

  @another-valid/path/to/a/file

  but this is not:

     - Adds a "Co-authored-by:" footer which clarifies which AI agent
       helped create this commit, using an appropriate \`noreply@...\`
       or \`noreply@anthropic.com\` email address.

  We also need to deal with files followed by @commas, ones
  with @file-extensions.md, even @multiple.extensions.bak,
  hidden directories like @.config/ or files like @.bashrc
  and ones at the end of a sentence like @foo.md.

  Also shouldn't forget @/absolute/paths.txt with and @/without/extensions,
  as well as @~/home-files and @~/paths/under/home.txt.

  If the reference is \`@quoted/in/backticks\` then it shouldn't match at all.`

  const matches = ConfigMarkdown.files(template)

  bulletproofTest("should extract exactly 12 file references", async () => {
    expect(matches.length).toBe(12)
  })

  bulletproofTest("should extract valid/path/to/a/file", async () => {
    expect(matches[0][1]).toBe("valid/path/to/a/file")
  })

  bulletproofTest("should extract shell commands", async () => {
    const shellTemplate = "Run !`ls -la` and !`echo hello`"
    const shellMatches = ConfigMarkdown.shell(shellTemplate)
    expect(shellMatches.length).toBe(2)
    expect(shellMatches[0][1]).toBe("ls -la")
    expect(shellMatches[1][1]).toBe("echo hello")
  })

  bulletproofTest("should extract another-valid/path/to/a/file", async () => {
    expect(matches[1][1]).toBe("another-valid/path/to/a/file")
  })

  bulletproofTest("should extract paths ignoring comma after", async () => {
    expect(matches[2][1]).toBe("commas")
  })

  bulletproofTest("should extract a path with a file extension and comma after", async () => {
    expect(matches[3][1]).toBe("file-extensions.md")
  })

  bulletproofTest("should extract a path with multiple dots and comma after", async () => {
    expect(matches[4][1]).toBe("multiple.extensions.bak")
  })

  bulletproofTest("should extract hidden directory", async () => {
    expect(matches[5][1]).toBe(".config/")
  })

  bulletproofTest("should extract hidden file", async () => {
    expect(matches[6][1]).toBe(".bashrc")
  })

  bulletproofTest("should extract a file ignoring period at end of sentence", async () => {
    expect(matches[7][1]).toBe("foo.md")
  })

  bulletproofTest("should extract an absolute path with an extension", async () => {
    expect(matches[8][1]).toBe("/absolute/paths.txt")
  })

  bulletproofTest("should extract an absolute path without an extension", async () => {
    expect(matches[9][1]).toBe("/without/extensions")
  })

  bulletproofTest("should extract an absolute path in home directory", async () => {
    expect(matches[10][1]).toBe("~/home-files")
  })

  bulletproofTest("should extract an absolute path under home directory", async () => {
    expect(matches[11][1]).toBe("~/paths/under/home.txt")
  })

  bulletproofTest("should not match when preceded by backtick", async () => {
    const backtickTest = "This `@should/not/match` should be ignored"
    const backtickMatches = ConfigMarkdown.files(backtickTest)
    expect(backtickMatches.length).toBe(0)
  })

  bulletproofTest("should not match email addresses", async () => {
    const emailTest = "Contact user@example.com for help"
    const emailMatches = ConfigMarkdown.files(emailTest)
    expect(emailMatches.length).toBe(0)
  })
})

describe("ConfigMarkdown: frontmatter parsing", async () => {
  const parsed = await ConfigMarkdown.parse(import.meta.dir + "/fixtures/frontmatter.md")

  bulletproofTest("should parse without throwing", async () => {
    expect(parsed).toBeDefined()
    expect(parsed.data).toBeDefined()
    expect(parsed.content).toBeDefined()
  })

  bulletproofTest("should extract description field", async () => {
    expect(parsed.data.description).toBe("This is a description wrapped in quotes")
  })

  bulletproofTest("should extract occupation field with colon in value", async () => {
    expect(parsed.data.occupation).toBe("This man has the following occupation: Software Engineer")
  })

  bulletproofTest("should extract title field with single quotes", async () => {
    expect(parsed.data.title).toBe("Hello World")
  })

  bulletproofTest("should extract name field with embedded quotes", async () => {
    expect(parsed.data.name).toBe('John "Doe"')
  })

  bulletproofTest("should extract family field with embedded single quotes", async () => {
    expect(parsed.data.family).toBe("He has no 'family'")
  })

  bulletproofTest("should extract multiline summary field", async () => {
    expect(parsed.data.summary).toBe("This is a summary\n")
  })

  bulletproofTest("should not include commented fields in data", async () => {
    expect(parsed.data.field).toBeUndefined()
  })

  bulletproofTest("should extract URL with port", async () => {
    expect(parsed.data.url).toBe("https://example.com:8080/path?query=value")
  })

  bulletproofTest("should extract time with colons", async () => {
    expect(parsed.data.time).toBe("The time is 12:30:00 PM")
  })

  bulletproofTest("should extract value with multiple colons", async () => {
    expect(parsed.data.nested).toBe("First: Second: Third: Fourth")
  })

  bulletproofTest("should preserve already double-quoted values with colons", async () => {
    expect(parsed.data.quoted_colon).toBe("Already quoted: no change needed")
  })

  bulletproofTest("should preserve already single-quoted values with colons", async () => {
    expect(parsed.data.single_quoted_colon).toBe("Single quoted: also fine")
  })

  bulletproofTest("should extract value with quotes and colons mixed", async () => {
    expect(parsed.data.mixed).toBe('He said "hello: world" and then left')
  })

  bulletproofTest("should handle empty values", async () => {
    expect(parsed.data.empty).toBeNull()
  })

  bulletproofTest("should handle dollar sign replacement patterns literally", async () => {
    expect(parsed.data.dollar).toBe("Use $' and $& for special patterns")
  })

  bulletproofTest("should not parse fake yaml from content", async () => {
    expect(parsed.data.fake_field).toBeUndefined()
    expect(parsed.data.another).toBeUndefined()
  })

  bulletproofTest("should extract content after frontmatter without modification", async () => {
    expect(parsed.content).toContain("Content that should not be parsed:")
    expect(parsed.content).toContain("fake_field: this is not yaml")
    expect(parsed.content).toContain("url: https://should-not-be-parsed.com:3000")
  })
})

describe("ConfigMarkdown: frontmatter parsing w/ empty frontmatter", async () => {
  const result = await ConfigMarkdown.parse(import.meta.dir + "/fixtures/empty-frontmatter.md")

  bulletproofTest("should parse without throwing", async () => {
    expect(result).toBeDefined()
    expect(result.data).toEqual({})
    expect(result.content.trim()).toBe("Content")
  })
})

describe("ConfigMarkdown: frontmatter parsing w/ no frontmatter", async () => {
  const result = await ConfigMarkdown.parse(import.meta.dir + "/fixtures/no-frontmatter.md")

  bulletproofTest("should parse without throwing", async () => {
    expect(result).toBeDefined()
    expect(result.data).toEqual({})
    expect(result.content.trim()).toBe("Content")
  })
})

describe("ConfigMarkdown: frontmatter parsing w/ Markdown header", async () => {
  const result = await ConfigMarkdown.parse(import.meta.dir + "/fixtures/markdown-header.md")

  bulletproofTest("should parse and match", async () => {
    expect(result).toBeDefined()
    expect(result.data).toEqual({})
    expect(result.content.trim().replace(/\r\n/g, "\n")).toBe(`# Response Formatting Requirements

Always structure your responses using clear markdown formatting:

- By default don't put information into tables for questions (but do put information into tables when creating or updating files)
- Use headings (##, ###) to organise sections, always
- Use bullet points or numbered lists for multiple items
- Use code blocks with language tags for any code
- Use **bold** for key terms and emphasis
- Use tables when comparing options or listing structured data
- Break long responses into logical sections with headings`)
  })
})

describe("ConfigMarkdown: frontmatter has weird model id", async () => {
  const result = await ConfigMarkdown.parse(import.meta.dir + "/fixtures/weird-model-id.md")

  bulletproofTest("should parse and match", async () => {
    expect(result).toBeDefined()
    expect(result.data["description"]).toEqual("General coding and planning agent")
    expect(result.data["mode"]).toEqual("subagent")
    expect(result.data["model"]).toEqual("synthetic/hf:zai-org/GLM-4.7")
    expect(result.data["tools"]["write"]).toBeTrue()
    expect(result.data["tools"]["read"]).toBeTrue()
    expect(result.data["stuff"]).toBe("This is some stuff\n")

    expect(result.content.trim()).toBe("Strictly follow da rules")
  })
})

describe("ConfigMarkdown: edge cases", () => {
  bulletproofTest("fallbackSanitization should handle non-kv lines", async () => {
    const content = "---\nkey: value\nnot-a-kv-line\n---"
    const sanitized = ConfigMarkdown.fallbackSanitization(content)
    expect(sanitized).toContain("not-a-kv-line")
  })

  bulletproofTest("parse should throw FrontmatterError on double failure", async () => {
    const tmp = path.join(os.tmpdir(), "bad-frontmatter-" + Math.random().toString(36).slice(2) + ".md")
    // The FORCE_FAILURE string triggers our mock throw
    await fs.writeFile(tmp, "---\nFORCE_FAILURE\n---")
    
    try {
      await ConfigMarkdown.parse(tmp)
      throw new Error("Did not throw")
    } catch (err: any) {
      expect(err.name).toBe("ConfigFrontmatterError")
    } finally {
      await fs.unlink(tmp).catch(() => {})
    }
  })
})
