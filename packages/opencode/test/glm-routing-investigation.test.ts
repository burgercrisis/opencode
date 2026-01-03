import { test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "./fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ModelSelectionEngine } from "../../src/model/selection-engine"
import { Env } from "../../src/env"

test("GLM 4.7 provider routing investigation", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      console.log("🔍 Investigating GLM 4.7 Provider Routing Issue\n")

      // Get all providers
      const providers = await Provider.list()
      console.log("📋 Available Providers:")
      for (const [providerID, provider] of Object.entries(providers)) {
        console.log(`  - ${providerID}: ${Object.keys(provider.models).length} models`)
      }

      // Look for GLM models specifically
      console.log("\n🤖 Looking for GLM Models:")
      const glmModels: any[] = []
      
      for (const [providerID, provider] of Object.entries(providers)) {
        for (const [modelID, model] of Object.entries(provider.models)) {
          if (modelID.toLowerCase().includes('glm') || model.id.toLowerCase().includes('glm')) {
            glmModels.push({
              providerID,
              modelID,
              model: model
            })
            console.log(`  Found: ${providerID}/${modelID}`)
            console.log(`    - API ID: ${model.api.id}`)
            console.log(`    - API URL: ${model.api.url}`)
            console.log(`    - API NPM: ${model.api.npm}`)
            console.log(`    - Status: ${model.status}`)
            console.log("")
          }
        }
      }

      if (glmModels.length === 0) {
        console.log("  ❌ No GLM models found in any provider")
      }

      // Test model selection engine with GLM criteria
      console.log("🎯 Testing Model Selection Engine:")
      const selectionEngine = new ModelSelectionEngine()
      
      const testCriteria = {
        taskType: "general",
        qualityPreference: 50,
        reasoningRequired: false,
        estimatedTokens: 1000
      }

      const selected = await selectionEngine.selectOptimalModel(testCriteria)
      if (selected) {
        console.log(`Selected Model: ${selected.providerID}/${selected.id}`)
        console.log(`Score: ${selected.score}`)
        console.log(`Quality: ${selected.quality}`)
        console.log(`Cost: ${selected.estimatedCost}`)
      }

      // Check if any GLM models were considered
      console.log("\n🔍 GLM Models in Selection Process:")
      const availableModels = await selectionEngine['getAvailableModels']()
      const glmInSelection = availableModels.filter(m => 
        m.id.toLowerCase().includes('glm') || m.providerID.toLowerCase().includes('glm')
      )
      
      if (glmInSelection.length > 0) {
        console.log("GLM models found in selection pool:")
        glmInSelection.forEach(model => {
          console.log(`  - ${model.providerID}/${model.id}`)
          console.log(`    Status: ${model.status}`)
          console.log(`    Cost: ${model.cost?.input}/${model.cost?.output}`)
        })
      } else {
        console.log("❌ No GLM models found in selection pool")
      }

      // Test GLM model selection specifically
      console.log("\n🎯 Testing GLM-specific Selection:")
      const glmCriteria = {
        taskType: "general",
        qualityPreference: 50,
        reasoningRequired: false,
        estimatedTokens: 1000,
        allowedModels: glmModels.map(m => `${m.providerID}/${m.modelID}`)
      }

      const glmSelected = await selectionEngine.selectOptimalModel(glmCriteria)
      if (glmSelected) {
        console.log(`GLM Selected Model: ${glmSelected.providerID}/${glmSelected.id}`)
        console.log(`Expected: opencode-zen or similar, Actual: ${glmSelected.providerID}`)
      } else {
        console.log("❌ No GLM model selected with GLM-only criteria")
      }

      // Verify our findings
      const hasOpenCodeZenProvider = Object.keys(providers).some(id => 
        id.toLowerCase().includes('opencode') && id.toLowerCase().includes('zen')
      )
      console.log(`\n📊 Summary:`)
      console.log(`- OpenCode Zen provider found: ${hasOpenCodeZenProvider}`)
      console.log(`- Total GLM models found: ${glmModels.length}`)
      console.log(`- GLM models in selection pool: ${glmInSelection.length}`)
      
      if (glmModels.length > 0) {
        const glmProviderIDs = [...new Set(glmModels.map(m => m.providerID))]
        console.log(`- GLM provider IDs: ${glmProviderIDs.join(', ')}`)
      }

      // Test expectations
      expect(glmModels.length).toBeGreaterThan(0) // Should find GLM models
      expect(glmInSelection.length).toBeGreaterThan(0) // GLM models should be in selection pool
    },
  })
})