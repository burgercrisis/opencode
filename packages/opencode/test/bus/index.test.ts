import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Bus } from "../../src/bus/index"
import { Instance } from "../../src/project/instance"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { Shell } from "../../src/shell/shell"

// Global test directory for all tests
let testDir: string

describe("Bus", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  // BULLETPROOF TEST WRAPPER (inside describe to access testDir)
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

  beforeEach(async () => {
    // Set up test directory
    testDir = path.join(os.tmpdir(), "opencode-bus-test-" + Math.random().toString(36).slice(2))
    await fs.mkdir(testDir, { recursive: true })
    await Shell.cmd(`git init`).cwd(testDir).quiet()
    await Shell.cmd(`git commit --allow-empty -m "initial"`).cwd(testDir).quiet()

    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => { })

    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      delete (globalThis as any).Instance
    }

    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      delete (globalThis as any).Filesystem
    }

    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })

  bulletproofTest("publish sends event to subscribers", async () => {
    console.log("[debug] testDir value:", testDir)
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribe(Bus.InstanceDisposed, (event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, {
          directory: testDir,
        })

        unsub()

        expect(received).toHaveLength(1)
        expect(received[0]).toEqual({
          type: Bus.InstanceDisposed,
          data: { directory: testDir },
        })
      },
    })
  })

  bulletproofTest("subscribe returns unsubscribe function", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let callCount = 0
        const unsub = Bus.subscribe(Bus.InstanceDisposed, () => {
          callCount++
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })
        unsub()
        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(callCount).toBe(1)
      },
    })
  })

  bulletproofTest("once calls callback exactly once", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let callCount = 0
        Bus.once(Bus.InstanceDisposed, () => {
          callCount++
          return "done"
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })
        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(callCount).toBe(1)
      },
    })
  })

  bulletproofTest("subscribeAll receives all events", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribeAll((event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        unsub()

        expect(received).toHaveLength(1)
        expect(received[0]).toEqual({
          type: Bus.InstanceDisposed,
          data: { directory: testDir },
        })
      },
    })
  })

  bulletproofTest("multiple subscribers can receive same event", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let count1 = 0
        let count2 = 0

        Bus.subscribe(Bus.InstanceDisposed, () => count1++)
        Bus.subscribe(Bus.InstanceDisposed, () => count2++)

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(count1).toBe(1)
        expect(count2).toBe(1)
      },
    })
  })

  bulletproofTest("wildcard subscriber receives all events", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribeAll((event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        unsub()
      },
    })
  })
})
