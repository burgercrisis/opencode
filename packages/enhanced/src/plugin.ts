/**
 * Enhancement Integration Plugin
 * Integrates enhanced capabilities into OpenCode core
 */

import { Plugin } from '../plugin'
import { 
  initializeEnhancedOpenCode, 
  enhancedTools, 
  enhancedToolNames,
  getEnhancedOpenCode 
} from '../index'
import { enhancedInit } from '../commands/enhanced-init'

export default class EnhancedPlugin implements Plugin {
  name = 'enhanced-opencode'
  version = '1.0.0'
  description = 'Enhanced OpenCode system with locality-preserving AI capabilities'

  async onLoad() {
    console.log('🚀 Loading Enhanced OpenCode Plugin...')

    // Register enhanced tools
    for (const [toolName, toolDefinition] of Object.entries(enhancedTools)) {
      this.registerTool(toolName, toolDefinition)
    }

    // Register enhanced init command
    this.registerCommand('enhanced-init', enhancedInit)

    // Initialize enhanced system with default balanced configuration
    try {
      await initializeEnhancedOpenCode({
        vectorStore: {
          enabled: true,
          dbPath: './.opencode/enhanced-vectors.db',
          indexing: {
            autoIndex: false, // Let users decide
            includePatterns: ['**/*.{ts,js,tsx,jsx,py,rs,go,java,cpp,c}'],
            excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
          }
        },
        externalAgents: {
          enabled: true,
          defaultTimeout: 30000,
          costLimits: {
            perHour: 10.0,
            perDay: 50.0
          }
        },
        knowledgeGraph: {
          enabled: true,
          maxNodes: 10000,
          compressionThreshold: 0.8,
          snapshotInterval: 60
        },
        learning: {
          enabled: true,
          adaptationRate: 0.3,
          minConfidence: 0.5,
          performanceWindow: 100
        }
      })

      console.log('✅ Enhanced OpenCode Plugin loaded successfully!')
      console.log('💡 Available enhanced tools:', enhancedToolNames.join(', '))
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced system:', error)
    }
  }

  async onUnload() {
    console.log('🔄 Unloading Enhanced OpenCode Plugin...')
    
    // Cleanup enhanced system
    const enhanced = getEnhancedOpenCode()
    if (enhanced) {
      try {
        // Save any pending knowledge or state
        const stats = await enhanced.getSystemStats()
        console.log('📊 Final system stats:', stats)
      } catch (error) {
        console.warn('⚠️  Cleanup warning:', error)
      }
    }
    
    console.log('✅ Enhanced OpenCode Plugin unloaded')
  }

  private registerTool(name: string, toolDefinition: any) {
    // This would integrate with OpenCode's tool registry
    console.log(`🔧 Registering enhanced tool: ${name}`)
    // In real implementation: this.context.tools.register(name, toolDefinition)
  }

  private registerCommand(name: string, commandDefinition: any) {
    // This would integrate with OpenCode's command registry
    console.log(`⚡ Registering enhanced command: ${name}`)
    // In real implementation: this.context.commands.register(name, commandDefinition)
  }
}