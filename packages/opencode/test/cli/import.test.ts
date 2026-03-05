import { test, expect } from "bun:test"
import { parseShareUrl, transformShareData, type ShareData } from "../../src/cli/cmd/import"

// parseShareUrl tests
// Global test isolation pattern
let savedInstance: any
let savedFilesystem: any

// Save global state before all tests
const originalBeforeAll = typeof beforeAll !== 'undefined' ? beforeAll : (() => {})
const originalBeforeEach = typeof beforeEach !== 'undefined' ? beforeEach : (() => {})

beforeAll(() => {
  // Save initial global state
  savedInstance = (globalThis as any).Instance
  savedFilesystem = (globalThis as any).Filesystem
  
  // Call original beforeAll if it exists
  if (typeof originalBeforeAll === 'function') {
    originalBeforeAll()
  }
})

beforeEach(() => {
  // Restore global state before each test
  if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  }
  if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  }
  
  // Call original beforeEach if it exists
  if (typeof originalBeforeEach === 'function') {
    originalBeforeEach()
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    mock?.unmock?.()
  } catch (e) {
    // Ignore mock cleanup errors
  }
})

test("parses valid share URLs", () => {
  expect(parseShareUrl("https://opncd.ai/share/Jsj3hNIW")).toBe("Jsj3hNIW")
  expect(parseShareUrl("https://custom.example.com/share/abc123")).toBe("abc123")
  expect(parseShareUrl("http://localhost:3000/share/test_id-123")).toBe("test_id-123")
})

test("rejects invalid URLs", () => {
  expect(parseShareUrl("https://opncd.ai/s/Jsj3hNIW")).toBeNull() // legacy format
  expect(parseShareUrl("https://opncd.ai/share/")).toBeNull()
  expect(parseShareUrl("https://opncd.ai/share/id/extra")).toBeNull()
  expect(parseShareUrl("not-a-url")).toBeNull()
})

// transformShareData tests
test("transforms share data to storage format", () => {
  const data: ShareData[] = [
    { type: "session", data: { id: "sess-1", title: "Test" } as any },
    { type: "message", data: { id: "msg-1", sessionID: "sess-1" } as any },
    { type: "part", data: { id: "part-1", messageID: "msg-1" } as any },
    { type: "part", data: { id: "part-2", messageID: "msg-1" } as any },
  ]

  const result = transformShareData(data)!

  expect(result.info.id).toBe("sess-1")
  expect(result.messages).toHaveLength(1)
  expect(result.messages[0].parts).toHaveLength(2)
})

test("returns null for invalid share data", () => {
  expect(transformShareData([])).toBeNull()
  expect(transformShareData([{ type: "message", data: {} as any }])).toBeNull()
  expect(transformShareData([{ type: "session", data: { id: "s" } as any }])).toBeNull() // no messages
})
