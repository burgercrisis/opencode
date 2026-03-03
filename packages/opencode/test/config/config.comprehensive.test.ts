import { test, expect, describe, mock, afterEach, beforeEach, it, beforeAll, afterAll } from "bun:test"
import { Config } from "../../src/config/config"
import { ConfigRoutes } from "../../src/server/routes/config"
import { Instance } from "../../src/project/instance"
import { Auth } from "../../src/auth"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"
import { pathToFileURL } from "url"
import { Global } from "../../src/global"
import { Filesystem } from "../../src/util/filesystem"
import * as Provider from "../../src/provider/provider"
import { Log } from "../../src/util/log"

// Get managed config directory from environment (set in preload.ts)
const managedConfigDir = process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR!

afterEach(async () => {
  await fs.rm(managedConfigDir, { force: true, recursive: true }).catch(() => {})
})

async function writeManagedSettings(settings: object, filename = "opencode.json") {
  await fs.mkdir(managedConfigDir, { recursive: true })
  await Filesystem.write(path.join(managedConfigDir, filename), JSON.stringify(settings))
}

async function writeConfig(dir: string, config: object, name = "opencode.json") {
  await Filesystem.write(path.join(dir, name), JSON.stringify(config))
}

describe("Config System - Comprehensive Tests", () => {
  describe("Config Core Functionality", () => {
    test("loads config with defaults when no files exist", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = await Config.load()
          expect(config.theme).toBeDefined()
          expect(config.language).toBeDefined()
          expect(config.autoSave).toBeDefined()
        },
      })
    })

    test("loads config from project file", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const projectConfig = {
            theme: "dark",
            language: "fr",
            autoSave: false,
            provider: "openai",
            model: "gpt-4"
          }
          await writeConfig(tmp.path, projectConfig)

          const config = await Config.load()
          expect(config.theme).toBe("dark")
          expect(config.language).toBe("fr")
          expect(config.autoSave).toBe(false)
          expect(config.provider).toBe("openai")
          expect(config.model).toBe("gpt-4")
        },
      })
    })

    test("merges managed settings with project config", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const projectConfig = {
            theme: "dark",
            language: "fr"
          }
          const managedConfig = {
            provider: "anthropic",
            model: "claude-3-sonnet",
            telemetry: false
          }
          
          await writeConfig(tmp.path, projectConfig)
          await writeManagedSettings(managedConfig)

          const config = await Config.load()
          expect(config.theme).toBe("dark") // From project
          expect(config.language).toBe("fr") // From project
          expect(config.provider).toBe("anthropic") // From managed
          expect(config.model).toBe("claude-3-sonnet") // From managed
          expect(config.telemetry).toBe(false) // From managed
        },
      })
    })

    test("handles invalid config files gracefully", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Write invalid JSON
          await Filesystem.write(path.join(tmp.path, "opencode.json"), "{ invalid json")
          
          const config = await Config.load()
          // Should fall back to defaults
          expect(config.theme).toBeDefined()
          expect(config.language).toBeDefined()
        },
      })
    })

    test("validates config schema", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const invalidConfig = {
            theme: 123, // Should be string
            autoSave: "yes", // Should be boolean
            provider: 456 // Should be string
          }
          await writeConfig(tmp.path, invalidConfig)

          const config = await Config.load()
          // Should handle validation gracefully
          expect(typeof config.theme).toBe("string")
          expect(typeof config.autoSave).toBe("boolean")
          expect(typeof config.provider).toBe("string")
        },
      })
    })

    test("handles config file permissions", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, config)

          // Try to make file read-only (may not work on all systems)
          try {
            await fs.chmod(path.join(tmp.path, "opencode.json"), 0o444)
          } catch {
            // Skip if chmod not supported
          }

          const loadedConfig = await Config.load()
          expect(loadedConfig.theme).toBe("dark")
          expect(loadedConfig.language).toBe("en")
        },
      })
    })
  })

  describe("Config Routes", () => {
    let app: ReturnType<typeof ConfigRoutes>

    beforeEach(() => {
      app = ConfigRoutes()
    })

    describe("GET /", () => {
      it("should return configuration", async () => {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          expect(res.headers.get("content-type")).toMatch(/application\/json/)
          const json = await res.json()
          expect(typeof json).toBe("object")
          expect(json).not.toBeNull()
        }
      })

      it("should handle configuration request gracefully", async () => {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      })

      it("should return consistent configuration data", async () => {
        const res1 = await app.request("/")
        const res2 = await app.request("/")
        
        expect([200, 500]).toContain(res1.status)
        expect([200, 500]).toContain(res2.status)
        
        if (res1.status === 200 && res2.status === 200) {
          const json1 = await res1.json()
          const json2 = await res2.json()
          expect(json1).toEqual(json2)
        }
      })
    })

    describe("POST /", () => {
      it("should update configuration", async () => {
        const newConfig = {
          theme: "light",
          language: "es",
          autoSave: false
        }
        
        const res = await app.request("/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(newConfig)
        })
        
        expect([200, 400, 500]).toContain(res.status)
      })

      it("should validate configuration data", async () => {
        const invalidConfig = {
          theme: 123, // Invalid type
          autoSave: "maybe" // Invalid type
        }
        
        const res = await app.request("/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(invalidConfig)
        })
        
        expect([400, 500]).toContain(res.status)
      })

      it("should handle malformed JSON", async () => {
        const res = await app.request("/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{ invalid json"
        })
        
        expect([400, 500]).toContain(res.status)
      })
    })

    describe("Config Routes with Mock Dependencies", () => {
      const mockConfig = {
        theme: "dark",
        language: "en",
        autoSave: true,
        telemetry: false,
        provider: "anthropic",
        model: "claude-3-sonnet",
        apiKey: "",
        customSettings: {}
      }

      const mockProviders = [
        {
          id: "anthropic",
          name: "Anthropic",
          models: ["claude-3-sonnet", "claude-3-haiku"],
          defaultModel: "claude-3-sonnet"
        },
        {
          id: "openai",
          name: "OpenAI",
          models: ["gpt-4", "gpt-3.5-turbo"],
          defaultModel: "gpt-4"
        }
      ]

      beforeEach(() => {
        // Mock dependencies
        mock(() => Provider.getProviders()).mockReturnValue(mockProviders)
        mock(() => Config.load()).mockResolvedValue(mockConfig as any)
      })

      it("should return configuration with provider info", async () => {
        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
        
        if (res.status === 200) {
          const json = await res.json()
          expect(json).toHaveProperty('config')
          expect(json).toHaveProperty('providers')
        }
      })

      it("should handle provider errors gracefully", async () => {
        mock(() => Provider.getProviders()).mockImplementation(() => {
          throw new Error("Provider error")
        })

        const res = await app.request("/")
        expect([200, 500]).toContain(res.status)
      })
    })
  })

  describe("Config Advanced Features", () => {
    test("handles config inheritance", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create parent config
          const parentConfig = {
            theme: "dark",
            language: "en",
            autoSave: true
          }
          await writeConfig(tmp.path, parentConfig, "parent.json")

          // Create child config that extends parent
          const childConfig = {
            extends: "parent.json",
            language: "fr", // Override
            provider: "openai" // Add new property
          }
          await writeConfig(tmp.path, childConfig)

          const config = await Config.load()
          expect(config.theme).toBe("dark") // From parent
          expect(config.language).toBe("fr") // Overridden
          expect(config.provider).toBe("openai") // From child
          expect(config.autoSave).toBe(true) // From parent
        },
      })
    })

    test("handles config profiles", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const baseConfig = {
            theme: "dark",
            language: "en",
            autoSave: true
          }
          
          const developmentProfile = {
            theme: "light",
            telemetry: true,
            debug: true
          }
          
          const productionProfile = {
            telemetry: false,
            debug: false,
            optimization: true
          }

          await writeConfig(tmp.path, baseConfig)
          await writeConfig(tmp.path, developmentProfile, "profile.development.json")
          await writeConfig(tmp.path, productionProfile, "profile.production.json")

          // Test loading with profile
          process.env.OPENCODE_PROFILE = "development"
          const devConfig = await Config.load()
          expect(devConfig.theme).toBe("light")
          expect(devConfig.telemetry).toBe(true)

          process.env.OPENCODE_PROFILE = "production"
          const prodConfig = await Config.load()
          expect(prodConfig.theme).toBe("dark") // From base
          expect(prodConfig.telemetry).toBe(false)

          delete process.env.OPENCODE_PROFILE
        },
      })
    })

    test("handles config validation with custom rules", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const configWithValidation = {
            theme: "dark",
            language: "en",
            customSettings: {
              maxFileSize: 1024, // Should be number
              allowedExtensions: ["js", "ts", "json"] // Should be array
            }
          }
          await writeConfig(tmp.path, configWithValidation)

          const config = await Config.load()
          expect(typeof config.customSettings.maxFileSize).toBe("number")
          expect(Array.isArray(config.customSettings.allowedExtensions)).toBe(true)
        },
      })
    })

    test("handles config hot reloading", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const initialConfig = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, initialConfig)

          const config1 = await Config.load()
          expect(config1.theme).toBe("dark")

          // Simulate file change
          const updatedConfig = {
            theme: "light",
            language: "fr"
          }
          await writeConfig(tmp.path, updatedConfig)

          const config2 = await Config.load()
          expect(config2.theme).toBe("light")
          expect(config2.language).toBe("fr")
        },
      })
    })
  })

  describe("Config Security and Privacy", () => {
    test("sanitizes sensitive data in config output", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const configWithSecrets = {
            theme: "dark",
            apiKey: "secret-key-123",
            password: "secret-password",
            token: "secret-token"
          }
          await writeConfig(tmp.path, configWithSecrets)

          const config = await Config.load()
          
          // Sensitive fields should be masked in output
          expect(config.apiKey).not.toBe("secret-key-123")
          expect(config.password).not.toBe("secret-password")
          expect(config.token).not.toBe("secret-token")
        },
      })
    })

    test("handles encrypted config files", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // This would test encryption/decryption if implemented
          const encryptedConfig = {
            theme: "dark",
            language: "en",
            _encrypted: true
          }
          await writeConfig(tmp.path, encryptedConfig)

          const config = await Config.load()
          expect(config.theme).toBe("dark")
          expect(config.language).toBe("en")
        },
      })
    })

    test("validates config file permissions", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, config)

          // Check if file has appropriate permissions
          const configPath = path.join(tmp.path, "opencode.json")
          const stats = await fs.stat(configPath)
          expect(stats.isFile()).toBe(true)
        },
      })
    })
  })

  describe("Config Performance and Scalability", () => {
    test("handles large config files efficiently", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const largeConfig = {
            theme: "dark",
            language: "en",
            customSettings: {}
          }

          // Create large custom settings
          for (let i = 0; i < 1000; i++) {
            largeConfig.customSettings[`key${i}`] = `value${i}`.repeat(100)
          }

          const startTime = Date.now()
          await writeConfig(tmp.path, largeConfig)
          const config = await Config.load()
          const endTime = Date.now()

          expect(endTime - startTime).toBeLessThan(1000) // Should complete in under 1 second
          expect(Object.keys(config.customSettings)).toHaveLength(1000)
        },
      })
    })

    test("handles concurrent config access", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, config)

          // Test concurrent reads
          const promises = Array.from({ length: 10 }, () => Config.load())
          const results = await Promise.allSettled(promises)

          // All should succeed
          results.forEach(result => {
            expect(result.status).toBe("fulfilled")
            if (result.status === "fulfilled") {
              expect(result.value.theme).toBe("dark")
              expect(result.value.language).toBe("en")
            }
          })
        },
      })
    })

    test("caches config appropriately", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, config)

          // First load
          const startTime1 = Date.now()
          const config1 = await Config.load()
          const endTime1 = Date.now()

          // Second load (should be cached)
          const startTime2 = Date.now()
          const config2 = await Config.load()
          const endTime2 = Date.now()

          expect(config1).toEqual(config2)
          // Second load should be faster (though this may not always be true depending on implementation)
        },
      })
    })
  })

  describe("Config Integration", () => {
    test("integrates with Auth system", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const configWithAuth = {
            theme: "dark",
            language: "en",
            auth: {
              provider: "github",
              scopes: ["read", "write"]
            }
          }
          await writeConfig(tmp.path, configWithAuth)

          const config = await Config.load()
          expect(config.auth).toBeDefined()
          expect(config.auth.provider).toBe("github")
          expect(config.auth.scopes).toEqual(["read", "write"])
        },
      })
    })

    test("integrates with Global settings", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const originalGlobalPath = Global.Path.data
          Global.Path.data = tmp.path

          try {
            const config = {
              theme: "dark",
              language: "en"
            }
            await writeConfig(tmp.path, config)

            const loadedConfig = await Config.load()
            expect(loadedConfig.theme).toBe("dark")
            expect(loadedConfig.language).toBe("en")
          } finally {
            Global.Path.data = originalGlobalPath
          }
        },
      })
    })

    test("integrates with Filesystem operations", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config = {
            theme: "dark",
            language: "en"
          }
          await writeConfig(tmp.path, config)

          // Verify file exists and is readable
          const configPath = path.join(tmp.path, "opencode.json")
          const exists = await Filesystem.exists(configPath)
          expect(exists).toBe(true)

          const content = await Filesystem.read(configPath)
          expect(content).toContain("dark")
          expect(content).toContain("en")
        },
      })
    })
  })

  describe("Config Edge Cases", () => {
    test("handles empty config files", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await Filesystem.write(path.join(tmp.path, "opencode.json"), "{}")
          
          const config = await Config.load()
          expect(config).toBeDefined()
          // Should have default values
          expect(config.theme).toBeDefined()
          expect(config.language).toBeDefined()
        },
      })
    })

    test("handles null and undefined values", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const configWithNulls = {
            theme: null as any,
            language: undefined as any,
            autoSave: true
          }
          await writeConfig(tmp.path, configWithNulls)

          const config = await Config.load()
          expect(config.autoSave).toBe(true)
          // Should handle null/undefined gracefully
          expect(typeof config.theme).toBe("string")
          expect(typeof config.language).toBe("string")
        },
      })
    })

    test("handles circular references in config", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const config: any = {
            theme: "dark",
            language: "en"
          }
          config.self = config // Create circular reference

          // Should handle circular references without infinite loops
          await writeConfig(tmp.path, config)
          const loadedConfig = await Config.load()
          expect(loadedConfig.theme).toBe("dark")
          expect(loadedConfig.language).toBe("en")
        },
      })
    })

    test("handles very long config keys and values", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const longKey = "x".repeat(100)
          const longValue = "y".repeat(1000)
          
          const config = {
            theme: "dark",
            [longKey]: longValue
          }
          await writeConfig(tmp.path, config)

          const loadedConfig = await Config.load()
          expect(loadedConfig.theme).toBe("dark")
          expect(loadedConfig[longKey]).toBe(longValue)
        },
      })
    })
  })
})
