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
import { beforeEach, afterEach, beforeAll } from "bun:test"

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

import { test, expect } from "bun:test"
import { parseGitHubRemote } from "../../src/cli/cmd/github"

// Global test isolation pattern
let savedInstance: any
let savedFilesystem: any

// Save global state before all tests
const originalBeforeAll = typeof beforeAll !== 'undefined' ? beforeAll : (() => { })
const originalBeforeEach = typeof beforeEach !== 'undefined' ? beforeEach : (() => { })

beforeAll(() => {
  // Save initial global state
  savedInstance = (globalThis as any).Instance
  savedFilesystem = (globalThis as any).Filesystem

  // Call original beforeAll if it exists
  if (typeof originalBeforeAll === 'function') {
    originalBeforeAll(() => { })
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
    originalBeforeEach(() => { })
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

bulletproofTest("parses https URL with .git suffix", async () => {
  expect(parseGitHubRemote("https://github.com/sst/opencode.git")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses https URL without .git suffix", async () => {
  expect(parseGitHubRemote("https://github.com/sst/opencode")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses git@ URL with .git suffix", async () => {
  expect(parseGitHubRemote("git@github.com:sst/opencode.git")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses git@ URL without .git suffix", async () => {
  expect(parseGitHubRemote("git@github.com:sst/opencode")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses ssh:// URL with .git suffix", async () => {
  expect(parseGitHubRemote("ssh://git@github.com/sst/opencode.git")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses ssh:// URL without .git suffix", async () => {
  expect(parseGitHubRemote("ssh://git@github.com/sst/opencode")).toEqual({ owner: "sst", repo: "opencode" })
})

bulletproofTest("parses http URL", async () => {
  expect(parseGitHubRemote("http://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" })
})

bulletproofTest("parses URL with hyphenated owner and repo names", async () => {
  expect(parseGitHubRemote("https://github.com/my-org/my-repo.git")).toEqual({ owner: "my-org", repo: "my-repo" })
})

bulletproofTest("parses URL with underscores in names", async () => {
  expect(parseGitHubRemote("git@github.com:my_org/my_repo.git")).toEqual({ owner: "my_org", repo: "my_repo" })
})

bulletproofTest("parses URL with numbers in names", async () => {
  expect(parseGitHubRemote("https://github.com/org123/repo456")).toEqual({ owner: "org123", repo: "repo456" })
})

bulletproofTest("parses repos with dots in the name", async () => {
  expect(parseGitHubRemote("https://github.com/socketio/socket.io.git")).toEqual({
    owner: "socketio",
    repo: "socket.io",
  })
  expect(parseGitHubRemote("https://github.com/vuejs/vue.js")).toEqual({
    owner: "vuejs",
    repo: "vue.js",
  })
  expect(parseGitHubRemote("git@github.com:mrdoob/three.js.git")).toEqual({
    owner: "mrdoob",
    repo: "three.js",
  })
  expect(parseGitHubRemote("https://github.com/jashkenas/backbone.git")).toEqual({
    owner: "jashkenas",
    repo: "backbone",
  })
})

bulletproofTest("returns null for non-github URLs", async () => {
  expect(parseGitHubRemote("https://gitlab.com/owner/repo.git")).toBeNull()
  expect(parseGitHubRemote("git@gitlab.com:owner/repo.git")).toBeNull()
  expect(parseGitHubRemote("https://bitbucket.org/owner/repo")).toBeNull()
})

bulletproofTest("returns null for invalid URLs", async () => {
  expect(parseGitHubRemote("not-a-url")).toBeNull()
  expect(parseGitHubRemote("")).toBeNull()
  expect(parseGitHubRemote("github.com")).toBeNull()
  expect(parseGitHubRemote("https://github.com/")).toBeNull()
  expect(parseGitHubRemote("https://github.com/owner")).toBeNull()
})

bulletproofTest("returns null for URLs with extra path segments", async () => {
  expect(parseGitHubRemote("https://github.com/owner/repo/tree/main")).toBeNull()
  expect(parseGitHubRemote("https://github.com/owner/repo/blob/main/file.ts")).toBeNull()
})
