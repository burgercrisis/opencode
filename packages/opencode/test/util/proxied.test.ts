import { expect, test, describe } from "bun:test"
import { proxied } from "../../src/util/proxied"

describe("util.proxied", () => {
  test("proxied should detect proxy environment variables", () => {
    const original = { ...process.env }
    
    try {
      delete process.env.HTTP_PROXY
      delete process.env.HTTPS_PROXY
      delete process.env.http_proxy
      delete process.env.https_proxy
      expect(proxied()).toBe(false)
      
      process.env.HTTP_PROXY = "http://localhost:8080"
      expect(proxied()).toBe(true)
      
      delete process.env.HTTP_PROXY
      process.env.https_proxy = "http://localhost:8080"
      expect(proxied()).toBe(true)
    } finally {
      process.env = original
    }
  })
})
