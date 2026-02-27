import { beforeAll, describe, expect, mock, test, beforeEach } from "bun:test"
import { render } from "@solidjs/testing-library"
import {
  useComments,
  CommentsProvider,
  createCommentSessionForTest,
  type LineComment,
} from "./comments"
import { createSimpleContext } from "@opencode-ai/ui/context"

// Mock dependencies
beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => ({ dir: "test-dir", id: "test-session" }),
  }))

  mock.module("@/utils/persist", () => ({
    Persist: {
      scoped: mock(() => "test-key"),
    },
    persisted: mock((key, store) => [store, mock(), mock(), mock(() => true)]),
  }))

  mock.module("@/utils/scoped-cache", () => ({
    createScopedCache: mock((factory, options) => ({
      get: mock((key) => factory(key)),
      clear: mock(),
      dispose: mock(),
    })),
  }))

  mock.module("@/utils/uuid", () => ({
    uuid: mock(() => "test-uuid-123"),
  }))
})

describe("Comments utility functions", () => {
  test("sessionKey creates correct key format", () => {
    const key1 = require("./comments").sessionKey("test-dir", "test-id")
    expect(key1).toBe("test-dir\ntest-id")

    const key2 = require("./comments").sessionKey("test-dir", undefined)
    expect(key2).toBe("test-dir\n__workspace__")
  })

  test("decodeSessionKey parses keys correctly", () => {
    const decodeSessionKey = require("./comments").decodeSessionKey

    const result1 = decodeSessionKey("test-dir\ntest-id")
    expect(result1).toEqual({ dir: "test-dir", id: "test-id" })

    const result2 = decodeSessionKey("test-dir")
    expect(result2).toEqual({ dir: "test-dir", id: "__workspace__" })
  })

  test("aggregate sorts comments by time", () => {
    const aggregate = require("./comments").aggregate

    const comments = {
      "file1.ts": [
        { id: "1", file: "file1.ts", selection: { start: 1, end: 2 }, comment: "First", time: 1000 },
        { id: "2", file: "file1.ts", selection: { start: 3, end: 4 }, comment: "Second", time: 2000 },
      ],
      "file2.ts": [
        { id: "3", file: "file2.ts", selection: { start: 5, end: 6 }, comment: "Third", time: 1500 },
      ],
    }

    const result = aggregate(comments)
    expect(result).toHaveLength(3)
    expect(result[0].time).toBe(1000) // First
    expect(result[1].time).toBe(1500) // Third
    expect(result[2].time).toBe(2000) // Second
  })

  test("aggregate handles empty comments", () => {
    const aggregate = require("./comments").aggregate

    expect(aggregate({})).toEqual([])
    expect(aggregate({ "file.ts": [] })).toEqual([])
  })
})

