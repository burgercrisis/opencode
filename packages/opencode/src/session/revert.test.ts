import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import { SessionRevert } from "./revert"
import { Instance } from "@/project/instance"

// Mock dependencies
mock.module("@/project/instance", () => ({
  Instance: {
    directory: "/test/directory",
    worktree: "/test/worktree",
    disposeAll: mock(() => Promise.resolve()),
    resetForTest: mock(() => Promise.resolve())
  }
}))

mock.module(".", () => ({
  Session: {
    get: mock(() => Promise.resolve({ id: "session-123" })),
    messages: mock(() => Promise.resolve([])),
    setRevert: mock(() => Promise.resolve()),
    clearRevert: mock(() => Promise.resolve())
  }
}))

mock.module("./prompt", () => ({
  SessionPrompt: {
    assertNotBusy: mock(() => Promise.resolve())
  }
}))

mock.module("@/snapshot", () => ({
  Snapshot: {
    track: mock(() => Promise.resolve("snapshot-123")),
    revert: mock(() => Promise.resolve()),
    diff: mock(() => Promise.resolve([])),
    restore: mock(() => Promise.resolve())
  }
}))

mock.module("./summary", () => ({
  SessionSummary: {
    computeDiff: mock(() => Promise.resolve([]))
  }
}))

mock.module("@/storage/storage", () => ({
  Storage: {
    write: mock(() => Promise.resolve()),
    read: mock(() => Promise.resolve([]))
  }
}))

mock.module("@/bus", () => ({
  Bus: {
    publish: mock(() => Promise.resolve())
  }
}))

mock.module("@/storage/db", () => ({
  Database: {
    use: mock(() => {})
  },
  eq: mock(() => {})
}))

describe("SessionRevert", () => {
  describe("cleanup", () => {
    test("cleanup function exists", () => {
      expect(typeof SessionRevert.cleanup).toBe("function")
    })
  })
})
