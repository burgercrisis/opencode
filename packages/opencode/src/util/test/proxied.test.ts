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

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { proxied } from "../proxied"

describe("proxied", () => {
  const originalEnv = { ...process.env }
  
  beforeEach(() => {
    // Clear proxy env vars
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
  })
  
  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
  })
  
  it("should return false when no proxy env vars are set", () => {
    expect(proxied()).toBe(false)
  })
  
  it("should return true when HTTP_PROXY is set", () => {
    process.env.HTTP_PROXY = "http://proxy.example.com:8080"
    expect(proxied()).toBe(true)
  })
  
  it("should return true when HTTPS_PROXY is set", () => {
    process.env.HTTPS_PROXY = "https://proxy.example.com:8080"
    expect(proxied()).toBe(true)
  })
  
  it("should return true when http_proxy is set (lowercase)", () => {
    process.env.http_proxy = "http://proxy.example.com:8080"
    expect(proxied()).toBe(true)
  })
  
  it("should return true when https_proxy is set (lowercase)", () => {
    process.env.https_proxy = "https://proxy.example.com:8080"
    expect(proxied()).toBe(true)
  })
  
  it("should return true when multiple proxy env vars are set", () => {
    process.env.HTTP_PROXY = "http://proxy.example.com:8080"
    process.env.HTTPS_PROXY = "https://proxy.example.com:8080"
    expect(proxied()).toBe(true)
  })
  
  it("should return false when proxy env var is empty string", () => {
    process.env.HTTP_PROXY = ""
    expect(proxied()).toBe(false)
  })
})