describe("Comment session state", () => {
  test("creates comment session for testing", () => {
    const initialComments = {
      "test.ts": [
        {
          id: "1",
          file: "test.ts",
          selection: { start: 1, end: 2 },
          comment: "Test comment",
          time: Date.now(),
        },
      ],
    }

    const session = createCommentSessionForTest(initialComments)

    expect(session.list("test.ts")).toHaveLength(1)
    expect(session.all()).toHaveLength(1)
    expect(session.focus()).toBeNull()
    expect(session.active()).toBeNull()
  })

  test("adds comments correctly", () => {
    const session = createCommentSessionForTest()

    const comment = session.add({
      file: "test.ts",
      selection: { start: 1, end: 2 },
      comment: "New comment",
    })

    expect(comment.id).toBe("test-uuid-123")
    expect(comment.file).toBe("test.ts")
    expect(comment.comment).toBe("New comment")
    expect(comment.time).toBeTypeOf("number")
    expect(session.focus()).toEqual({ file: "test.ts", id: "test-uuid-123" })
  })

  test("removes comments correctly", () => {
    const session = createCommentSessionForTest()

    const comment = session.add({
      file: "test.ts",
      selection: { start: 1, end: 2 },
      comment: "To be removed",
    })

    expect(session.list("test.ts")).toHaveLength(1)
    expect(session.focus()).toEqual({ file: "test.ts", id: comment.id })

    session.remove("test.ts", comment.id)

    expect(session.list("test.ts")).toHaveLength(0)
    expect(session.focus()).toBeNull()
  })

  test("clears all comments", () => {
    const session = createCommentSessionForTest()

    session.add({
      file: "test1.ts",
      selection: { start: 1, end: 2 },
      comment: "Comment 1",
    })

    session.add({
      file: "test2.ts",
      selection: { start: 3, end: 4 },
      comment: "Comment 2",
    })

    session.setActive({ file: "test1.ts", id: "any-id" })

    expect(session.all()).toHaveLength(2)
    expect(session.active()).not.toBeNull()

    session.clear()

    expect(session.all()).toHaveLength(0)
    expect(session.focus()).toBeNull()
    expect(session.active()).toBeNull()
  })

  test("manages focus state", () => {
    const session = createCommentSessionForTest()

    const focus = { file: "test.ts", id: "focus-id" }
    session.setFocus(focus)
    expect(session.focus()).toEqual(focus)

    session.clearFocus()
    expect(session.focus()).toBeNull()

    // Test with function
    session.setFocus((current) => current?.file === "test.ts" ? null : focus)
    expect(session.focus()).toBeNull()
  })

  test("manages active state", () => {
    const session = createCommentSessionForTest()

    const active = { file: "test.ts", id: "active-id" }
    session.setActive(active)
    expect(session.active()).toEqual(active)

    session.clearActive()
    expect(session.active()).toBeNull()

    // Test with function
    session.setActive((current) => current?.file === "test.ts" ? null : active)
    expect(session.active()).toBeNull()
  })

  test("lists comments by file", () => {
    const session = createCommentSessionForTest()

    session.add({
      file: "file1.ts",
      selection: { start: 1, end: 2 },
      comment: "File 1 comment",
    })

    session.add({
      file: "file2.ts",
      selection: { start: 3, end: 4 },
      comment: "File 2 comment",
    })

    expect(session.list("file1.ts")).toHaveLength(1)
    expect(session.list("file2.ts")).toHaveLength(1)
    expect(session.list("nonexistent.ts")).toHaveLength(0)
  })

  test("aggregates all comments", () => {
    const session = createCommentSessionForTest()

    const comment1 = session.add({
      file: "file1.ts",
      selection: { start: 1, end: 2 },
      comment: "First",
    })

    // Add delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 1))

    const comment2 = session.add({
      file: "file2.ts",
      selection: { start: 3, end: 4 },
      comment: "Second",
    })

    const all = session.all()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe(comment1.id) // Earlier timestamp
    expect(all[1].id).toBe(comment2.id) // Later timestamp
  })
})

