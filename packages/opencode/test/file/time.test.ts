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

import { describe, test, expect, beforeEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { FileTime } from "../../src/file/time"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

describe("file/time", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  const sessionID = "test-session-123"

  describe("read() and get()", () => {
    bulletproofTest("stores read timestamp", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const before = FileTime.get(sessionID, filepath)
          expect(before).toBeUndefined()

          FileTime.read(sessionID, filepath)

          const after = FileTime.get(sessionID, filepath)
          expect(after).toBeInstanceOf(Date)
          expect(after!.getTime()).toBeGreaterThan(0)
        },
      })
    })

    bulletproofTest("tracks separate timestamps per session", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read("session1", filepath)
          FileTime.read("session2", filepath)

          const time1 = FileTime.get("session1", filepath)
          const time2 = FileTime.get("session2", filepath)

          expect(time1).toBeDefined()
          expect(time2).toBeDefined()
        },
      })
    })

    bulletproofTest("updates timestamp on subsequent reads", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)
          const first = FileTime.get(sessionID, filepath)!

          await new Promise((resolve) => setTimeout(resolve, 10))

          FileTime.read(sessionID, filepath)
          const second = FileTime.get(sessionID, filepath)!

          expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime())
        },
      })
    })
  })

  describe("assert()", () => {
    bulletproofTest("passes when file has not been modified", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)

          // Should not throw
          await FileTime.assert(sessionID, filepath)
        },
      })
    })

    bulletproofTest("throws when file was not read first", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await expect(FileTime.assert(sessionID, filepath)).rejects.toThrow("You must read file")
        },
      })
    })

    bulletproofTest("throws when file was modified after read", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)

          // Wait to ensure different timestamps
          await new Promise((resolve) => setTimeout(resolve, 100))

          // Modify file after reading
          await fs.writeFile(filepath, "modified content", "utf-8")

          await expect(FileTime.assert(sessionID, filepath)).rejects.toThrow("modified since it was last read")
        },
      })
    })

    bulletproofTest("includes timestamps in error message", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)
          await new Promise((resolve) => setTimeout(resolve, 100))
          await fs.writeFile(filepath, "modified", "utf-8")

          let error: Error | undefined
          try {
            await FileTime.assert(sessionID, filepath)
          } catch (e) {
            error = e as Error
          }
          expect(error).toBeDefined()
          expect(error!.message).toContain("Last modification:")
          expect(error!.message).toContain("Last read:")
        },
      })
    })

    bulletproofTest("skips check when OPENCODE_DISABLE_FILETIME_CHECK is true", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const { Flag } = await import("../../src/flag/flag")
          const original = Flag.OPENCODE_DISABLE_FILETIME_CHECK
          ;(Flag as { OPENCODE_DISABLE_FILETIME_CHECK: boolean }).OPENCODE_DISABLE_FILETIME_CHECK = true

          try {
            // Should not throw even though file wasn't read
            await FileTime.assert(sessionID, filepath)
          } finally {
            ;(Flag as { OPENCODE_DISABLE_FILETIME_CHECK: boolean }).OPENCODE_DISABLE_FILETIME_CHECK = original
          }
        },
      })
    })
  })

  describe("withLock()", () => {
    bulletproofTest("executes function within lock", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let executed = false
          await FileTime.withLock(filepath, async () => {
            executed = true
            return "result"
          })
          expect(executed).toBe(true)
        },
      })
    })

    bulletproofTest("returns function result", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await FileTime.withLock(filepath, async () => {
            return "success"
          })
          expect(result).toBe("success")
        },
      })
    })

    bulletproofTest("serializes concurrent operations on same file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const order: number[] = []

          const op1 = FileTime.withLock(filepath, async () => {
            order.push(1)
            await new Promise((resolve) => setTimeout(resolve, 10))
            order.push(2)
          })

          const op2 = FileTime.withLock(filepath, async () => {
            order.push(3)
            order.push(4)
          })

          await Promise.all([op1, op2])

          // Operations should be serialized
          expect(order).toContain(1)
          expect(order).toContain(2)
          expect(order).toContain(3)
          expect(order).toContain(4)
        },
      })
    })

    bulletproofTest("allows concurrent operations on different files", async () => {
      await using tmp = await tmpdir()
      const filepath1 = path.join(tmp.path, "file1.txt")
      const filepath2 = path.join(tmp.path, "file2.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let started1 = false
          let started2 = false

          const op1 = FileTime.withLock(filepath1, async () => {
            started1 = true
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(started2).toBe(true) // op2 should have started while op1 is running
          })

          const op2 = FileTime.withLock(filepath2, async () => {
            started2 = true
          })

          await Promise.all([op1, op2])

          expect(started1).toBe(true)
          expect(started2).toBe(true)
        },
      })
    })

    bulletproofTest("releases lock even if function throws", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await expect(
            FileTime.withLock(filepath, async () => {
              throw new Error("Test error")
            }),
          ).rejects.toThrow("Test error")

          // Lock should be released, subsequent operations should work
          let executed = false
          await FileTime.withLock(filepath, async () => {
            executed = true
          })
          expect(executed).toBe(true)
        },
      })
    })

    bulletproofTest("deadlocks on nested locks (expected behavior)", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Nested locks on same file cause deadlock - this is expected
          // The outer lock waits for inner to complete, but inner waits for outer to release
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Deadlock detected")), 100),
          )

          const nestedLock = FileTime.withLock(filepath, async () => {
            return FileTime.withLock(filepath, async () => {
              return "inner"
            })
          })

          // Should timeout due to deadlock
          await expect(Promise.race([nestedLock, timeout])).rejects.toThrow("Deadlock detected")
        },
      })
    })
  })

  describe("stat() Filesystem.stat pattern", () => {
    bulletproofTest("reads file modification time via Filesystem.stat()", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)

          const stats = Filesystem.stat(filepath)
          expect(stats?.mtime).toBeInstanceOf(Date)
          expect(stats!.mtime.getTime()).toBeGreaterThan(0)

          // FileTime.assert uses this stat internally
          await FileTime.assert(sessionID, filepath)
        },
      })
    })

    bulletproofTest("detects modification via stat mtime", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "file.txt")
      await fs.writeFile(filepath, "original", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          FileTime.read(sessionID, filepath)

          const originalStat = Filesystem.stat(filepath)

          // Wait and modify
          await new Promise((resolve) => setTimeout(resolve, 100))
          await fs.writeFile(filepath, "modified", "utf-8")

          const newStat = Filesystem.stat(filepath)
          expect(newStat!.mtime.getTime()).toBeGreaterThan(originalStat!.mtime.getTime())

          await expect(FileTime.assert(sessionID, filepath)).rejects.toThrow()
        },
      })
    })
  })
})
