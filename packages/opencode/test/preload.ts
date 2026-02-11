// IMPORTANT: Set env vars BEFORE any imports from src/ directory
// xdg-basedir reads env vars at import time, so we must set these first
import os from "os"
import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import { afterAll } from "bun:test"

const sanitize = (p: string) => {
  if (!p) return p
  return p
    .replace(/\\u0000/g, "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .trim()
}
const rawDir = path.join(os.tmpdir(), "opencode-test-data-" + process.pid)
const dir = sanitize(rawDir)
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
// Set test home directory to isolate tests from user's actual home directory
// This prevents tests from picking up real user configs/skills from ~/.claude/skills
const testHome = sanitize(path.join(dir, "home"))
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome
console.log(`[preload.ts] Set OPENCODE_TEST_HOME=${testHome}`)

// Set test managed config directory to isolate tests from system managed settings
const testManagedConfigDir = sanitize(path.join(dir, "managed"))
process.env["OPENCODE_TEST_MANAGED_CONFIG_DIR"] = testManagedConfigDir

process.env["XDG_DATA_HOME"] = sanitize(path.join(dir, "share"))
process.env["XDG_CACHE_HOME"] = sanitize(path.join(dir, "cache"))
process.env["XDG_CONFIG_HOME"] = sanitize(path.join(dir, "config"))
process.env["XDG_STATE_HOME"] = sanitize(path.join(dir, "state"))
process.env["OPENCODE_MODELS_PATH"] = sanitize(path.join(import.meta.dir, "tool", "fixtures", "models-api.json"))

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
const { Log } = await import("../src/util/log")
const { Instance } = await import("../src/project/instance")
const { Snapshot } = await import("../src/snapshot/index")
const { Global } = await import("../src/global/index")
const { afterEach } = await import("bun:test")

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

