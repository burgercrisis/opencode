// IMPORTANT: Set env vars BEFORE any imports from src/ directory
// xdg-basedir reads env vars at import time, so we must set these first
import os from "os"
import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import { afterAll, afterEach as bunAfterEach, beforeEach as bunBeforeEach } from "bun:test"

// Store the real Instance reference
let realInstance: any = null

// Create a protected wrapper that can't be modified
function createProtectedInstance(instance: any) {
  return new Proxy(instance, {
    get(target, prop) {
      // Always return from the original instance
      return target[prop]
    },
    set(target, prop, value) {
      // Allow setting properties but preserve the provide method
      if (prop === 'provide') {
        console.warn("[preload.ts] WARNING: Attempt to modify Instance.provide blocked")
        return false
      }
      target[prop] = value
      return true
    },
    deleteProperty(target, prop) {
      if (prop === 'provide') {
        console.warn("[preload.ts] WARNING: Attempt to delete Instance.provide blocked")
        return false
      }
      delete target[prop]
      return true
    }
  })
}

const sanitize = (p: string) => {
  if (!p) return p
  return p
    .replace(/\\u0000/g, "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .trim()
}

// Set XDG env vars FIRST, before any src/ imports
const dir = path.join(os.tmpdir(), "opencode-test-data-" + process.pid)
await fs.mkdir(dir, { recursive: true })
afterAll(async () => {
  // Retry cleanup a few times to handle Windows EBUSY errors
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true })
      break
    } catch (err: any) {
      if (err.code === "EBUSY" || err.code === "EPERM") {
        if (i === 4) console.warn(`Failed to cleanup test dir ${dir}: ${err.message}`)
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)))
      } else {
        throw err
      }
    }
  }
})

process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")
process.env["OPENCODE_MODELS_PATH"] = path.join(import.meta.dir, "tool", "fixtures", "models-api.json")

// Set test home directory to isolate tests from user's actual home directory
// This prevents tests from picking up real user configs/skills from ~/.claude/skills
const testHome = sanitize(path.join(dir, "home"))
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome
console.log(`[preload.ts] Set OPENCODE_TEST_HOME=${testHome}`)

// Set test managed config directory to isolate tests from system managed settings
const testManagedConfigDir = sanitize(path.join(dir, "managed"))
process.env["OPENCODE_TEST_MANAGED_CONFIG_DIR"] = testManagedConfigDir

// Write the cache version file to prevent global/index.ts from clearing the cache
const cacheDir = sanitize(path.join(dir, "cache", "opencode"))
await fs.mkdir(cacheDir, { recursive: true })
await fs.writeFile(path.join(cacheDir, "version"), "14")

// Clear provider env vars to ensure clean test state
delete process.env["ANTHROPIC_API_KEY"]
delete process.env["OPENAI_API_KEY"]
delete process.env["GOOGLE_API_KEY"]
delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
delete process.env["AZURE_OPENAI_API_KEY"]
delete process.env["AWS_ACCESS_KEY_ID"]
delete process.env["AWS_PROFILE"]
delete process.env["AWS_REGION"]
delete process.env["AWS_BEARER_TOKEN_BEDROCK"]
delete process.env["OPENROUTER_API_KEY"]
delete process.env["GROQ_API_KEY"]
delete process.env["MISTRAL_API_KEY"]
delete process.env["PERPLEXITY_API_KEY"]
delete process.env["TOGETHER_API_KEY"]
delete process.env["XAI_API_KEY"]
delete process.env["DEEPSEEK_API_KEY"]
delete process.env["FIREWORKS_API_KEY"]
delete process.env["CEREBRAS_API_KEY"]
delete process.env["SAMBANOVA_API_KEY"]

// Now safe to import from src/
let Log: any, Instance: any, Snapshot: any, Global: any, resetLevenshteinForTest: any, resetGlobalBusForTest: any, afterEach: any

