import { describe, expect, test } from "bun:test"
import type { PermissionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { questionSubtitle } from "./session-prompt-helpers"
import { canAddSelectionContext } from "./session-command-helpers"
import { messageIdFromHash } from "./use-session-hash-scroll"
import { trimSessions } from "../context/global-sync/session-trim"

// Mock session factory
const session = (input: { id: string; parentID?: string; created: number; updated?: number; archived?: number }) =>
  ({
    id: input.id,
    parentID: input.parentID,
    time: {
      created: input.created,
      updated: input.updated,
      archived: input.archived,
    },
  }) as Session

describe("session features", () => {
  describe("prompt helpers", () => {
    const t = (key: string) => {
      if (key === "ui.common.question.one") return "question"
      if (key === "ui.common.question.other") return "questions"
      return key
    }

    test("questionSubtitle returns empty for zero", () => {
      expect(questionSubtitle(0, t)).toBe("")
    })

    test("questionSubtitle uses singular label", () => {
      expect(questionSubtitle(1, t)).toBe("1 question")
    })

    test("questionSubtitle uses plural label", () => {
      expect(questionSubtitle(3, t)).toBe("3 questions")
    })

    test("questionSubtitle handles negative numbers", () => {
      expect(questionSubtitle(-1, t)).toBe("-1 questions")
    })

    test("questionSubtitle handles large numbers", () => {
      expect(questionSubtitle(1000, t)).toBe("1000 questions")
    })
  })

  describe("command helpers", () => {
    test("canAddSelectionContext returns false without active tab", () => {
      expect(
        canAddSelectionContext({
          active: undefined,
          pathFromTab: () => "src/a.ts",
          selectedLines: () => ({ start: 1, end: 1 }),
        }),
      ).toBe(false)
    })

    test("canAddSelectionContext returns false when active tab is not a file", () => {
      expect(
        canAddSelectionContext({
          active: "context",
          pathFromTab: () => undefined,
          selectedLines: () => ({ start: 1, end: 1 }),
        }),
      ).toBe(false)
    })

    test("canAddSelectionContext returns false without selected lines", () => {
      expect(
        canAddSelectionContext({
          active: "file://src/a.ts",
          pathFromTab: () => "src/a.ts",
          selectedLines: () => null,
        }),
      ).toBe(false)
    })

    test("canAddSelectionContext returns true when file and selection exist", () => {
      expect(
        canAddSelectionContext({
          active: "file://src/a.ts",
          pathFromTab: () => "src/a.ts",
          selectedLines: () => ({ start: 1, end: 2 }),
        }),
      ).toBe(true)
    })

    test("canAddSelectionContext handles single line selection", () => {
      expect(
        canAddSelectionContext({
          active: "file://src/a.ts",
          pathFromTab: () => "src/a.ts",
          selectedLines: () => ({ start: 5, end: 5 }),
        }),
      ).toBe(true)
    })

    test("canAddSelectionContext handles invalid paths", () => {
      expect(
        canAddSelectionContext({
          active: "file://src/a.ts",
          pathFromTab: () => "",
          selectedLines: () => ({ start: 1, end: 2 }),
        }),
      ).toBe(false)
    })
  })

  describe("hash scroll utilities", () => {
    test("messageIdFromHash parses hash with leading #", () => {
      expect(messageIdFromHash("#message-abc123")).toBe("abc123")
    })

    test("messageIdFromHash parses raw hash fragment", () => {
      expect(messageIdFromHash("message-42")).toBe("42")
    })

    test("messageIdFromHash ignores non-message anchors", () => {
      expect(messageIdFromHash("#review-panel")).toBeUndefined()
    })

    test("messageIdFromHash handles empty hash", () => {
      expect(messageIdFromHash("")).toBeUndefined()
      expect(messageIdFromHash("#")).toBeUndefined()
    })

    test("messageIdFromHash handles malformed message hashes", () => {
      expect(messageIdFromHash("#message-")).toBeUndefined()
      expect(messageIdFromHash("#message")).toBeUndefined()
      expect(messageIdFromHash("message-")).toBeUndefined()
    })

    test("messageIdFromHash handles special characters in message ID", () => {
      expect(messageIdFromHash("#message-abc_123-def")).toBe("abc_123-def")
    })
  })

  describe("session trimming", () => {
    test("trimSessions keeps base roots and recent roots beyond the limit", () => {
      const now = 1_000_000
      const list = [
        session({ id: "a", created: now - 100_000 }),
        session({ id: "b", created: now - 90_000 }),
        session({ id: "c", created: now - 80_000 }),
        session({ id: "d", created: now - 70_000, updated: now - 1_000 }),
        session({ id: "e", created: now - 60_000, archived: now - 10 }),
      ]

      const result = trimSessions(list, { limit: 2, permission: {}, now })
      expect(result.map((x) => x.id)).toEqual(["a", "b", "c", "d"])
    })

    test("trimSessions keeps children when root is kept, permission exists, or child is recent", () => {
      const now = 1_000_000
      const list = [
        session({ id: "root-1", created: now - 1000 }),
        session({ id: "root-2", created: now - 2000 }),
        session({ id: "z-root", created: now - 30_000_000 }),
        session({ id: "child-kept-by-root", parentID: "root-1", created: now - 20_000_000 }),
        session({ id: "child-kept-by-permission", parentID: "z-root", created: now - 20_000_000 }),
        session({ id: "child-kept-by-recency", parentID: "z-root", created: now - 500 }),
        session({ id: "child-trimmed", parentID: "z-root", created: now - 20_000_000 }),
      ]

      const result = trimSessions(list, {
        limit: 2,
        permission: {
          "child-kept-by-permission": [{ id: "perm-1" } as PermissionRequest],
        },
        now,
      })

      expect(result.map((x) => x.id)).toEqual([
        "root-1",
        "root-2",
        "child-kept-by-root",
        "child-kept-by-permission",
        "child-kept-by-recency",
      ])
    })

    test("trimSessions handles empty list", () => {
      const result = trimSessions([], { limit: 5, permission: {}, now: 1_000_000 })
      expect(result).toEqual([])
    })

    test("trimSessions handles zero limit", () => {
      const now = 1_000_000
      const list = [
        session({ id: "a", created: now - 100_000 }),
        session({ id: "b", created: now - 90_000 }),
      ]

      const result = trimSessions(list, { limit: 0, permission: {}, now })
      expect(result).toEqual([])
    })

    test("trimSessions preserves archived sessions", () => {
      const now = 1_000_000
      const list = [
        session({ id: "archived", created: now - 100_000, archived: now - 10_000 }),
        session({ id: "recent", created: now - 1000 }),
      ]

      const result = trimSessions(list, { limit: 1, permission: {}, now })
      expect(result.map((x) => x.id)).toEqual(["archived", "recent"])
    })

    test("trimSessions handles recently updated sessions", () => {
      const now = 1_000_000
      const list = [
        session({ id: "old", created: now - 100_000 }),
        session({ id: "recently-updated", created: now - 90_000, updated: now - 1000 }),
      ]

      const result = trimSessions(list, { limit: 1, permission: {}, now })
      expect(result.map((x) => x.id)).toEqual(["recently-updated"])
    })
  })
})
