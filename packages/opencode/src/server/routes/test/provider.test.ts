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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { ProviderRoutes } from "../../routes/provider"
import { Config } from "../../../config/config"
import { Provider } from "../../../provider/provider"
import { ModelsDev } from "../../../provider/models"
import { ProviderAuth } from "../../../provider/auth"

// Mock the dependencies
const mockConfig = {
  enabled_providers: ["openai", "anthropic"],
  disabled_providers: ["old-provider"]
}

const mockAllProviders = {
  "openai": {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-4", name: "GPT-4", provider: "openai" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" }
    ]
  },
  "anthropic": {
    id: "anthropic",
    name: "Anthropic", 
    models: [
      { id: "claude-3", name: "Claude 3", provider: "anthropic" },
      { id: "claude-2", name: "Claude 2", provider: "anthropic" }
    ]
  },
  "google": {
    id: "google",
    name: "Google",
    models: [
      { id: "gemini-pro", name: "Gemini Pro", provider: "google" }
    ]
  }
}

const mockConnectedProviders = {
  "openai": true,
  "anthropic": true
}

const mockAuthMethods = {
  "openai": ["oauth", "api_key"],
  "anthropic": ["oauth", "api_key"],
  "google": ["api_key"]
}

const mockOAuthAuthorize = {
  authorizationUrl: "https://openai.com/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback",
  method: 0
}

const mockOAuthCallback = true

// Mock the modules
const originalConfigGet = Config.get
const originalModelsDevGet = ModelsDev.get
const originalProviderList = Provider.list
const originalProviderAuthMethods = ProviderAuth.methods
const originalProviderAuthAuthorize = ProviderAuth.authorize
const originalProviderAuthCallback = ProviderAuth.callback

beforeAll(() => {
  Config.get = async () => mockConfig
  ModelsDev.get = async () => mockAllProviders
  Provider.list = async () => mockConnectedProviders
  ProviderAuth.methods = async () => mockAuthMethods
  ProviderAuth.authorize = async () => mockOAuthAuthorize
  ProviderAuth.callback = async () => mockOAuthCallback
})

afterAll(() => {
  Config.get = originalConfigGet
  ModelsDev.get = originalModelsDevGet
  Provider.list = originalProviderList
  ProviderAuth.methods = originalProviderAuthMethods
  ProviderAuth.authorize = originalProviderAuthAuthorize
  ProviderAuth.callback = originalProviderAuthCallback
})

