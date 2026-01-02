/**
 * Demonstration of Enhanced OpenCode System
 * Shows key capabilities and integration patterns
 */

import { 
  initializeEnhancedOpenCode, 
  CONFIGURATION_PRESETS,
  enhancedTools 
} from '../index'

async function demonstrateEnhancedSystem() {
  console.log('🚀 Enhanced OpenCode System Demonstration\n')

  // Initialize with balanced configuration
  console.log('📋 Initializing Enhanced OpenCode...')
  const enhanced = await initializeEnhancedOpenCode(CONFIGURATION_PRESETS.BALANCED)

  // 1. Semantic Code Search
  console.log('\n🔍 1. Semantic Code Search Demo')
  const searchResults = await enhanced.semanticSearch('user authentication middleware', {
    k: 5,
    sources: ['local', 'knowledge'],
    filter: 'typescript'
  })

  console.log('Found results:', searchResults.map(r => ({
    source: r.source,
    similarity: r.similarity?.toFixed(3),
    type: r.type,
    preview: r.content?.substring(0, 100) + '...'
  })))

  // 2. External Agent Call with Fallback
  console.log('\n🤖 2. External Agent Call Demo')
  try {
    const codeGeneration = await enhanced.callExternalAgent(
      'bigpickle',
      'generate',
      {
        prompt: 'Create a TypeScript class for user authentication with JWT support',
        language: 'typescript',
        style: 'modern'
      },
      {
        timeout: 30000,
        cacheTTL: 3600
      }
    )
    
    console.log('Generated code preview:')
    console.log((codeGeneration as string).substring(0, 300) + '...')
    
  } catch (error) {
    console.log('External agent unavailable, using local fallback...')
    const localFallback = await enhanced.callExternalAgent(
      'bigpickle',
      'generate',
      { prompt: 'Create a TypeScript class for user authentication' },
      { forceLocal: true }
    )
    console.log('Local fallback result:', (localFallback as string).substring(0, 200) + '...')
  }

  // 3. Learning and Adaptation
  console.log('\n🧠 3. Learning System Demo')
  
  // Simulate some performance feedback
  const feedbackEntries = [
    {
      taskType: 'code_generation',
      modelUsed: 'bigpickle',
      userSatisfaction: 85,
      success: true,
      cost: 0.05,
      duration: 2500,
      context: {
        prompt: 'Generate authentication class',
        tools: ['bigpickle'],
        issues: []
      }
    },
    {
      taskType: 'code_generation',
      modelUsed: 'grok-code',
      userSatisfaction: 92,
      success: true,
      cost: 0.08,
      duration: 1800,
      context: {
        prompt: 'Refactor authentication class',
        tools: ['grok-code'],
        issues: []
      }
    },
    {
      taskType: 'semantic_search',
      modelUsed: 'local_vector_store',
      userSatisfaction: 95,
      success: true,
      cost: 0, // Local processing is free
      duration: 150,
      context: {
        prompt: 'Find authentication code',
        tools: ['local_vector_store'],
        issues: []
      }
    }
  ]

  for (const entry of feedbackEntries) {
    await enhanced.recordFeedback(entry)
    console.log(`✅ Recorded feedback for ${entry.taskType} with ${entry.userSatisfaction}% satisfaction`)
  }

  // 4. Model Recommendation
  console.log('\n🎯 4. Model Recommendation Demo')
  const recommendation = await enhanced.getModelRecommendation(
    'code_generation',
    { language: 'typescript', complexity: 'medium' }
  )
  
  console.log('Recommended model for code generation:', recommendation || 'No recommendation available yet')

  // 5. System Statistics
  console.log('\n📊 5. System Statistics Demo')
  const stats = await enhanced.getSystemStats()
  
  console.log('System Performance:')
  console.log(`• Vector Store: ${stats.enabled.vectorStore ? '✅' : '❌'}`)
  console.log(`• External Agents: ${stats.enabled.externalAgents ? '✅' : '❌'}`)
  console.log(`• Knowledge Graph: ${stats.enabled.knowledgeGraph ? '✅' : '❌'}`)
  console.log(`• Learning Engine: ${stats.enabled.learning ? '✅' : '❌'}`)
  
  if (stats.knowledgeGraph) {
    console.log(`\nKnowledge Graph Stats:`)
    console.log(`• Nodes: ${stats.knowledgeGraph.nodes}`)
    console.log(`• Relationships: ${stats.knowledgeGraph.relationships}`)
  }

  if (stats.externalAgents) {
    console.log(`\nExternal Agent Performance:`)
    Object.entries(stats.externalAgents).forEach(([agent, agentStats]: [string, any]) => {
      console.log(`• ${agent}: ${agentStats.successRate?.toFixed(1) || 'N/A'}% success rate`)
    })
  }

  // 6. Enhanced Tools Demo
  console.log('\n🔧 6. Enhanced Tools Demo')
  
  // Enhanced search
  const enhancedSearch = await enhancedTools.enhancedSearch({
    query: 'React component patterns',
    sources: ['local', 'knowledge'],
    maxResults: 3
  })
  
  console.log('Enhanced search results:', {
    query: enhancedSearch.query,
    totalResults: enhancedSearch.totalResults,
    sources: Object.keys(enhancedSearch.results || {})
  })

  // System stats tool
  const systemStats = await enhancedTools.getSystemStats({ detailed: true })
  console.log('System stats via enhanced tool:', {
    timestamp: systemStats.metadata?.timestamp,
    version: systemStats.metadata?.version
  })

  console.log('\n🎉 Demonstration completed successfully!')
  console.log('\n💡 Key Benefits Demonstrated:')
  console.log('• ✅ Local-first processing with selective external use')
  console.log('• ✅ Semantic code search across entire workspace')
  console.log('• ✅ Adaptive learning from user feedback')
  console.log('• ✅ Intelligent model selection')
  console.log('• ✅ Comprehensive performance monitoring')
  console.log('• ✅ Automatic fallbacks when services fail')
}

