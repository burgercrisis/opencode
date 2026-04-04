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