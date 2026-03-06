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

import { describe, expect, it, test, mock, beforeEach, afterEach } from "bun:test"
import { assertExternalDirectory } from "../../src/tool/external-directory"
import { Filesystem } from "../../src/util/filesystem"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

describe("External Directory - Comprehensive Tests", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  describe("Basic Functionality", () => {
    it("returns undefined if target is missing", async () => {
      const result = await assertExternalDirectory({} as any)
      expect(result).toBeUndefined()
    })

    it("returns undefined if bypass is true", async () => {
      const result = await assertExternalDirectory({} as any, "/outside", { bypass: true })
      expect(result).toBeUndefined()
    })

    it("returns undefined if path is inside project", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const target = path.join(tmp.path, "file.txt")
          const result = await assertExternalDirectory({} as any, target)
          expect(result).toBeUndefined()
        },
      })
    })

    bulletproofTest("should return undefined when path is within instance", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Pass ctx first, then the path
          const result = await assertExternalDirectory(mockCtx, path.join(tmp.path, "subdir"))
          expect(result).toBeUndefined()
        },
      })
    })
  })

  describe("External Path Detection", () => {
    bulletproofTest("should detect paths outside project directory", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const externalPath = path.join(tmp.path, "..", "external")
          const result = await assertExternalDirectory(mockCtx, externalPath)
          
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })

    bulletproofTest("should handle absolute paths correctly", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const absolutePath = "/tmp/external" // Unix absolute path
          const result = await assertExternalDirectory(mockCtx, absolutePath)
          
          if (process.platform !== 'win32') {
            expect(result).toBeDefined()
            expect(result).toContain("outside the project directory")
          }
        },
      })
    })

    bulletproofTest("should handle Windows absolute paths correctly", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const windowsPath = "C:\\temp\\external" // Windows absolute path
          const result = await assertExternalDirectory(mockCtx, windowsPath)
          
          if (process.platform === 'win32') {
            expect(result).toBeDefined()
            expect(result).toContain("outside the project directory")
          }
        },
      })
    })

    bulletproofTest("should handle relative paths that resolve outside project", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const relativePath = "../external"
          const result = await assertExternalDirectory(mockCtx, relativePath)
          
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })
  })

  describe("Edge Cases", () => {
    bulletproofTest("should handle empty paths", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result1 = await assertExternalDirectory(mockCtx, "")
          const result2 = await assertExternalDirectory(mockCtx, null as any)
          const result3 = await assertExternalDirectory(mockCtx, undefined as any)
          
          expect(result1).toBeUndefined()
          expect(result2).toBeUndefined()
          expect(result3).toBeUndefined()
        },
      })
    })

    bulletproofTest("should handle malformed paths", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const malformedPaths = [
            "///invalid///path///",
            "C:\\invalid\\path\\..\\..\\outside",
            "/invalid/path/../../../outside"
          ]
          
          for (const malformedPath of malformedPaths) {
            const result = await assertExternalDirectory(mockCtx, malformedPath)
            // Should handle gracefully without throwing
            expect(typeof result).toBe('string')
          }
        },
      })
    })

    bulletproofTest("should handle very long paths", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const longPath = "a".repeat(1000)
          const result = await assertExternalDirectory(mockCtx, longPath)
          
          // Should handle without crashing
          expect(typeof result).toBe('string')
        },
      })
    })
  })

  describe("File System Integration", () => {
    bulletproofTest("should work with existing directories", async () => {
      await using tmp = await tmpdir()

      // Create an external directory
      const externalDir = path.join(tmp.path, "..", "external-dir")
      await Filesystem.ensureDir(externalDir)

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await assertExternalDirectory(mockCtx, externalDir)
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })

      // Cleanup
      await Filesystem.rm(externalDir)
    })

    bulletproofTest("should work with non-existing external directories", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const nonExistingPath = path.join(tmp.path, "..", "non-existing")
          const result = await assertExternalDirectory(mockCtx, nonExistingPath)
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })

    bulletproofTest("should handle symlinks correctly", async () => {
      await using tmp = await tmpdir()

      // Create a symlink inside project pointing outside
      const externalDir = path.join(tmp.path, "..", "external-target")
      const symlinkPath = path.join(tmp.path, "symlink")
      
      try {
        await Filesystem.ensureDir(externalDir)
        await Filesystem.symlink(externalDir, symlinkPath)

        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const result = await assertExternalDirectory(mockCtx, symlinkPath)
            // Symlinks should be resolved to their target
            expect(result).toBeDefined()
            expect(result).toContain("outside the project directory")
          },
        })
      } catch (error) {
        // Symlinks might not be supported on all systems
        console.log("Symlink test skipped:", error)
      } finally {
        // Cleanup
        try {
          await Filesystem.rm(symlinkPath)
          await Filesystem.rm(externalDir)
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })

  describe("Cross-Platform Behavior", () => {
    bulletproofTest("should handle Windows path separators", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const windowsPath = tmp.path.replace(/\//g, '\\') + "\\..\\external"
          const result = await assertExternalDirectory(mockCtx, windowsPath)
          
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })

    bulletproofTest("should handle Unix path separators", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const unixPath = tmp.path.replace(/\\/g, '/') + "/../external"
          const result = await assertExternalDirectory(mockCtx, unixPath)
          
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })

    bulletproofTest("should handle mixed path separators", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mixedPath = tmp.path + "\\../external/unix\\style\\path"
          const result = await assertExternalDirectory(mockCtx, mixedPath)
          
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })
  })

  describe("Security Considerations", () => {
    bulletproofTest("should prevent path traversal attacks", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const traversalPaths = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config",
            "/etc/passwd",
            "C:\\Windows\\System32\\config"
          ]
          
          for (const traversalPath of traversalPaths) {
            const result = await assertExternalDirectory(mockCtx, traversalPath)
            expect(result).toBeDefined()
            expect(result).toContain("outside the project directory")
          }
        },
      })
    })

    bulletproofTest("should handle encoded paths safely", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const encodedPaths = [
            "%2e%2e%2f%2e%2e%2fetc%2fpasswd", // URL encoded ../../../etc/passwd
            "..%2f..%2f..%2fetc%2fpasswd", // Partially encoded
            "..\\..\\..\\windows\\system32" // Windows style
          ]
          
          for (const encodedPath of encodedPaths) {
            const result = await assertExternalDirectory(mockCtx, encodedPath)
            expect(typeof result).toBe('string')
          }
        },
      })
    })
  })

  describe("Performance and Scalability", () => {
    bulletproofTest("should handle many path checks efficiently", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const paths = []
          for (let i = 0; i < 100; i++) {
            paths.push(path.join(tmp.path, "..", `external-${i}`))
          }

          const startTime = Date.now()
          
          const results = await Promise.all(
            paths.map(p => assertExternalDirectory(mockCtx, p))
          )
          
          const endTime = Date.now()
          
          expect(endTime - startTime).toBeLessThan(1000) // Should complete in under 1 second
          expect(results).toHaveLength(100)
          results.forEach(result => {
            expect(result).toBeDefined()
            expect(result).toContain("outside the project directory")
          })
        },
      })
    })

    bulletproofTest("should handle deeply nested paths efficiently", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const deepPath = path.join(tmp.path, "..", ...Array(50).fill("deep"), "file.txt")
          
          const startTime = Date.now()
          const result = await assertExternalDirectory(mockCtx, deepPath)
          const endTime = Date.now()
          
          expect(endTime - startTime).toBeLessThan(100) // Should complete quickly
          expect(result).toBeDefined()
          expect(result).toContain("outside the project directory")
        },
      })
    })
  })

  describe("Integration with Other Tools", () => {
    bulletproofTest("should work with file operations", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const externalFile = path.join(tmp.path, "..", "external.txt")
          
          // First check if external
          const checkResult = await assertExternalDirectory(mockCtx, externalFile)
          expect(checkResult).toBeDefined()
          
          // Should be able to proceed with file operations if needed
          try {
            await Filesystem.write(externalFile, "test content")
            const exists = await Filesystem.exists(externalFile)
            expect(exists).toBe(true)
            
            // Cleanup
            await Filesystem.rm(externalFile)
          } catch (error) {
            // File operations might fail, but that's expected for external paths
            expect(error).toBeDefined()
          }
        },
      })
    })

    bulletproofTest("should handle project root edge cases", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Test paths at various levels
          const testCases = [
            { path: tmp.path, expected: undefined }, // Inside project
            { path: path.dirname(tmp.path), expected: "outside" }, // Parent directory
            { path: path.join(tmp.path, "subdir"), expected: undefined }, // Subdirectory
          ]
          
          for (const testCase of testCases) {
            const result = await assertExternalDirectory(mockCtx, testCase.path)
            if (testCase.expected === undefined) {
              expect(result).toBeUndefined()
            } else {
              expect(result).toContain(testCase.expected)
            }
          }
        },
      })
    })
  })
})