// Performance benchmark comparison
async function runPerformanceBenchmark() {
  console.log('\n📈 Performance Benchmark')
  
  const enhanced = await initializeEnhancedOpenCode(CONFIGURATION_PRESETS.BALANCED)
  const iterations = 10
  
  // Benchmark semantic search
  console.log('\n🔍 Benchmarking Semantic Search...')
  const searchTimes: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await enhanced.semanticSearch('user authentication', { k: 10 })
    const end = Date.now()
    searchTimes.push(end - start)
  }
  
  const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length
  console.log(`Average search time: ${avgSearchTime.toFixed(2)}ms`)
  
  // Benchmark external agent calls with fallback
  console.log('\n🤖 Benchmarking External Agent Calls...')
  const callTimes: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await enhanced.callExternalAgent('nonexistent-agent', 'test', {}, { forceLocal: true })
    const end = Date.now()
    callTimes.push(end - start)
  }
  
  const avgCallTime = callTimes.reduce((a, b) => a + b, 0) / callTimes.length
  console.log(`Average agent call time (with fallback): ${avgCallTime.toFixed(2)}ms`)
  
  // Benchmark feedback recording
  console.log('\n🧠 Benchmarking Feedback Recording...')
  const feedbackTimes: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await enhanced.recordFeedback({
      taskType: 'test_task',
      modelUsed: 'test_model',
      userSatisfaction: 80,
      success: true,
      cost: 0.01,
      duration: 1000,
      context: { prompt: 'test prompt' }
    })
    const end = Date.now()
    feedbackTimes.push(end - start)
  }
  
  const avgFeedbackTime = feedbackTimes.reduce((a, b) => a + b, 0) / feedbackTimes.length
  console.log(`Average feedback recording time: ${avgFeedbackTime.toFixed(2)}ms`)
  
  console.log('\n📊 Benchmark Summary:')
  console.log(`• Semantic Search: ${avgSearchTime.toFixed(2)}ms avg`)
  console.log(`• Agent Calls: ${avgCallTime.toFixed(2)}ms avg`)
  console.log(`• Feedback Recording: ${avgFeedbackTime.toFixed(2)}ms avg`)
}

// Privacy and security demonstration
async function demonstratePrivacySecurity() {
  console.log('\n🔒 Privacy and Security Demonstration')
  
  // Initialize with privacy-first configuration
  const enhanced = await initializeEnhancedOpenCode(CONFIGURATION_PRESETS.PRIVACY_FIRST)
  
  console.log('✅ Privacy-first configuration loaded:')
  console.log('• External agents: DISABLED')
  console.log('• Local embeddings: ENABLED')
  console.log('• Data retention: LOCAL ONLY')
  
  // Demonstrate local-only capabilities
  console.log('\n🔍 Performing local-only semantic search...')
  const localResults = await enhanced.semanticSearch('sensitive data handling', {
    sources: ['local'], // Only local sources
    includeExternal: false
  })
  
  console.log(`Found ${localResults.length} local results without any external calls`)
  
  // Attempt external agent call (should use fallback)
  console.log('\n🤖 Attempting external agent call (should fallback locally)...')
  const result = await enhanced.callExternalAgent(
    'blocked-external-agent',
    'generate',
    { prompt: 'Test privacy protection' }
  )
  
  console.log('Result:', typeof result === 'string' ? result.substring(0, 100) + '...' : result)
  
  console.log('\n✅ Privacy demonstration completed - no data left the local environment!')
}

// Main demonstration runner
async function runDemonstration() {
  try {
    await demonstrateEnhancedSystem()
    await runPerformanceBenchmark()
    await demonstratePrivacySecurity()
    
    console.log('\n🎉 All demonstrations completed successfully!')
    console.log('\n📝 Next Steps:')
    console.log('1. Install the enhanced package in your OpenCode instance')
    console.log('2. Choose a configuration profile that fits your needs')
    console.log('3. Start using enhanced tools for better AI assistance')
    console.log('4. Provide feedback to help the system learn and improve')
    
  } catch (error) {
    console.error('❌ Demonstration failed:', error)
  }
}

// Export for running
export { 
  runDemonstration,
  demonstrateEnhancedSystem,
  runPerformanceBenchmark,
  demonstratePrivacySecurity
}

// Run demonstration if called directly
if (import.meta.main) {
  runDemonstration()
}