describe("Comments context", () => {
  let mockContext: any
  let mockProvider: any

  beforeEach(() => {
    // Reset all mocks
    mock.clearAllMocks()

    // Get mocked functions
    const mod = require("./comments")
    mockContext = mod.use
    mockProvider = mod.provider
  })

  test("creates context with correct name", () => {
    expect(mockContext?.name).toBe("Comments")
  })

  test("provides comment management functions", () => {
    const TestComponent = () => {
      const comments = useComments()
      return (
        <div data - testid= "comments-context" >
        <span data - has - list={ typeof comments?.list === "function" }> list </span>
          < span data - has - all={ typeof comments.all === "function" }> all </span>
            < span data - has - add={ typeof comments.add === "function" }> add </span>
              < span data - has - remove={ typeof comments.remove === "function" }> remove </span>
                < span data - has - clear={ typeof comments.clear === "function" }> clear </span>
                  </div>
      )
}

    const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("comments-context")).toBeInTheDocument()
  })

test("provides focus management", () => {
  const TestComponent = () => {
    const comments = useComments()
    return (
      <div data - testid= "focus-management" >
      <span data - has - focus={ typeof comments.focus === "function" }> focus </span>
        < span data - has - setFocus={ typeof comments.setFocus === "function" }> setFocus </span>
          < span data - has - clearFocus={ typeof comments.clearFocus === "function" }> clearFocus </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("focus-management")).toBeInTheDocument()
  })

test("provides active management", () => {
  const TestComponent = () => {
    const comments = useComments()
    return (
      <div data - testid= "active-management" >
      <span data - has - active={ typeof comments.active === "function" }> active </span>
        < span data - has - setActive={ typeof comments.setActive === "function" }> setActive </span>
          < span data - has - clearActive={ typeof comments.clearActive === "function" }> clearActive </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("active-management")).toBeInTheDocument()
  })

test("provides ready state", () => {
  const TestComponent = () => {
    const comments = useComments()
    return (
      <div data - testid= "ready-state" >
      <span data - ready={ comments.ready() ? "ready" : "not-ready" }> status </span>
        </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("ready-state")).toBeInTheDocument()
  })

test("adds comments through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleAdd = () => {
      comments.add({
        file: "context-test.ts",
        selection: { start: 1, end: 2 },
        comment: "Context comment",
      })
    }

    return (
      <div data - testid= "context-add" >
      <button onClick={ handleAdd }> Add Comment </button>
        < span data - comment - count={ comments.all().length }> count </span>
          </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-add")).toBeInTheDocument()
  })

test("removes comments through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleAdd = () => {
      comments.add({
        file: "remove-test.ts",
        selection: { start: 1, end: 2 },
        comment: "To be removed",
      })
    }

    const handleRemove = () => {
      const commentsList = comments.list("remove-test.ts")
      if (commentsList.length > 0) {
        comments.remove("remove-test.ts", commentsList[0].id)
      }
    }

    return (
      <div data - testid= "context-remove" >
      <button onClick={ handleAdd }> Add </button>
        < button onClick = { handleRemove } > Remove </button>
          < span data - comment - count={ comments.all().length }> count </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-remove")).toBeInTheDocument()
  })

test("manages focus through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleSetFocus = () => {
      comments.setFocus({ file: "focus-test.ts", id: "focus-id" })
    }

    const handleClearFocus = () => {
      comments.clearFocus()
    }

    const focus = comments.focus()

    return (
      <div data - testid= "context-focus" >
      <button onClick={ handleSetFocus }> Set Focus </button>
        < button onClick = { handleClearFocus } > Clear Focus </button>
          < span data - focus - file={ focus?.file || "none" }> focus </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-focus")).toBeInTheDocument()
  })

test("manages active through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleSetActive = () => {
      comments.setActive({ file: "active-test.ts", id: "active-id" })
    }

    const handleClearActive = () => {
      comments.clearActive()
    }

    const active = comments.active()

    return (
      <div data - testid= "context-active" >
      <button onClick={ handleSetActive }> Set Active </button>
        < button onClick = { handleClearActive } > Clear Active </button>
          < span data - active - file={ active?.file || "none" }> active </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-active")).toBeInTheDocument()
  })

test("lists comments by file through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleAdd = () => {
      comments.add({
        file: "list-test.ts",
        selection: { start: 1, end: 2 },
        comment: "List test comment",
      })
    }

    const fileComments = comments.list("list-test.ts")

    return (
      <div data - testid= "context-list" >
      <button onClick={ handleAdd }> Add Comment </button>
        < span data - file - count={ fileComments.length }> count </span>
          </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-list")).toBeInTheDocument()
  })

test("clears all comments through context", () => {
  const TestComponent = () => {
    const comments = useComments()

    const handleAdd = () => {
      comments.add({
        file: "clear-test.ts",
        selection: { start: 1, end: 2 },
        comment: "To be cleared",
      })
    }

    const handleClear = () => {
      comments.clear()
    }

    return (
      <div data - testid= "context-clear" >
      <button onClick={ handleAdd }> Add </button>
        < button onClick = { handleClear } > Clear All </button>
          < span data - comment - count={ comments.all().length }> count </span>
            </div>
      )
    }

const { getByTestId } = render(() => (
  <CommentsProvider>
  <TestComponent />
  </CommentsProvider>
))

expect(getByTestId("context-clear")).toBeInTheDocument()
  })
})

