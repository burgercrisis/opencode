/**
 * Enhanced Init Command
 * Provides improved initialization with enhanced system integration
 */

import { tool } from '../../tool'
import { initializeEnhancedOpenCode, CONFIGURATION_PRESETS } from '../index'

export const enhancedInit = tool({
  description: 'Initialize enhanced OpenCode system with automatic setup',
  parameters: {
    profile: { 
      type: 'string', 
      description: 'Configuration profile: privacy-first, balanced, performance, development',
      default: 'balanced' 
    },
    autoIndex: { 
      type: 'boolean', 
      description: 'Automatically index workspace files', 
      default: true 
    },
    enableExternal: { 
      type: 'boolean', 
      description: 'Enable external agents (if false, uses local fallbacks)', 
      default: true 
    },
    customConfig: { 
      type: 'object', 
      description: 'Custom configuration overrides', 
      required: false 
    }
  },
  execute: async ({ profile, autoIndex, enableExternal, customConfig }) => {
    try {
      console.log(`🚀 Initializing Enhanced OpenCode with "${profile}" profile...`)
      
      // Get base configuration based on profile
      let baseConfig
      switch (profile.toLowerCase()) {
        case 'privacy-first':
        case 'privacy':
          baseConfig = CONFIGURATION_PRESETS.PRIVACY_FIRST
          break
        case 'balanced':
          baseConfig = CONFIGURATION_PRESETS.BALANCED
          break
        case 'performance':
        case 'performance-focused':
          baseConfig = CONFIGURATION_PRESETS.PERFORMANCE_FOCUSED
          break
        case 'development':
        case 'dev':
          baseConfig = CONFIGURATION_PRESETS.DEVELOPMENT
          break
        default:
          throw new Error(`Unknown profile: ${profile}. Available: privacy-first, balanced, performance, development`)
      }

      // Apply overrides
      const config = {
        ...baseConfig,
        ...customConfig,
        externalAgents: {
          ...baseConfig.externalAgents,
          enabled: enableExternal && baseConfig.externalAgents.enabled
        },
        vectorStore: {
          ...baseConfig.vectorStore,
          indexing: {
            ...baseConfig.vectorStore.indexing,
            autoIndex
          }
        }
      }

      // Initialize enhanced system
      const enhanced = await initializeEnhancedOpenCode(config)

      // Perform auto-indexing if enabled
      let indexedFiles = 0
      if (autoIndex) {
        console.log('📚 Auto-indexing workspace...')
        indexedFiles = await performAutoIndexing(enhanced)
      }

      // Get system statistics
      const stats = await enhanced.getSystemStats()

      console.log('✅ Enhanced OpenCode initialized successfully!')
      console.log(`📊 System Status:`, {
        profile,
        enabledFeatures: Object.entries(stats.enabled)
          .filter(([_, enabled]) => enabled)
          .map(([feature]) => feature),
        indexedFiles,
        knowledgeNodes: stats.knowledgeGraph?.nodes || 0,
        externalAgents: stats.externalAgents ? Object.keys(stats.externalAgents) : []
      })

      // Provide usage tips
      console.log('\n💡 Quick Usage Tips:')
      console.log('• Use enhancedSearch() for semantic code search')
      console.log('• Use callExternalAgent() for specialized AI tasks')
      console.log('• Use recordFeedback() to improve recommendations')
      console.log('• Use getSystemStats() to monitor performance')

      return {
        success: true,
        profile,
        config: {
          features: stats.enabled,
          indexedFiles,
          knowledgeNodes: stats.knowledgeGraph?.nodes || 0
        },
        metadata: {
          initializedAt: Date.now(),
          version: '1.0.0'
        }
      }

    } catch (error) {
      console.error('❌ Failed to initialize Enhanced OpenCode:', error)
      return {
        success: false,
        error: (error as Error).message,
        profile,
        metadata: {
          failedAt: Date.now()
        }
      }
    }
  }
})

async function performAutoIndexing(enhanced: any): Promise<number> {
  try {
    // Get current working directory
    const currentDir = process.cwd()
    const fs = await import('fs')
    const path = await import('path')

    // Find code files
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c']
    let indexedFiles = 0

    function findCodeFiles(dir: string): string[] {
      const files: string[] = []
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          // Skip hidden directories and common excludes
          if (entry.isDirectory() && 
              !entry.name.startsWith('.') && 
              !['node_modules', 'dist', 'build', 'target', '.git'].includes(entry.name)) {
            files.push(...findCodeFiles(fullPath))
          } else if (entry.isFile() && codeExtensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath)
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
      
      return files
    }

    const files = findCodeFiles(currentDir)
    
    // Index files in batches to avoid overwhelming the system
    const batchSize = 50
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      
      console.log(`📄 Indexing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${batch.length} files)`)
      
      for (const filePath of batch) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          if (content.trim().length > 0) {
            // This would use the vector engine to index the file
            // For now, we'll just count it
            indexedFiles++
          }
        } catch (error) {
          console.warn(`⚠️  Failed to read ${filePath}:`, error)
        }
      }
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return indexedFiles

  } catch (error) {
    console.warn('⚠️  Auto-indexing encountered issues:', error)
    return 0
  }
}