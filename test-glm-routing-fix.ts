#!/usr/bin/env bun

import { Provider } from './packages/opencode/src/provider/provider'
import { ModelSelectionEngine } from './packages/opencode/src/model/selection-engine'

console.log('🧪 Testing GLM 4.7 Provider Routing Fixes\n')

async function testGLMRouting() {
  try {
    console.log('1. Testing Provider Configuration Override...')
    
    // Get all providers and check for GLM models
    const providers = await Provider.list()
    
    console.log('\n📊 Provider Analysis:')
    let totalGLMModels = 0
    let zenmuxGLMModels = 0
    
    for (const [providerID, provider] of Object.entries(providers)) {
      if (!provider) continue
      
      const glmModels = Object.keys(provider.models).filter(id => 
        id.includes('glm-4.7') || id.includes('glm-4.6')
      )
      
      if (glmModels.length > 0) {
        console.log(`  ${providerID}: ${glmModels.length} GLM models`)
        totalGLMModels += glmModels.length
        
        if (providerID === 'zenmux') {
          zenmuxGLMModels = glmModels.length
          console.log(`    ✅ Routed to zenmux: ${glmModels.join(', ')}`)
        } else {
          console.log(`    ❌ Still in ${providerID}: ${glmModels.join(', ')}`)
        }
      }
    }
    
    console.log(`\n📈 Summary: ${zenmuxGLMModels}/${totalGLMModels} GLM models routed to zenmux`)
    
    console.log('\n2. Testing Selection Engine Enhancement...')
    
    // Test model selection with GLM models
    const selectionEngine = new ModelSelectionEngine()
    
    const criteria = {
      taskType: 'general',
      qualityPreference: 50,
      reasoningRequired: false,
      estimatedTokens: 1000
    }
    
    const selectedModel = await selectionEngine.selectOptimalModel(criteria)
    
    if (selectedModel) {
      console.log(`\n🎯 Selected model: ${selectedModel.providerID}/${selectedModel.id}`)
      
      if (selectedModel.id.includes('glm-4.7') || selectedModel.id.includes('glm-4.6')) {
        if (selectedModel.providerID === 'zenmux') {
          console.log('✅ GLM model correctly prioritized for zenmux provider')
        } else {
          console.log('⚠️  GLM model selected but not from zenmux provider')
        }
      } else {
        console.log('ℹ️  Non-GLM model selected (this is expected if no GLM models are optimal)')
      }
    } else {
      console.log('❌ No model selected')
    }
    
    console.log('\n3. Testing Specific GLM Model Availability...')
    
    // Check for specific GLM models
    const glmModelPatterns = ['glm-4.7', 'glm-4.6']
    
    for (const pattern of glmModelPatterns) {
      const matchingModels: Array<{ providerID: string; id: string }> = []
      
      for (const [providerID, provider] of Object.entries(providers)) {
        if (!provider) continue
        
        for (const [modelID, model] of Object.entries(provider.models)) {
          if (modelID.includes(pattern)) {
            matchingModels.push({ providerID, id: modelID })
          }
        }
      }
      
      console.log(`\n${pattern} models found: ${matchingModels.length}`)
      matchingModels.forEach(model => {
        console.log(`  - ${model.providerID}/${model.id}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testGLMRouting().then(() => {
  console.log('\n🏁 GLM routing test completed')
}).catch(error => {
  console.error('💥 Test error:', error)
  process.exit(1)
})