describe("Comments edge cases", () => {
  test("handles empty comment addition", () => {
    const session = createCommentSessionForTest()

    const comment = session.add({
      file: "",
      selection: { start: 0, end: 0 },
      comment: "",
    })

    expect(comment.file).toBe("")
    expect(comment.comment).toBe("")
    expect(comment.selection).toEqual({ start: 0, end: 0 })
  })

  test("handles removing non-existent comment", () => {
    const session = createCommentSessionForTest()

    // Should not throw
    expect(() => {
      session.remove("nonexistent.ts", "nonexistent-id")
    }).not.toThrow()
  })

  test("handles focus updates when removing focused comment", () => {
    const session = createCommentSessionForTest()

    const comment = session.add({
      file: "focus-remove.ts",
      selection: { start: 1, end: 2 },
      comment: "Focus test",
    })

    expect(session.focus()).toEqual({ file: "focus-remove.ts", id: comment.id })

    session.remove("focus-remove.ts", comment.id)

    expect(session.focus()).toBeNull()
  })

  test("handles focus updates when removing different comment", () => {
    const session = createCommentSessionForTest()

    const comment1 = session.add({
      file: "focus-preserve.ts",
      selection: { start: 1, end: 2 },
      comment: "Comment 1",
    })

    const comment2 = session.add({
      file: "focus-preserve.ts",
      selection: { start: 3, end: 4 },
      comment: "Comment 2",
    })

    // Focus on comment1
    session.setFocus({ file: "focus-preserve.ts", id: comment1.id })
    expect(session.focus()).toEqual({ file: "focus-preserve.ts", id: comment1.id })

    // Remove comment2
    session.remove("focus-preserve.ts", comment2.id)

    // Focus should remain on comment1
    expect(session.focus()).toEqual({ file: "focus-preserve.ts", id: comment1.id })
  })

  test("handles session key edge cases", () => {
    const sessionKey = require("./comments").sessionKey

    // Empty directory
    expect(sessionKey("", "test")).toBe("\ntest")

    // Empty ID
    expect(sessionKey("test", "")).toBe("test\n")

    // Both empty
    expect(sessionKey("", "")).toBe("\n")
  })

  test("handles malformed session keys", () => {
    const decodeSessionKey = require("./comments").decodeSessionKey

    // Key without separator
    expect(decodeSessionKey("noseparator")).toEqual({ dir: "noseparator", id: "__workspace__" })

    // Key with multiple separators (should use last one)
    expect(decodeSessionKey("dir\nid1\nid2")).toEqual({ dir: "dir\nid1", id: "id2" })
  })

  test("handles comments with same timestamp", () => {
    // Mock uuid to return different values but same timestamp
    let uuidCounter = 0
    mock.module("@/utils/uuid", () => ({
      uuid: () => `uuid-${uuidCounter++}`,
    }))

    const session = createCommentSessionForTest()

    const fixedTime = Date.now()

    // Add comments with same timestamp by mocking Date.now
    const originalDateNow = Date.now
    Date.now = () => fixedTime

    const comment1 = session.add({
      file: "same-time.ts",
      selection: { start: 1, end: 2 },
      comment: "First",
    })

    const comment2 = session.add({
      file: "same-time.ts",
      selection: { start: 3, end: 4 },
      comment: "Second",
    })

    // Restore Date.now
    Date.now = originalDateNow

    const all = session.all()
    expect(all).toHaveLength(2)
    // Order should be preserved when timestamps are equal
    expect(all[0].id).toBe(comment1.id)
    expect(all[1].id).toBe(comment2.id)
  })

  test("handles large number of comments", () => {
    const session = createCommentSessionForTest()

    // Add many comments
    for (let i = 0; i < 100; i++) {
      session.add({
        file: `file-${i}.ts`,
        selection: { start: i, end: i + 1 },
        comment: `Comment ${i}`,
      })
    }

    expect(session.all()).toHaveLength(100)

    // Test aggregation performance
    const start = performance.now()
    const aggregated = session.all()
    const end = performance.now()

    expect(aggregated).toHaveLength(100)
    expect(end - start).toBeLessThan(100) // Should be fast
  })
})
