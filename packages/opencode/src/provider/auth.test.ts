import { describe, it, expect } from "bun:test"
import { ProviderAuth } from "./auth"

// Note: Bun doesn't support module mocking like Jest. Tests requiring module mocking 
// (methods, authorize, callback, api) are skipped.

describe("ProviderAuth", () => {
  describe("Method schema validation", () => {
    it("should validate oauth method type", () => {
      const method = {
        type: "oauth" as const,
        label: "Test OAuth"
      }
      expect(() => ProviderAuth.Method.parse(method)).not.toThrow()
      expect(ProviderAuth.Method.parse(method)).toEqual(method)
    })

    it("should validate api method type", () => {
      const method = {
        type: "api" as const,
        label: "Test API"
      }
      expect(() => ProviderAuth.Method.parse(method)).not.toThrow()
      expect(ProviderAuth.Method.parse(method)).toEqual(method)
    })

    it("should reject invalid method type", () => {
      const method = {
        type: "invalid" as const,
        label: "Test"
      }
      expect(() => ProviderAuth.Method.parse(method)).toThrow()
    })

    it("should accept empty label", () => {
      const method = {
        type: "oauth" as const,
        label: ""
      }
      expect(() => ProviderAuth.Method.parse(method)).not.toThrow()
      expect(ProviderAuth.Method.parse(method)).toEqual(method)
    })
  })

  describe("Authorization schema validation", () => {
    it("should validate authorization with auto method", () => {
      const auth = {
        url: "https://example.com/auth",
        method: "auto" as const,
        instructions: "Click to authorize"
      }
      expect(() => ProviderAuth.Authorization.parse(auth)).not.toThrow()
      expect(ProviderAuth.Authorization.parse(auth)).toEqual(auth)
    })

    it("should validate authorization with code method", () => {
      const auth = {
        url: "https://example.com/auth",
        method: "code" as const,
        instructions: "Enter code"
      }
      expect(() => ProviderAuth.Authorization.parse(auth)).not.toThrow()
      expect(ProviderAuth.Authorization.parse(auth)).toEqual(auth)
    })

    it("should reject invalid method", () => {
      const auth = {
        url: "https://example.com/auth",
        method: "invalid" as const,
        instructions: "Test"
      }
      expect(() => ProviderAuth.Authorization.parse(auth)).toThrow()
    })
  })

  describe("Error classes", () => {
    it("should create OauthMissing error with providerID", () => {
      const error = new ProviderAuth.OauthMissing({ providerID: "test-provider" })
      expect(error.name).toBe("ProviderAuthOauthMissing")
      expect(error.data.providerID).toBe("test-provider")
    })

    it("should create OauthCodeMissing error with providerID", () => {
      const error = new ProviderAuth.OauthCodeMissing({ providerID: "test-provider" })
      expect(error.name).toBe("ProviderAuthOauthCodeMissing")
      expect(error.data.providerID).toBe("test-provider")
    })

    it("should create OauthCallbackFailed error", () => {
      const error = new ProviderAuth.OauthCallbackFailed({})
      expect(error.name).toBe("ProviderAuthOauthCallbackFailed")
      expect(error.data).toEqual({})
    })
  })
})
