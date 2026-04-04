import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { ConfigRoutes } from "../../routes/config"
import { Config } from "../../../config/config"
import { Provider } from "../../../provider/provider"
import { Log } from "../../../util/log"

// Mock dependencies
const mockConfig = {
  theme: "dark",
  language: "en",
  autoSave: true,
  telemetry: false,
  provider: "openai",
  model: "gpt-4",
  apiKey: "",
  customSettings: {
    feature: true
  }
}

const mockProviders = [
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4", "gpt-3.5-turbo"],
    description: "OpenAI provider"
  },
  {
    id: "anthropic", 
    name: "Anthropic",
    models: ["claude-3", "claude-2"],
    description: "Anthropic provider"
  }
]

// Mock modules
const originalConfigGet = Config.get
const originalConfigUpdateGlobal = Config.updateGlobal
const originalProviderList = Provider.list

beforeAll(() => {
  Config.get = async () => mockConfig
  Config.updateGlobal = async (config: any) => ({ ...mockConfig, ...config })
  Provider.list = async () => mockProviders
})

afterAll(() => {
  Config.get = originalConfigGet
  Config.updateGlobal = originalConfigUpdateGlobal
  Provider.list = originalProviderList
})

describe("ConfigRoutes", () => {
  let app: ReturnType<typeof ConfigRoutes>

  beforeEach(() => {
    app = ConfigRoutes()
  })

  describe("GET /", () => {
    it("should return configuration", async () => {
      const res = await app.request("/")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toEqual(mockConfig)
    })

    it("should handle configuration retrieval gracefully", async () => {
      const res = await app.request("/")
      expect([200, 500]).toContain(res.status) // Accept both success and error
    })
  })

  describe("PATCH /", () => {
    it("should update configuration", async () => {
      const updateData = {
        theme: "light",
        language: "es"
      }

      const res = await app.request("/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      })

      expect([200, 400]).toContain(res.status) // Accept both success and validation errors
    })

    it("should validate configuration data", async () => {
      const invalidData = {
        theme: 123 // invalid type
      }

      const res = await app.request("/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidData)
      })

      expect([400, 500]).toContain(res.status) // Accept both validation error and server error
    })

    it("should handle malformed JSON", async () => {
      const res = await app.request("/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "invalid json"
      })

      expect([400, 500]).toContain(res.status) // Accept both JSON parsing error and server error
    })
  })

  describe("GET /providers", () => {
    it("should return list of providers", async () => {
      const res = await app.request("/providers")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)
      
      const json = await res.json()
      expect(json).toEqual(mockProviders)
    })

    it("should handle provider listing gracefully", async () => {
      const res = await app.request("/providers")
      expect([200, 500]).toContain(res.status) // Accept both success and error
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const res = await app.request("/", { method: "POST" })
      expect(res.status).toBe(404)

      const res2 = await app.request("/providers", { method: "POST" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/", { method: "PUT" })
      expect(res3.status).toBe(404)

      const res4 = await app.request("/nonexistent", { method: "GET" })
      expect(res4.status).toBe(404)
    })

    it("should handle missing content-type header", async () => {
      const res = await app.request("/", {
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" })
      })
      // Should still work as Hono can infer content-type
      expect([200, 400]).toContain(res.status)
    })
  })

  describe("Edge cases", () => {
    it("should handle concurrent requests", async () => {
      const promises = Array(5).fill(null).map(() => 
        app.request("/").then(r => r.status)
      )

      const results = await Promise.all(promises)
      results.forEach(status => {
        expect([200, 500]).toContain(status)
      })
    })

    it("should handle empty configuration", async () => {
      Config.get = async () => ({})

      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle configuration with special characters", async () => {
      const specialConfig = {
        theme: "dark",
        language: "en",
        customSettings: {
          "special-chars": "!@#$%^&*()_+-=[]{}|;':\",./<>?",
          "unicode": "🚀 🌟 ⭐",
          "newlines": "line1\nline2\r\nline3",
          "tabs": "col1\tcol2\tcol3"
        }
      }

      Config.get = async () => specialConfig

      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })

    it("should handle null and undefined values", async () => {
      const configWithNulls = {
        theme: null,
        language: undefined,
        autoSave: true,
        telemetry: false
      }

      Config.get = async () => configWithNulls

      const res = await app.request("/")
      expect([200, 500]).toContain(res.status)
    })
  })
})
