import { expect, test, describe } from "bun:test"
import { proxied } from "../../src/util/proxied"

describe("proxied", () => {
  test("should return true if any proxy env var is set", () => {
    const originalEnv = { ...process.env }
    
    try {
      process.env.HTTP_PROXY = "http://localhost:8080"
      expect(proxied()).toBe(true)
      
      delete process.env.HTTP_PROXY
      process.env.HTTPS_PROXY = "https://localhost:8080"
      expect(proxied()).toBe(true)
      
      delete process.env.HTTPS_PROXY
      process.env.http_proxy = "http://localhost:8080"
      expect(proxied()).toBe(true)
      
      delete process.env.http_proxy
      process.env.https_proxy = "https://localhost:8080"
      expect(proxied()).toBe(true)
    } finally {
      process.env = originalEnv
    }
  })

  test("should return false if no proxy env var is set", () => {
    const originalEnv = { ...process.env }
    
    try {
      delete process.env.HTTP_PROXY
      delete process.env.HTTPS_PROXY
      delete process.env.http_proxy
      delete process.env.https_proxy
      expect(proxied()).toBe(false)
    } finally {
      process.env = originalEnv
    }
  })
})
