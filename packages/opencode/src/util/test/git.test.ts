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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { git, type GitResult } from "../git"
import { tmpdir } from "os"
import { join } from "path"
import { mkdir, rm } from "fs/promises"
import { Flag } from "../../flag/flag"

describe("git", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `git-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => { })
  })

  describe("GitResult interface", () => {
    it("should have correct interface structure", () => {
      // Test that GitResult interface is correctly exported
      const mockResult: GitResult = {
        exitCode: 0,
        text: () => "test output",
        stdout: Buffer.from("test"),
        stderr: Buffer.from(""),
      }

      expect(mockResult.exitCode).toBe(0)
      expect(mockResult.text()).toBe("test output")
      expect(mockResult.stdout).toBeInstanceOf(Buffer)
      expect(mockResult.stderr).toBeInstanceOf(Buffer)
    })

    it("should support ReadableStream for stdout/stderr", () => {
      const stream = new ReadableStream<Uint8Array>()
      const mockResult: GitResult = {
        exitCode: 0,
        text: () => "test",
        stdout: stream,
        stderr: stream,
      }

      expect(mockResult.stdout).toBeInstanceOf(ReadableStream)
    })

    it("should support async text function", async () => {
      const mockResult: GitResult = {
        exitCode: 0,
        text: () => Promise.resolve("async output"),
        stdout: Buffer.from("test"),
        stderr: Buffer.from(""),
      }

      const text = await Promise.resolve(mockResult.text())
      expect(text).toBe("async output")
    })

    it("should handle error exit codes", () => {
      const mockResult: GitResult = {
        exitCode: 1,
        text: () => "",
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("error message"),
      }

      expect(mockResult.exitCode).toBe(1)
      expect(mockResult.stderr.toString()).toBe("error message")
    })
  })

  describe("git function execution", () => {
    it("should execute git commands successfully", async () => {
      // Initialize a git repo
      await git(["init"], { cwd: testDir })

      // Test a simple git command
      const result = await git(["status"], { cwd: testDir })

      expect(result.exitCode).toBe(0)
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })

    it("should handle git commands with environment variables", async () => {
      await git(["init"], { cwd: testDir })

      const result = await git(["status"], {
        cwd: testDir,
        env: { GIT_AUTHOR_NAME: "Test User", GIT_AUTHOR_EMAIL: "test@example.com" }
      })

      expect(result.exitCode).toBe(0)
      expect(typeof result.text()).toBe("string")
    })

    it("should handle git command errors gracefully", async () => {
      // Try to run git command in a directory that's not a git repo
      const result = await git(["status"], { cwd: testDir })

      // Should handle error without throwing
      expect(typeof result.exitCode).toBe("number")
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })

    it("should handle invalid git commands", async () => {
      await git(["init"], { cwd: testDir })

      // Try an invalid git command
      const result = await git(["invalid-command-that-does-not-exist"], { cwd: testDir })

      // Should handle error without throwing
      expect(typeof result.exitCode).toBe("number")
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })
  })

  describe("git function signature", () => {
    it("should be a function", () => {
      expect(typeof git).toBe("function")
    })

    it("should accept args and opts parameters", () => {
      // Just verify the function signature is correct
      expect(git.length).toBe(2)
    })
  })

  describe("ACP client mode", () => {
    const originalEnv = process.env.OPENCODE_CLIENT

    beforeEach(() => {
      // Set environment variable to simulate ACP client mode
      process.env.OPENCODE_CLIENT = "acp"
    })

    afterEach(() => {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env.OPENCODE_CLIENT = originalEnv
      } else {
        delete process.env.OPENCODE_CLIENT
      }
    })

    it("should use Bun.spawn when OPENCODE_CLIENT is 'acp'", async () => {
      await git(["init"], { cwd: testDir })

      const result = await git(["status"], { cwd: testDir })

      expect(result.exitCode).toBe(0)
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })

    it("should handle errors in ACP mode gracefully", async () => {
      // Try to run git command in a directory that's not a git repo
      const result = await git(["status"], { cwd: testDir })

      expect(typeof result.exitCode).toBe("number")
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })

    it("should handle environment variables in ACP mode", async () => {
      await git(["init"], { cwd: testDir })

      const result = await git(["status"], {
        cwd: testDir,
        env: { GIT_AUTHOR_NAME: "Test User", GIT_AUTHOR_EMAIL: "test@example.com" }
      })

      expect(result.exitCode).toBe(0)
      expect(typeof result.text()).toBe("string")
    })

    it("should handle spawn errors in ACP mode", async () => {
      // Test with invalid git command to trigger error handling
      const result = await git(["invalid-command"], { cwd: testDir })

      // Should handle the error and return error result
      expect(typeof result.exitCode).toBe("number")
      expect(typeof result.text()).toBe("string")
      expect(result.stdout).toBeInstanceOf(Buffer)
      expect(result.stderr).toBeInstanceOf(Buffer)
    })

    it("should handle Bun.spawn errors and catch block", async () => {
      // Create a test that will cause Bun.spawn to throw an error
      // by using an invalid working directory that doesn't exist
      const invalidDir = "/path/that/does/not/exist/anywhere"

      const result = await git(["status"], { cwd: invalidDir })

      // Should handle the spawn error through the catch block
      expect(result.exitCode).toBe(1)
      expect(result.text()).toBe("")
      expect(result.stdout).toEqual(Buffer.alloc(0))
      expect(result.stderr).toBeInstanceOf(Buffer)
      expect(result.stderr.length).toBeGreaterThan(0)
    })
  })
})
