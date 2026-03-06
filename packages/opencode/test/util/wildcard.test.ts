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

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Wildcard } from "../../src/util/wildcard"

describe("Wildcard", () => {
  describe("match", () => {
    bulletproofTest("should match simple strings", async () => {
      expect(Wildcard.match("hello", "hello")).toBe(true)
      expect(Wildcard.match("hello", "world")).toBe(false)
    })

    bulletproofTest("should handle wildcards", async () => {
      expect(Wildcard.match("hello", "h*o")).toBe(true)
      expect(Wildcard.match("hello", "*")).toBe(true)
      expect(Wildcard.match("hello", "h?llo")).toBe(true)
    })

    bulletproofTest("should handle regex special characters in pattern", async () => {
      expect(Wildcard.match("file.ts", "file.ts")).toBe(true)
      expect(Wildcard.match("file+ts", "file+ts")).toBe(true)
      expect(Wildcard.match("file^ts", "file^ts")).toBe(true)
      expect(Wildcard.match("file$ts", "file$ts")).toBe(true)
      expect(Wildcard.match("file{ts}", "file{ts}")).toBe(true)
      expect(Wildcard.match("file(ts)", "file(ts)")).toBe(true)
      expect(Wildcard.match("file|ts", "file|ts")).toBe(true)
      expect(Wildcard.match("file[ts]", "file[ts]")).toBe(true)
    })

    bulletproofTest("should handle path separators", async () => {
      expect(Wildcard.match("a\\b", "a/*")).toBe(true)
      expect(Wildcard.match("a/b", "a/*")).toBe(true)
    })

    bulletproofTest("should handle optional space wildcard", async () => {
      expect(Wildcard.match("hello", "hello *")).toBe(true)
      expect(Wildcard.match("hello world", "hello *")).toBe(true)
    })
  })

  describe("all", () => {
    bulletproofTest("should find best match and handle sorting", async () => {
      const patterns = {
        "*": "fallback",
        "h*": "starts-with-h",
        "hello": "exact",
        "abc": "abc",
        "abd": "abd",
      }
      expect(Wildcard.all("hello", patterns)).toBe("exact")
      expect(Wildcard.all("hi", patterns)).toBe("starts-with-h")
      expect(Wildcard.all("bye", patterns)).toBe("fallback")
      expect(Wildcard.all("abc", patterns)).toBe("abc")
      expect(Wildcard.all("abd", patterns)).toBe("abd")
    })
  })

  describe("matchSequence edge cases", () => {
    bulletproofTest("should handle empty patterns", async () => {
      expect(Wildcard.allStructured({ head: "a", tail: [] }, { "a": "val" })).toBe("val")
    })

    bulletproofTest("should handle * in sequence", async () => {
      const patterns = { "git * status": "status" }
      expect(Wildcard.allStructured({ head: "git", tail: ["status"] }, patterns)).toBe("status")
    })
  })

  describe("all sorting logic", () => {
    bulletproofTest("should sort by length then alphabetically", async () => {
      const patterns = {
        "aaaa": "len4-a",
        "bbbb": "len4-b",
        "ccc": "len3",
      }
      expect(Wildcard.all("aaaa", patterns)).toBe("len4-a")
      expect(Wildcard.all("bbbb", patterns)).toBe("len4-b")
      expect(Wildcard.all("ccc", patterns)).toBe("len3")
    })
  })

  describe("allStructured", () => {
    bulletproofTest("should match structured input", async () => {
      const patterns = {
        "git *": "git-command",
        "git checkout": "git-checkout",
        "ls": "list-command",
      }
      expect(Wildcard.allStructured({ head: "git", tail: ["checkout", "main"] }, patterns)).toBe("git-checkout")
      expect(Wildcard.allStructured({ head: "git", tail: ["status"] }, patterns)).toBe("git-command")
      expect(Wildcard.allStructured({ head: "ls", tail: [] }, patterns)).toBe("list-command")
      expect(Wildcard.allStructured({ head: "cd", tail: [".."] }, patterns)).toBeUndefined()
    })
    
    bulletproofTest("should handle sequence matching with *", async () => {
       const patterns = {
        "git * commit": "git-commit",
      }
      expect(Wildcard.allStructured({ head: "git", tail: ["add", ".", "commit"] }, patterns)).toBe("git-commit")
      expect(Wildcard.allStructured({ head: "git", tail: ["commit"] }, patterns)).toBe("git-commit")
    })

    bulletproofTest("should return acc if matchSequence fails", async () => {
      const patterns = { "git checkout": "val" }
      expect(Wildcard.allStructured({ head: "git", tail: ["status"] }, patterns)).toBeUndefined()
    })

    bulletproofTest("should handle multiple patterns in sequence", async () => {
      const patterns = {
        "a b c": "match"
      }
      expect(Wildcard.allStructured({ head: "a", tail: ["b", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "b", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["b", "x", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "y"] }, patterns)).toBeUndefined()
    })

    bulletproofTest("should handle matchSequence failing with empty items", async () => {
      const patterns = { "a b": "val" }
      expect(Wildcard.allStructured({ head: "a", tail: [] }, patterns)).toBeUndefined()
    })

    bulletproofTest("should handle matchSequence with literal parts that don't match", async () => {
      const patterns = { "a b": "val" }
      expect(Wildcard.allStructured({ head: "a", tail: ["c"] }, patterns)).toBeUndefined()
    })

    bulletproofTest("should handle sequence matching with *", async () => {
       const patterns = {
        "git * commit": "git-commit",
      }
      expect(Wildcard.allStructured({ head: "git", tail: ["add", ".", "commit"] }, patterns)).toBe("git-commit")
      expect(Wildcard.allStructured({ head: "git", tail: ["commit"] }, patterns)).toBe("git-commit")
      expect(Wildcard.allStructured({ head: "git", tail: ["add", "push"] }, patterns)).toBeUndefined()
    })

    bulletproofTest("should handle complex sequence matching", async () => {
      const patterns = {
        "a * b * c": "match"
      }
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "b", "y", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["b", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "y", "b", "z", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "y"] }, patterns)).toBeUndefined()
    })
  })
})