try {
  const logModule = await import("../src/util/log")
  Log = logModule.Log
  const instanceModule = await import("../src/project/instance")
  Instance = instanceModule.Instance
  const snapshotModule = await import("../src/snapshot/index")
  Snapshot = snapshotModule.Snapshot
  const globalModule = await import("../src/global/index")
  Global = globalModule.Global
  const levenshteinModule = await import("../src/util/levenshtein")
  resetLevenshteinForTest = levenshteinModule.resetForTest
  const globalBusModule = await import("../src/bus/global")
  resetGlobalBusForTest = globalBusModule.resetForTest
  const bunTest = await import("bun:test")
  afterEach = bunTest.afterEach

  // Expose Instance globally so tests can use Instance.provide()
  const protectedInstance = createProtectedInstance(Instance)
    ; (globalThis as any).Instance = protectedInstance
  // Save the real Instance for restoration after polluted tests
  realInstance = protectedInstance

  // DEEP FREEZE to prevent modifications
  if (typeof Object.freeze === 'function') {
    Object.freeze((globalThis as any).Instance)
    Object.freeze((globalThis as any).Instance.provide)
  }

  console.log("[preload.ts] Instance global exposed successfully, provide is:", typeof Instance.provide)
} catch (err) {
  console.error("[preload.ts] Failed to import modules:", err)
  throw err
}

Log.init({
  print: true,
  dev: true,
  level: "DEBUG",
})

afterEach(async () => {
  await Instance.resetForTest()
  Snapshot.resetForTest()
  Global.resetForTest()
  Log.resetForTest()
  resetLevenshteinForTest()
  resetGlobalBusForTest()

  // Restore the real Instance if it was polluted by mock objects
  // This fixes test isolation issues where src/*/test/ files set globalThis.Instance to mocks
  if (realInstance && (globalThis as any).Instance !== realInstance) {
    (globalThis as any).Instance = realInstance
  }

  // ALWAYS ensure the global Instance has the provide method
  // Some tests might be modifying the Instance object in-place
  if ((globalThis as any).Instance && typeof (globalThis as any).Instance.provide !== 'function') {
    console.error("[preload.ts] Global Instance missing provide method, attempting complete restoration")

    // EMERGENCY: Complete module reload
    try {
      // Clear all caches
      delete require.cache[require.resolve("../src/project/instance")]

      // Re-import the Instance module
      const freshInstanceModule = await import("../src/project/instance")
      const freshInstance = freshInstanceModule.default || freshInstanceModule.Instance

      // Verify the fresh instance has provide method
      if (typeof freshInstance?.provide === 'function') {
        const protectedInstance = createProtectedInstance(freshInstance)
          ; (globalThis as any).Instance = protectedInstance
        realInstance = protectedInstance

        // Re-freeze the new instance
        if (typeof Object.freeze === 'function') {
          Object.freeze((globalThis as any).Instance)
          Object.freeze((globalThis as any).Instance.provide)
        }

        console.error("[preload.ts] Emergency restoration successful")
      } else {
        console.error("[preload.ts] Emergency restoration failed - fresh instance missing provide method")
      }
    } catch (err) {
      console.error("[preload.ts] Emergency restoration failed:", err)
    }
  }

  // ADDITIONAL SAFETY: Always verify Instance.provide exists and recreate if needed
  if (typeof (globalThis as any).Instance?.provide !== 'function') {
    console.error("[preload.ts] CRITICAL: Instance.provide still missing after restoration, forcing recreation")
    try {
      // Force complete recreation
      const { Instance: FreshInstance } = await import("../src/project/instance")
      if (typeof FreshInstance?.provide === 'function') {
        const protectedInstance = createProtectedInstance(FreshInstance)
          ; (globalThis as any).Instance = protectedInstance
        realInstance = protectedInstance

        // Re-freeze
        if (typeof Object.freeze === 'function') {
          Object.freeze((globalThis as any).Instance)
          Object.freeze((globalThis as any).Instance.provide)
        }
        console.error("[preload.ts] Force recreation successful")
      }
    } catch (err) {
      console.error("[preload.ts] Force recreation failed:", err)
    }
  }

  delete (globalThis as any).Config
  delete (globalThis as any).Filesystem
  delete (globalThis as any).Global

  // Reset Global.Path to prevent pollution from tests that modify it
  // This is critical because some tests modify Global.Path.config and Global.Path.data
  // which can break module loading for Config and other modules
  try {
    const { Global } = await import("../src/global")
    Global.resetForTest()
  } catch (err) {
    // Ignore if Global module is not available
  }

  // Reset working directory after each test
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd)
  }
})

