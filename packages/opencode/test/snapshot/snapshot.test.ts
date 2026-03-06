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

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Snapshot } from "../../src/snapshot"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

async function bootstrap() {
  return tmpdir({
    git: true,
    init: async (dir) => {
      const unique = Math.random().toString(36).slice(2)
      const aContent = `A${unique}`
      const bContent = `B${unique}`
      await Filesystem.write(`${dir}/a.txt`, aContent)
      await Filesystem.write(`${dir}/b.txt`, bContent)
      await $`git add .`.cwd(dir).quiet()
      await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      return {
        aContent,
        bContent,
      }
    },
  })
}

bulletproofTest("track", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tracked = await Snapshot.track()
      expect(tracked).toBeTruthy()
    },
  })
})

bulletproofTest("track and patch returns empty patch", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()
      const patch = await Snapshot.patch(before!)
      expect(patch).toBeTruthy()
      expect(patch.files).toEqual([])
    },
  })
})

bulletproofTest("tracks new files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/new.txt`))
    },
  })
})

bulletproofTest("tracks modified files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/a.txt`, "MODIFIED")

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/a.txt`))
    },
  })
})

bulletproofTest("tracks deleted files correctly", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Use Bun's fs API instead of rm command for cross-platform compatibility
      await fs.unlink(`${tmp.path}/a.txt`)

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/a.txt`))
    },
  })
})

bulletproofTest("revert should remove new files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")

      await Snapshot.revert([await Snapshot.patch(before!)])

      expect(
        await fs
          .access(`${tmp.path}/new.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)
    },
  })
})

bulletproofTest("revert in subdirectory", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Use Bun's fs API for cross-platform mkdir
      await fs.mkdir(`${tmp.path}/sub`, { recursive: true })
      await Filesystem.write(`${tmp.path}/sub/file.txt`, "SUB")

      await Snapshot.revert([await Snapshot.patch(before!)])

      expect(
        await fs
          .access(`${tmp.path}/sub/file.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)
    },
  })
})

bulletproofTest("multiple file operations", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Multiple operations using cross-platform APIs
      await fs.unlink(`${tmp.path}/a.txt`)
      await fs.mkdir(`${tmp.path}/dir`, { recursive: true })
      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")
      await Filesystem.write(`${tmp.path}/b.txt`, "MODIFIED")

      const patch = await Snapshot.patch(before!)
      expect(patch.files.length).toBeGreaterThan(0)
    },
  })
})
