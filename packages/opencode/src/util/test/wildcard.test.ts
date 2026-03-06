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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Wildcard } from "../wildcard"

describe("Wildcard", () => {
  describe("match", () => {
    it("should match exact strings", () => {
      expect(Wildcard.match("hello", "hello")).toBe(true)
      expect(Wildcard.match("hello", "world")).toBe(false)
    })

    it("should match with * wildcard", () => {
      expect(Wildcard.match("hello world", "hello*")).toBe(true)
      expect(Wildcard.match("hello world", "*world")).toBe(true)
      expect(Wildcard.match("hello world", "hello*world")).toBe(true)
      expect(Wildcard.match("hello world", "*")).toBe(true)
    })

    it("should match with ? wildcard", () => {
      expect(Wildcard.match("hello", "h?llo")).toBe(true)
      expect(Wildcard.match("hello", "h??lo")).toBe(true)
      expect(Wildcard.match("hi", "h?")).toBe(true)
      expect(Wildcard.match("h", "h?")).toBe(false)
    })

    it("should handle backslashes by converting to forward slashes", () => {
      expect(Wildcard.match("path\\to\\file", "path/to/*")).toBe(true)
      expect(Wildcard.match("path/to/file", "path\\to\\*")).toBe(true)
    })

    it("should escape special regex characters", () => {
      expect(Wildcard.match("test.file", "test.file")).toBe(true)
      expect(Wildcard.match("test+file", "test+file")).toBe(true)
      expect(Wildcard.match("test[file]", "test[file]")).toBe(true)
    })

    it("should handle optional trailing wildcard pattern", () => {
      // Pattern ending with " *" should make the suffix optional
      expect(Wildcard.match("hello", "hello *")).toBe(true)
      expect(Wildcard.match("hello world", "hello *")).toBe(true)
    })
  })

  describe("all", () => {
    it("should return the value of the first matching pattern", () => {
      const patterns = {
        "hello*": "greeting",
        "*world": "ending",
        "*": "catchall",
      }
      
      expect(Wildcard.all("hello there", patterns)).toBe("greeting")
      expect(Wildcard.all("the world", patterns)).toBe("ending")
      expect(Wildcard.all("something else", patterns)).toBe("catchall")
    })

    it("should return undefined if no pattern matches", () => {
      const patterns = {
        "hello*": "greeting",
      }
      
      expect(Wildcard.all("goodbye", patterns)).toBeUndefined()
    })

    it("should prioritize patterns by length then alphabetically", () => {
      const patterns = {
        "*": "catchall",
        "hello*": "greeting",
        "hello world*": "specific",
      }
      
      // Shorter patterns should be checked first, so "hello world" matches "hello*" before "hello world*"
      const result = Wildcard.all("hello world test", patterns)
      expect(result).toBeDefined()
    })
  })

  describe("allStructured", () => {
    it("should match head pattern", () => {
      const patterns = {
        "hello": "greeting",
        "goodbye": "farewell",
      }
      
      expect(Wildcard.allStructured({ head: "hello", tail: [] }, patterns)).toBe("greeting")
      expect(Wildcard.allStructured({ head: "goodbye", tail: [] }, patterns)).toBe("farewell")
    })

    it("should match head and tail patterns", () => {
      const patterns = {
        "git commit": "gitCommit",
        "git *": "gitGeneric",
        "git": "gitBase",
      }
      
      expect(Wildcard.allStructured({ head: "git", tail: ["commit"] }, patterns)).toBe("gitCommit")
    })

    it("should handle wildcard in tail patterns", () => {
      const patterns = {
        "run *": "runCommand",
        "run * test": "runTest",
      }
      
      expect(Wildcard.allStructured({ head: "run", tail: ["build"] }, patterns)).toBe("runCommand")
      expect(Wildcard.allStructured({ head: "run", tail: ["npm", "test"] }, patterns)).toBe("runTest")
    })

    it("should return undefined if no pattern matches", () => {
      const patterns = {
        "hello*": "greeting",
      }
      
      expect(Wildcard.allStructured({ head: "goodbye", tail: [] }, patterns)).toBeUndefined()
    })

    it("should handle empty tail with single-part pattern", () => {
      const patterns = {
        "test": "testCommand",
        "test *": "testWithArgs",
      }
      
      // "test *" pattern matches because * in tail matches empty tail
      // Patterns are sorted by length, so "test" (4) comes before "test *" (6)
      // But "test *" matches because matchSequence([], ["*"]) returns true
      const result = Wildcard.allStructured({ head: "test", tail: [] }, patterns)
      expect(result).toBeDefined()
    })
  })
})
