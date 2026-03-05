import { test, expect } from "bun:test"
import { FileIgnore } from "../../src/file/ignore"

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

test("match nested and non-nested", () => {
  expect(FileIgnore.match("node_modules/index.js")).toBe(true)
  expect(FileIgnore.match("node_modules")).toBe(true)
  expect(FileIgnore.match("node_modules/")).toBe(true)
  expect(FileIgnore.match("node_modules/bar")).toBe(true)
  expect(FileIgnore.match("node_modules/bar/")).toBe(true)
})