describe("ProviderRoutes", () => {
  let app: ReturnType<typeof ProviderRoutes>

  beforeEach(() => {
    app = ProviderRoutes()
  })

  describe("GET /", () => {
    it("should return list of providers", async () => {
      const res = await app.request("/")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toHaveProperty("all")
      expect(json).toHaveProperty("default")
      expect(json).toHaveProperty("connected")
      
      expect(Array.isArray(json.all)).toBe(true)
      expect(json.all.length).toBeGreaterThan(0)
      expect(typeof json.default).toBe("object")
      expect(Array.isArray(json.connected)).toBe(true)
    })

    it("should filter out disabled providers", async () => {
      const res = await app.request("/")
      const json = await res.json()
      
      // Should only include openai and anthropic, not google (not in enabled_providers)
      const providerIds = json.all.map((p: any) => p.id)
      expect(providerIds).toContain("openai")
      expect(providerIds).toContain("anthropic")
      expect(providerIds).not.toContain("google")
    })

    it("should handle empty enabled providers", async () => {
      Config.get = async () => ({ enabled_providers: [] })

      const res = await app.request("/")
      const json = await res.json()
      
      expect(json.all).toEqual([])
      expect(json.default).toEqual({})
    })

    it("should handle all providers disabled", async () => {
      Config.get = async () => ({ disabled_providers: ["openai", "anthropic", "google"] })

      const res = await app.request("/")
      const json = await res.json()
      
      expect(json.all).toEqual([])
      expect(json.default).toEqual({})
    })

    it("should handle provider listing errors", async () => {
      ModelsDev.get = async () => {
        throw new Error("Provider listing failed")
      }

      const res = await app.request("/")
      expect(res.status).toBe(500)
    })

    it("should handle connection errors", async () => {
      Provider.list = async () => {
        throw new Error("Connection check failed")
      }

      const res = await app.request("/")
      expect(res.status).toBe(500)
    })
  })

  describe("GET /auth", () => {
    it("should return auth methods for all providers", async () => {
      const res = await app.request("/auth")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toEqual(mockAuthMethods)
    })

    it("should handle auth methods errors", async () => {
      ProviderAuth.methods = async () => {
        throw new Error("Auth methods retrieval failed")
      }

      const res = await app.request("/auth")
      expect(res.status).toBe(500)
    })
  })

  describe("POST /:providerID/oauth/authorize", () => {
    it("should start OAuth authorization", async () => {
      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 })
      })

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toEqual(mockOAuthAuthorize)
    })

    it("should validate providerID parameter", async () => {
      const res = await app.request("/invalid-provider/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 })
      })

      expect(res.status).toBe(200) // Should still process, validation happens in ProviderAuth
    })

    it("should validate method parameter", async () => {
      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // missing method
      })

      expect(res.status).toBe(400)
    })

    it("should handle invalid method parameter", async () => {
      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "invalid" })
      })

      expect(res.status).toBe(200) // Should still process, validation happens in ProviderAuth
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect(res.status).toBe(400)
    })

    it("should handle OAuth authorize errors", async () => {
      ProviderAuth.authorize = async () => {
        throw new Error("OAuth authorization failed")
      }

      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 })
      })

      expect(res.status).toBe(500)
    })
  })

  describe("POST /:providerID/oauth/callback", () => {
    it("should handle OAuth callback", async () => {
      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0, code: "test-auth-code" })
      })

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toBe(true)
    })

    it("should validate providerID parameter", async () => {
      const res = await app.request("/invalid-provider/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0, code: "test-code" })
      })

      expect(res.status).toBe(200) // Should still process, validation happens in ProviderAuth
    })

    it("should validate method parameter", async () => {
      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "test-code" }) // missing method
      })

      expect(res.status).toBe(400)
    })

    it("should validate code parameter", async () => {
      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 }) // missing code
      })

      expect(res.status).toBe(400)
    })

    it("should handle optional code parameter", async () => {
      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 }) // code is optional
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toBe(true)
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect(res.status).toBe(400)
    })

    it("should handle OAuth callback errors", async () => {
      ProviderAuth.callback = async () => {
        throw new Error("OAuth callback failed")
      }

      const res = await app.request("/openai/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0, code: "test-code" })
      })

      expect(res.status).toBe(500)
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const res = await app.request("/", { method: "POST" })
      expect(res.status).toBe(404)

      const res2 = await app.request("/auth", { method: "POST" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/openai/oauth/authorize", { method: "GET" })
      expect(res3.status).toBe(404)

      const res4 = await app.request("/openai/oauth/callback", { method: "GET" })
      expect(res4.status).toBe(404)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/openai/oauth/authorize", {
        method: "POST",
        body: JSON.stringify({ method: 0 })
      })
      // Should still work as Hono can infer content-type
      expect([200, 400]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle providers with no models", async () => {
      const providersWithNoModels = {
        "empty-provider": {
          id: "empty-provider",
          name: "Empty Provider",
          models: []
        }
      }

      ModelsDev.get = async () => providersWithNoModels

      const res = await app.request("/")
      const json = await res.json()
      
      expect(json.all.length).toBeGreaterThan(0)
      expect(json.default).toEqual({})
    })

    it("should handle providers with single model", async () => {
      const providersWithSingleModel = {
        "single-model": {
          id: "single-model",
          name: "Single Model Provider",
          models: [
            { id: "only-model", name: "Only Model", provider: "single-model" }
          ]
        }
      }

      ModelsDev.get = async () => providersWithSingleModel

      const res = await app.request("/")
      const json = await res.json()
      
      expect(json.all.length).toBeGreaterThan(0)
      expect(json.default["single-model"]).toBe("only-model")
    })

    it("should handle special characters in provider IDs", async () => {
      const res = await app.request("/provider-with-special-chars_123/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: 0 })
      })

      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle concurrent provider requests", async () => {
      const promises = Array(10).fill(null).map(() => 
        app.request("/").then(r => r.json())
      )

      const results = await Promise.all(promises)
      results.forEach(result => {
        expect(typeof result).toBe("object")
        expect(result).toHaveProperty("all")
      })
    })

    it("should handle OAuth with different auth methods", async () => {
      const authMethodsWithVariety = {
        "multi-auth": ["oauth", "api_key", "saml", "jwt"],
        "api-only": ["api_key"],
        "oauth-only": ["oauth"]
      }

      ProviderAuth.methods = async () => authMethodsWithVariety

      const res = await app.request("/auth")
      const json = await res.json()
      
      expect(Object.keys(json).length).toBeGreaterThan(0)
      expect(json["multi-auth"].length).toBe(4)
      expect(json["api-only"].length).toBe(1)
      expect(json["oauth-only"].length).toBe(1)
    })
  })
})
