import { test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "./fixture/fixture"
import { Instance } from "../src/project/instance"
import { Provider } from "../src/provider/provider"
import { ModelSelectionEngine } from "../src/model/selection-engine"
import { Env } from "../src/env"

test("GLM 4.7 models are correctly routed to zenmux provider when configured", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            "test-provider": {
              name: "Test Provider",
              npm: "@ai-sdk/openai-compatible",
              env: [],
              models: {
                "glm-4.7-flash": {
                  name: "GLM 4.7 Flash",
                  tool_call: true,
                  limit: { context: 128000, output: 4096 },
                },
                "glm-4.6-pro": {
                  name: "GLM 4.6 Pro", 
                  tool_call: true,
                  limit: { context: 128000, output: 4096 },
                },
                "regular-model": {
                  name: "Regular Model",
                  tool_call: true,
                  limit: { context: 8000, output: 2000 },
                },
              },
              options: {
                apiKey: "test-key",
              },
            },
            zenmux: {
              name: "OpenCode Zen",
              npm: "@ai-sdk/openai-compatible", 
              env: [],
              models: {
                "existing-zenmux-model": {
                  name: "Existing ZenMux Model",
                  tool_call: true,
                  limit: { context: 8000, output: 2000 },
                },
              },
              options: {
                apiKey: "zenmux-key",
              },
            },
          },
        }),
      )
    },
  })
  
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const providers = await Provider.list()
      
      console.log("🔍 Final provider state after routing:")
      for (const [providerID, provider] of Object.entries(providers)) {
        const glmModels = Object.keys(provider.models).filter(id => 
          id.includes('glm-4.7') || id.includes('glm-4.6')
        )
        if (glmModels.length > 0 || providerID === 'zenmux') {
          console.log(`  ${providerID}:`, Object.keys(provider.models))
        }
      }
      
      // Verify GLM models were routed to zenmux
      expect(providers["zenmux"]).toBeDefined()
      expect(providers["zenmux"].models["glm-4.7-flash"]).toBeDefined()
      expect(providers["zenmux"].models["glm-4.6-pro"]).toBeDefined()
      expect(providers["zenmux"].models["existing-zenmux-model"]).toBeDefined()
      
      // Verify GLM models were removed from original provider
      expect(providers["test-provider"]).toBeDefined()
      expect(providers["test-provider"].models["glm-4.7-flash"]).toBeUndefined()
      expect(providers["test-provider"].models["glm-4.6-pro"]).toBeUndefined()
      expect(providers["test-provider"].models["regular-model"]).toBeDefined()
      
      // Verify routed models have correct providerID
      expect(providers["zenmux"].models["glm-4.7-flash"].providerID).toBe("zenmux")
      expect(providers["zenmux"].models["glm-4.6-pro"].providerID).toBe("zenmux")
      
      console.log("✅ GLM routing test passed - models correctly routed to zenmux")
    },
  })
})

test("Selection engine prioritizes zenmux GLM models", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            "test-provider": {
              name: "Test Provider",
              npm: "@ai-sdk/openai-compatible",
              env: [],
              models: {
                "glm-4.7-flash": {
                  name: "GLM 4.7 Flash",
                  tool_call: true,
                  limit: { context: 128000, output: 4096 },
                  cost: { input: 0.01, output: 0.02 },
                },
              },
              options: {
                apiKey: "test-key",
              },
            },
            zenmux: {
              name: "OpenCode Zen",
              npm: "@ai-sdk/openai-compatible",
              env: [],
              models: {
                "glm-4.7-flash": {
                  name: "GLM 4.7 Flash",
                  tool_call: true,
                  limit: { context: 128000, output: 4096 },
                  cost: { input: 0.005, output: 0.01 }, // Lower cost
                },
                "glm-4.6-pro": {
                  name: "GLM 4.6 Pro",
                  tool_call: true,
                  limit: { context: 128000, output: 4096 },
                  cost: { input: 0.015, output: 0.03 },
                },
              },
              options: {
                apiKey: "zenmux-key",
              },
            },
          },
        }),
      )
    },
  })
  
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const selectionEngine = new ModelSelectionEngine()
      
      const criteria = {
        taskType: "general",
        qualityPreference: 50,
        reasoningRequired: false,
        estimatedTokens: 1000
      }
      
      const selectedModel = await selectionEngine.selectOptimalModel(criteria)
      
      // Should select the GLM model from zenmux provider
      expect(selectedModel).toBeDefined()
      expect(selectedModel?.id).toContain("glm-4.7")
      expect(selectedModel?.providerID).toBe("zenmux")
      
      console.log("✅ Selection engine test passed - GLM model from zenmux prioritized")
    },
  })
})