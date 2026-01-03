#!/usr/bin/env bun

import { Provider } from "./packages/opencode/src/provider/provider"
import { ModelSelectionEngine } from "./packages/opencode/src/model/selection-engine"

async function testGLMRouting() {
  console.log("🔍 Testing GLM 4.7 Provider Routing Issue\n")

  try {
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
    console.log("\n🎯 Testing Model Selection Engine:")
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

  } catch (error) {
    console.error("❌ Error testing GLM routing:", error)
  }
}

testGLMRouting()