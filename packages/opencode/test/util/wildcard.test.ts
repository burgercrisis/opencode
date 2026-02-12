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
    test("should find best match and handle sorting", () => {
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
    test("should handle empty patterns", () => {
      expect(Wildcard.allStructured({ head: "a", tail: [] }, { "a": "val" })).toBe("val")
    })

    test("should handle * in sequence", () => {
      const patterns = { "git * status": "status" }
      expect(Wildcard.allStructured({ head: "git", tail: ["status"] }, patterns)).toBe("status")
    })
  })

  describe("all sorting logic", () => {
    test("should sort by length then alphabetically", () => {
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
      expect(Wildcard.allStructured({ head: "git", tail: ["commit"] }, patterns)).toBe("git-commit")
    })

    test("should return acc if matchSequence fails", () => {
      const patterns = { "git checkout": "val" }
      expect(Wildcard.allStructured({ head: "git", tail: ["status"] }, patterns)).toBeUndefined()
    })

    test("should handle multiple patterns in sequence", () => {
      const patterns = {
        "a b c": "match"
      }
      expect(Wildcard.allStructured({ head: "a", tail: ["b", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "b", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["b", "x", "c"] }, patterns)).toBe("match")
      expect(Wildcard.allStructured({ head: "a", tail: ["x", "y"] }, patterns)).toBeUndefined()
    })

    test("should handle items.some branch in matchSequence", () => {
      const patterns = { "a b": "val" }
      expect(Wildcard.allStructured({ head: "a", tail: ["c"] }, patterns)).toBeUndefined()
      
      const patterns2 = { "git * commit": "val" }
      expect(Wildcard.allStructured({ head: "git", tail: ["add", "commit"] }, patterns2)).toBe("val")
      expect(Wildcard.allStructured({ head: "git", tail: ["add", "push"] }, patterns2)).toBeUndefined()
    })
  })
})
