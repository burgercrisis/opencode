import { expect, test, describe } from "bun:test"
import { Wildcard } from "../../src/util/wildcard"

describe("Wildcard", () => {
  describe("match", () => {
    test("should match simple strings", () => {
      expect(Wildcard.match("hello", "hello")).toBe(true)
      expect(Wildcard.match("hello", "world")).toBe(false)
    })

    test("should handle wildcards", () => {
      expect(Wildcard.match("hello", "h*o")).toBe(true)
      expect(Wildcard.match("hello", "*")).toBe(true)
      expect(Wildcard.match("hello", "h?llo")).toBe(true)
    })

    test("should handle path separators", () => {
      expect(Wildcard.match("a\\b", "a/*")).toBe(true)
      expect(Wildcard.match("a/b", "a/*")).toBe(true)
    })

    test("should handle optional space wildcard", () => {
      expect(Wildcard.match("hello", "hello *")).toBe(true)
      expect(Wildcard.match("hello world", "hello *")).toBe(true)
    })
  })

  describe("all", () => {
    test("should find best match", () => {
      const patterns = {
        "*": "fallback",
        "h*": "starts-with-h",
        "hello": "exact",
      }
      expect(Wildcard.all("hello", patterns)).toBe("exact")
      expect(Wildcard.all("hi", patterns)).toBe("starts-with-h")
      expect(Wildcard.all("bye", patterns)).toBe("fallback")
    })
  })

  describe("allStructured", () => {
    test("should match structured input", () => {
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
    
    test("should handle sequence matching with *", () => {
       const patterns = {
        "git * commit": "git-commit",
      }
      expect(Wildcard.allStructured({ head: "git", tail: ["add", ".", "commit"] }, patterns)).toBe("git-commit")
    })
  })
})
