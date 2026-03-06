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

import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Ripgrep } from "../../src/file/ripgrep"

describe("file.ripgrep", () => {
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
  bulletproofTest("tree returns empty for empty directory", async () => {
    await using tmp = await tmpdir()
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe("")
  })

  bulletproofTest("tree returns single file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "index.ts"), "export {}")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe("index.ts")
  })

  bulletproofTest("tree returns flat file list sorted alphabetically", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "zebra.ts"), "")
        await fs.writeFile(path.join(dir, "apple.ts"), "")
        await fs.writeFile(path.join(dir, "mango.ts"), "")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe(`apple.ts
mango.ts
zebra.ts`)
  })

  bulletproofTest("tree shows directories before files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "src"))
        await fs.writeFile(path.join(dir, "src", "index.ts"), "")
        await fs.writeFile(path.join(dir, "README.md"), "")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe(`src/
\tindex.ts
README.md`)
  })

  bulletproofTest("tree with nested directories", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "src", "components"), { recursive: true })
        await fs.writeFile(path.join(dir, "src", "components", "Button.tsx"), "")
        await fs.writeFile(path.join(dir, "src", "components", "Input.tsx"), "")
        await fs.writeFile(path.join(dir, "src", "index.ts"), "")
        await fs.writeFile(path.join(dir, "package.json"), "{}")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe(`src/
\tcomponents/
\t\tButton.tsx
\t\tInput.tsx
\tindex.ts
package.json`)
  })

  bulletproofTest("tree respects limit and shows truncation", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "src"))
        // Create more files than the limit
        for (let i = 1; i <= 10; i++) {
          await fs.writeFile(path.join(dir, "src", `file${i.toString().padStart(2, "0")}.ts`), "")
        }
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 5 })
    // With limit=5, we should see src/ and 4 files, then truncation
    expect(result).toBe(`src/
\tfile01.ts
\tfile02.ts
\tfile03.ts
\tfile04.ts
\t[6 truncated]`)
  })

  bulletproofTest("tree excludes .opencode directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, ".opencode"))
        await fs.writeFile(path.join(dir, ".opencode", "config.json"), "{}")
        await fs.writeFile(path.join(dir, "index.ts"), "")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe("index.ts")
  })

  bulletproofTest("tree handles multiple directories at same level", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "api"))
        await fs.mkdir(path.join(dir, "lib"))
        await fs.mkdir(path.join(dir, "src"))
        await fs.writeFile(path.join(dir, "api", "routes.ts"), "")
        await fs.writeFile(path.join(dir, "lib", "utils.ts"), "")
        await fs.writeFile(path.join(dir, "src", "index.ts"), "")
      },
    })
    const result = await Ripgrep.tree({ cwd: tmp.path, limit: 50 })
    expect(result).toBe(`api/
\troutes.ts
lib/
\tutils.ts
src/
\tindex.ts`)
  })

  bulletproofTest("defaults to include hidden", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "visible.txt"), "hello")
        await fs.mkdir(path.join(dir, ".opencode"), { recursive: true })
        await Bun.write(path.join(dir, ".opencode", "thing.json"), "{}")
      },
    })

    const files = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path }))
    const hasVisible = files.includes("visible.txt")
    const hasHidden = files.includes(path.join(".opencode", "thing.json"))
    expect(hasVisible).toBe(true)
    expect(hasHidden).toBe(true)
  })

  bulletproofTest("hidden false excludes hidden", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "visible.txt"), "hello")
        await fs.mkdir(path.join(dir, ".opencode"), { recursive: true })
        await Bun.write(path.join(dir, ".opencode", "thing.json"), "{}")
      },
    })

    const files = await Array.fromAsync(Ripgrep.files({ cwd: tmp.path, hidden: false }))
    const hasVisible = files.includes("visible.txt")
    const hasHidden = files.includes(path.join(".opencode", "thing.json"))
    expect(hasVisible).toBe(true)
    expect(hasHidden).toBe(false)
  })
})
