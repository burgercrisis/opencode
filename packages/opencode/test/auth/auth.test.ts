import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Auth } from "../../src/auth"
import { Global } from "../../src/global"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("Auth", () => {
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
  let testHome: string
  let originalHome: string | undefined

  beforeEach(async () => {
    testHome = path.join(os.tmpdir(), "opencode-auth-test-" + Math.random().toString(36).slice(2))
    await fs.mkdir(testHome, { recursive: true })
    originalHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = testHome
    Global.resetForTest()
    // Ensure auth file doesn't exist at start of each test
    const authPath = path.join(Global.Path.data, "auth.json")
    await fs.rm(authPath, { force: true }).catch(() => {})
  })

  afterEach(async () => {
    process.env.OPENCODE_TEST_HOME = originalHome
    Global.resetForTest()
    await fs.rm(testHome, { recursive: true, force: true }).catch(() => {})
  })

  test("should set and get auth info", async () => {
    const apiAuth: Auth.Info = { type: "api", key: "test-key" }
    await Auth.set("provider1", apiAuth)
    
    const retrieved = await Auth.get("provider1")
    expect(retrieved).toEqual(apiAuth)
  })

  test("should handle multiple providers", async () => {
    const apiAuth: Auth.Info = { type: "api", key: "test-key" }
    const oauthAuth: Auth.Info = { 
      type: "oauth", 
      refresh: "ref", 
      access: "acc", 
      expires: Date.now() + 3600,
      accountId: "acc123"
    }
    
    await Auth.set("api", apiAuth)
    await Auth.set("oauth", oauthAuth)
    
    const all = await Auth.all()
    expect(all["api"]).toEqual(apiAuth)
    expect(all["oauth"]).toEqual(oauthAuth)
  })

  test("should remove auth info", async () => {
    const apiAuth: Auth.Info = { type: "api", key: "test-key" }
    await Auth.set("provider1", apiAuth)
    
    await Auth.remove("provider1")
    const retrieved = await Auth.get("provider1")
    expect(retrieved).toBeUndefined()
  })

  test("should handle missing auth file", async () => {
    const all = await Auth.all()
    expect(all).toEqual({})
  })

  test("should filter out invalid auth data", async () => {
    const authPath = path.join(Global.Path.data, "auth.json")
    await fs.mkdir(Global.Path.data, { recursive: true })
    await fs.writeFile(authPath, JSON.stringify({
      valid: { type: "api", key: "ok" },
      invalid: { type: "unknown", data: "bad" },
      incomplete: { type: "oauth", refresh: "missing-others" }
    }))
    
    const all = await Auth.all()
    expect(Object.keys(all)).toEqual(["valid"])
    expect(all["valid"]).toEqual({ type: "api", key: "ok" })
  })

  test("should handle wellknown auth type", async () => {
    const wk: Auth.Info = { type: "wellknown", key: "k", token: "t" }
    await Auth.set("wk", wk)
    expect(await Auth.get("wk")).toEqual(wk)
  })
})
