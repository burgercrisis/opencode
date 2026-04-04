import { test, expect } from "bun:test"
import { Auth } from "../../src/auth"

test("set normalizes trailing slashes in keys", async () => {
  await Auth.set("https://example.com/", {
    type: "wellknown",
    key: "TOKEN",
    token: "abc",
  })
  const data = await Auth.all()
  expect(data["https://example.com"]).toBeDefined()
  expect(data["https://example.com/"]).toBeUndefined()
})

test("set cleans up pre-existing trailing-slash entry", async () => {
  // Simulate a pre-fix entry with trailing slash
  await Auth.set("https://example.com/", {
    type: "wellknown",
    key: "TOKEN",
    token: "old",
  })
  // Re-login with normalized key (as the CLI does post-fix)
  await Auth.set("https://example.com", {
    type: "wellknown",
    key: "TOKEN",
    token: "new",
  })
  const data = await Auth.all()
  const keys = Object.keys(data).filter((k) => k.includes("example.com"))
  expect(keys).toEqual(["https://example.com"])
  const entry = data["https://example.com"]!
  expect(entry.type).toBe("wellknown")
  if (entry.type === "wellknown") expect(entry.token).toBe("new")
})

test("remove deletes both trailing-slash and normalized keys", async () => {
  await Auth.set("https://example.com", {
    type: "wellknown",
    key: "TOKEN",
    token: "abc",
  })
  await Auth.remove("https://example.com/")
  const data = await Auth.all()
  expect(data["https://example.com"]).toBeUndefined()
  expect(data["https://example.com/"]).toBeUndefined()
})

test("set and remove are no-ops on keys without trailing slashes", async () => {
  await Auth.set("anthropic", {
    type: "api",
    key: "sk-test",
  })
  const data = await Auth.all()
  expect(data["anthropic"]).toBeDefined()
  await Auth.remove("anthropic")
  const after = await Auth.all()
  expect(after["anthropic"]).toBeUndefined()
})
import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Auth } from "../../src/auth"
import { Global } from "../../src/global"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("Auth", () => {
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