// Also run cleanup BEFORE each test to ensure no pollution from previous tests
// This helps when tests run in different orders or when beforeEach doesn't run early enough

// Store original working directory to reset after each test
const originalCwd = process.cwd()

bunBeforeEach(async () => {
  // ALWAYS restore the real Instance - this must be done BEFORE any test code runs
  // to ensure test files that import Instance get the real one, not a polluted version
  if (realInstance) {
    (globalThis as any).Instance = realInstance
  }

  // ALWAYS ensure the global Instance has the provide method
  // Some tests might be modifying the Instance object in-place
  if ((globalThis as any).Instance && typeof (globalThis as any).Instance.provide !== 'function') {
    console.error("[preload.ts] beforeEach: Global Instance missing provide method, restoring from realInstance")
      (globalThis as any).Instance = realInstance
  }

  // DEBUG: Check if the Instance module export has been corrupted
  const currentProvide = (Instance as any).provide
  if (typeof currentProvide !== 'function') {
    console.error(`[preload.ts] CRITICAL: Instance.provide is ${typeof currentProvide}, not function!`)
    console.error(`[preload.ts] Instance keys:`, Object.keys(Instance || {}))

    // EMERGENCY: Try to reload the Instance module
    try {
      console.error("[preload.ts] Attempting emergency reload of Instance module")
      const instancePath = path.join(import.meta.dir, "src", "project", "instance.ts")
      delete require.cache[instancePath]
      const freshInstance = await import(instancePath)
        ; (globalThis as any).Instance = freshInstance.default
      realInstance = freshInstance.default
      console.error("[preload.ts] Emergency reload completed, provide is:", typeof freshInstance.default.provide)
    } catch (err) {
      console.error("[preload.ts] Emergency reload failed:", err)
    }
  }

  // Clear auth.json to prevent auth state pollution between tests
  // This must happen BEFORE we potentially delete Global below
  try {
    const authPath = path.join(Global.Path.data, "auth.json")
    await fs.writeFile(authPath, "{}", "utf-8")
  } catch {
    // Ignore errors if file doesn't exist or Global not available
  }

  delete (globalThis as any).Config
  delete (globalThis as any).Filesystem
  delete (globalThis as any).Global

  // Reset working directory to original to fix shell command failures
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd)
  }
})

const { BunProc } = await import("../src/bun/index")
const originalInstall = BunProc.install
const originalRun = BunProc.run

BunProc.run = async (args: string[], options?: any) => {
  if (args[0] === "install" || (args[0]?.endsWith("bun.exe") && args[1] === "install")) {
    const cwd = options?.cwd || process.cwd()
    const pkgJsonPath = path.join(cwd, "package.json")
    if (!fsSync.existsSync(pkgJsonPath)) {
      await fs.writeFile(pkgJsonPath, JSON.stringify({ name: "mock-pkg" }))
    }
    return { exitCode: 0, stdout: "", stderr: "" } as any
  }
  return originalRun(args, options)
}

BunProc.install = async (pkg: string, version = "latest") => {
  const mockPath = path.join(dir, "cache", "mock-" + pkg.replace(/[\/@]/g, "-") + ".ts")
  await fs.mkdir(path.dirname(mockPath), { recursive: true })

  if (pkg === "@aws-sdk/credential-providers") {
    await fs.writeFile(mockPath, "export const fromNodeProviderChain = () => ({})")
  } else if (pkg === "opencode-anthropic-auth") {
    await fs.writeFile(mockPath, "export default async () => ({ hooks: {} })")
  } else {
    // Default mock for any other package
    await fs.writeFile(mockPath, "export default async () => ({ hooks: {} })")
  }
  return mockPath
}

