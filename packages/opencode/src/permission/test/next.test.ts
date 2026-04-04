import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { PermissionNext } from "../next"

describe("PermissionNext Module", () => {
  describe("expand function", () => {
    it("should expand tilde to home directory", () => {
      const result = PermissionNext.expand("~/test")
      expect(result).toBe(`${require("os").homedir()}/test`)
    })

    it("should handle standalone tilde", () => {
      const result = PermissionNext.expand("~")
      expect(result).toBe(require("os").homedir())
    })

    it("should handle $HOME variable", () => {
      const result = PermissionNext.expand("$HOME/test")
      expect(result).toBe(`${require("os").homedir()}/test`)
    })

    it("should return unchanged path without tilde or $HOME", () => {
      const result = PermissionNext.expand("/absolute/path")
      expect(result).toBe("/absolute/path")
    })
  })

  describe("fromConfig function", () => {
    it("should handle string values", () => {
      const config = {
        edit: "allow"
      }

      const result = PermissionNext.fromConfig(config)
      expect(result).toHaveLength(1)
      expect(result).toEqual([
        {
          permission: "edit",
          pattern: "*",
          action: "allow"
        }
      ])
    })

    it("should handle object values", () => {
      const config = {
        edit: {
          "/allowed/path": "allow",
          "/denied/path": "deny"
        }
      }

      const result = PermissionNext.fromConfig(config)
      expect(result).toHaveLength(2)
      expect(result).toEqual([
        {
          permission: "edit",
          pattern: "/allowed/path",
          action: "allow"
        },
        {
          permission: "edit",
          pattern: "/denied/path",
          action: "deny"
        }
      ])
    })
  })

  describe("merge function", () => {
    it("should merge multiple rulesets", () => {
      const ruleset1 = [
        { permission: "edit", pattern: "*.txt", action: "allow" as const }
      ]
      const ruleset2 = [
        { permission: "read", pattern: "*.md", action: "deny" as const }
      ]

      const result = PermissionNext.merge(ruleset1, ruleset2)
      expect(result).toHaveLength(2)
      expect(result).toEqual([
        { permission: "edit", pattern: "*.txt", action: "allow" },
        { permission: "read", pattern: "*.md", action: "deny" }
      ])
    })

    it("should handle empty rulesets", () => {
      const result = PermissionNext.merge()
      expect(result).toHaveLength(0)
    })
  })

  describe("evaluate function", () => {
    it("should find matching rule", () => {
      const ruleset = [
        { permission: "edit", pattern: "*.txt", action: "allow" as const }
      ]

      const result = PermissionNext.evaluate("edit", "file.txt", ruleset)
      expect(result.action).toBe("allow")
    })

    it("should return default ask when no match", () => {
      const ruleset = [
        { permission: "edit", pattern: "*.md", action: "allow" as const }
      ]

      const result = PermissionNext.evaluate("edit", "file.txt", ruleset)
      expect(result.action).toBe("ask")
    })

    it("should handle multiple rulesets", () => {
      const ruleset1 = [
        { permission: "edit", pattern: "*.txt", action: "deny" as const }
      ]
      const ruleset2 = [
        { permission: "edit", pattern: "file.txt", action: "allow" as const }
      ]

      const result = PermissionNext.evaluate("edit", "file.txt", ruleset1, ruleset2)
      expect(result.action).toBe("allow")
    })
  })

  describe("disabled function", () => {
    it("should handle empty tools list", () => {
      const ruleset = [
        { permission: "edit", pattern: "*", action: "deny" as const }
      ]

      const result = PermissionNext.disabled([], ruleset)
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it("should return disabled tools", () => {
      const ruleset = [
        { permission: "edit", pattern: "*", action: "deny" as const },
        { permission: "read", pattern: "*", action: "deny" as const }
      ]

      const result = PermissionNext.disabled(["edit", "read"], ruleset)
      expect(result).toBeInstanceOf(Set)
      expect(result.has("edit")).toBe(true)
      expect(result.has("read")).toBe(true)
    })

    it("should handle non-edit tools", () => {
      const ruleset = [
        { permission: "bash", pattern: "*", action: "deny" as const }
      ]

      const result = PermissionNext.disabled(["bash"], ruleset)
      expect(result.has("bash")).toBe(true)
    })
  })

  describe("Error Classes", () => {
    it("should create RejectedError", () => {
      const error = new PermissionNext.RejectedError()
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain("user rejected permission")
    })

    it("should create CorrectedError with message", () => {
      const error = new PermissionNext.CorrectedError("Use different approach")
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain("Use different approach")
    })

    it("should create DeniedError with ruleset", () => {
      const ruleset = [
        { permission: "edit", pattern: "*", action: "deny" as const }
      ]
      const error = new PermissionNext.DeniedError(ruleset)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain("prevents you from using")
      expect(error.ruleset).toBe(ruleset)
    })
  })

  describe("Schema Validation", () => {
    it("should validate Action schema", () => {
      expect(PermissionNext.Action.safeParse("allow").success).toBe(true)
      expect(PermissionNext.Action.safeParse("deny").success).toBe(true)
      expect(PermissionNext.Action.safeParse("ask").success).toBe(true)
      expect(PermissionNext.Action.safeParse("invalid").success).toBe(false)
    })

    it("should validate Rule schema", () => {
      const validRule = {
        permission: "edit",
        pattern: "*.txt",
        action: "allow" as const
      }

      expect(PermissionNext.Rule.safeParse(validRule).success).toBe(true)
    })

    it("should validate Ruleset schema", () => {
      const validRuleset = [
        {
          permission: "edit",
          pattern: "*.txt",
          action: "allow" as const
        }
      ]

      expect(PermissionNext.Ruleset.safeParse(validRuleset).success).toBe(true)
    })

    it("should validate Reply schema", () => {
      expect(PermissionNext.Reply.safeParse("once").success).toBe(true)
      expect(PermissionNext.Reply.safeParse("always").success).toBe(true)
      expect(PermissionNext.Reply.safeParse("reject").success).toBe(true)
      expect(PermissionNext.Reply.safeParse("invalid").success).toBe(false)
    })

    it("should validate Approval schema", () => {
      const validApproval = {
        projectID: "project-id",
        patterns: ["file.txt"]
      }

      expect(PermissionNext.Approval.safeParse(validApproval).success).toBe(true)
    })
  })

  describe("list function", () => {
    it("should exist as a function", () => {
      // Test that the function exists and is callable
      expect(typeof PermissionNext.list).toBe("function")
    })
  })
})
