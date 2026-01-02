/**
 * Enhanced OpenCode Package Entry Point
 * Provides enhanced capabilities while maintaining locality
 */

export { CodeEmbeddingEngine, LocalVectorStore, type CodeMetadata, type CodeMatch } from './knowledge/local-vector-store'
export { 
  ResilientExternalAgent, 
  AgentRegistry, 
  CircuitBreaker,
  MetricsCollector,
  type AgentRequest,
  type AgentResponse,
  type ExternalAgentConfig,
  DEFAULT_AGENT_CONFIGS
} from './agents/external-agent-framework'
export { 
  LocalKnowledgeGraph, 
  AdaptiveLearningEngine, 
  IncrementalKnowledgeManager,
  type KnowledgeNode,
  type Relationship,
  type LearningProfile,
  type PerformanceEntry
} from './knowledge/enhanced-knowledge-graph'
export { 
  EnhancedOpenCode, 
  getEnhancedOpenCode, 
  initializeEnhancedOpenCode,
  type EnhancedConfig 
} from './enhanced/integration-layer'
export { 
  enhancedTools,
  enhancedToolNames,
  type EnhancedToolDefinitions
} from './enhanced/enhanced-tools'

// Main initialization function
export async function initializeEnhancedSystem(config?: Partial<EnhancedConfig>) {
  const { initializeEnhancedOpenCode } = await import('./enhanced/integration-layer')
  return await initializeEnhancedOpenCode(config)
}

// Convenience exports
export * from './knowledge/local-vector-store'
export * from './agents/external-agent-framework'
export * from './knowledge/enhanced-knowledge-graph'
export * from './enhanced/integration-layer'
export * from './enhanced/enhanced-tools'

// Default configuration presets
export const CONFIGURATION_PRESETS = {
  // Privacy-focused configuration (maximal locality)
  PRIVACY_FIRST: {
    vectorStore: {
      enabled: true,
      indexing: { autoIndex: true }
    },
    externalAgents: {
      enabled: false, // No external agents
      costLimits: { perHour: 0, perDay: 0 }
    },
    knowledgeGraph: {
      enabled: true,
      compressionThreshold: 0.7
    },
    learning: {
      enabled: true,
      adaptationRate: 0.5
    }
  },

  // Balanced configuration (local first with selective external use)
  BALANCED: {
    vectorStore: {
      enabled: true,
      indexing: { autoIndex: true }
    },
    externalAgents: {
      enabled: true,
      defaultTimeout: 30000,
      costLimits: { perHour: 10.0, perDay: 50.0 }
    },
    knowledgeGraph: {
      enabled: true,
      compressionThreshold: 0.8
    },
    learning: {
      enabled: true,
      adaptationRate: 0.3
    }
  },

  // Performance-focused configuration (aggressive external use)
  PERFORMANCE_FOCUSED: {
    vectorStore: {
      enabled: true,
      indexing: { autoIndex: true }
    },
    externalAgents: {
      enabled: true,
      defaultTimeout: 60000,
      costLimits: { perHour: 50.0, perDay: 200.0 }
    },
    knowledgeGraph: {
      enabled: true,
      compressionThreshold: 0.9
    },
    learning: {
      enabled: true,
      adaptationRate: 0.2
    }
  },

  // Development configuration (full features with generous limits)
  DEVELOPMENT: {
    vectorStore: {
      enabled: true,
      indexing: { autoIndex: true }
    },
    externalAgents: {
      enabled: true,
      defaultTimeout: 120000,
      costLimits: { perHour: 100.0, perDay: 500.0 }
    },
    knowledgeGraph: {
      enabled: true,
      maxNodes: 50000,
      compressionThreshold: 1.0
    },
    learning: {
      enabled: true,
      adaptationRate: 0.1,
      performanceWindow: 1000
    }
  }
}

// Quick setup functions
export async function setupPrivacyFirst() {
  return await initializeEnhancedSystem(CONFIGURATION_PRESETS.PRIVACY_FIRST)
}

export async function setupBalanced() {
  return await initializeEnhancedSystem(CONFIGURATION_PRESETS.BALANCED)
}

export async function setupPerformanceFocused() {
  return await initializeEnhancedSystem(CONFIGURATION_PRESETS.PERFORMANCE_FOCUSED)
}

export async function setupDevelopment() {
  return await initializeEnhancedSystem(CONFIGURATION_PRESETS.DEVELOPMENT)
}

// Type definitions for enhanced tools
export interface EnhancedToolDefinitions {
  enhancedRead: typeof import('./enhanced/enhanced-tools').enhancedRead
  enhancedSearch: typeof import('./enhanced/enhanced-tools').enhancedSearch
  callExternalAgent: typeof import('./enhanced/enhanced-tools').callExternalAgent
  recordFeedback: typeof import('./enhanced/enhanced-tools').recordFeedback
  getModelRecommendation: typeof import('./enhanced/enhanced-tools').getModelRecommendation
  getSystemStats: typeof import('./enhanced/enhanced-tools').getSystemStats
  queryKnowledgeGraph: typeof import('./enhanced/enhanced-tools').queryKnowledgeGraph
}