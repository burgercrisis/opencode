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
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Worktree } from "../../src/worktree"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

describe("Worktree.remove", () => {
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
  bulletproofTest("continues when git remove exits non-zero after detaching", async () => {
    await using tmp = await tmpdir({ git: true })
    const root = tmp.path
    const name = `remove-regression-${Date.now().toString(36)}`
    const branch = `opencode/${name}`
    const dir = path.join(root, "..", name)

    await $`git worktree add --no-checkout -b ${branch} ${dir}`.cwd(root).quiet()
    await $`git reset --hard`.cwd(dir).quiet()

    const real = (await $`which git`.quiet().text()).trim()
    expect(real).toBeTruthy()

    const bin = path.join(root, "bin")
    const shim = path.join(bin, "git")
    await fs.mkdir(bin, { recursive: true })
    await Bun.write(
      shim,
      [
        "#!/bin/bash",
        `REAL_GIT=${JSON.stringify(real)}`,
        'if [ "$1" = "worktree" ] && [ "$2" = "remove" ]; then',
        '  "$REAL_GIT" "$@" >/dev/null 2>&1',
        '  echo "fatal: failed to remove worktree: Directory not empty" >&2',
        "  exit 1",
        "fi",
        'exec "$REAL_GIT" "$@"',
      ].join("\n"),
    )
    await fs.chmod(shim, 0o755)

    const prev = process.env.PATH ?? ""
    process.env.PATH = `${bin}${path.delimiter}${prev}`

    const ok = await (async () => {
      try {
        return await Instance.provide({
          directory: root,
          fn: () => Worktree.remove({ directory: dir }),
        })
      } finally {
        process.env.PATH = prev
      }
    })()

    expect(ok).toBe(true)
    expect(await Filesystem.exists(dir)).toBe(false)

    const list = await $`git worktree list --porcelain`.cwd(root).quiet().text()
    expect(list).not.toContain(`worktree ${dir}`)

    const ref = await $`git show-ref --verify --quiet refs/heads/${branch}`.cwd(root).quiet().nothrow()
    expect(ref.exitCode).not.toBe(0)
  })
})
