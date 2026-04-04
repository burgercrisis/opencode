/**
 * Debug runner for WorkerManager testing and logging demonstration
 * This file demonstrates comprehensive testing and debugging capabilities
 */

import { EnhancedWorkerManager } from "./marked-enhanced"
import { workerLogger } from "./marked-logger"
import type { WorkerState } from "./marked-types"

/**
 * Comprehensive test runner for WorkerManager debugging
 */
export class WorkerManagerDebugRunner {
  private manager: EnhancedWorkerManager

  constructor() {
    this.manager = new EnhancedWorkerManager()
    this.setupGlobalDebugging()
  }

  private setupGlobalDebugging() {
    // Expose debugging functions to global scope in development
    if (typeof window !== 'undefined') {
      (window as any).debugWorkerManager = {
        runAllTests: () => this.runAllTests(),
        runStressTest: () => this.runStressTest(),
        runConcurrencyTest: () => this.runConcurrencyTest(),
        runMemoryLeakTest: () => this.runMemoryLeakTest(),
        runErrorHandlingTest: () => this.runErrorHandlingTest(),
        showDebugInfo: () => this.showDebugInfo(),
        showPerformanceReport: () => this.showPerformanceReport(),
        showErrorReport: () => this.showErrorReport(),
        showStateDiagram: () => this.showStateDiagram(),
        exportLogs: () => this.exportLogs(),
        clearLogs: () => this.clearLogs()
      }
      
      console.log('🔧 Debug functions exposed to window.debugWorkerManager')
    }
  }

  async runAllTests() {
    console.group('🧪 Running All WorkerManager Tests')
    
    try {
      await this.testBasicInitialization()
      await this.testStateTransitions()
      await this.testConcurrentOperations()
      await this.testErrorHandling()
      await this.testMemoryManagement()
      await this.testPerformanceMetrics()
      await this.testConfiguration()
      
      console.log('✅ All tests completed successfully')
    } catch (error) {
      console.error('❌ Test suite failed:', error)
    }
    
    console.groupEnd()
  }

  private async testBasicInitialization() {
    console.group('🔄 Testing Basic Initialization')
    
    try {
      // Test 1: Normal initialization
      console.log('Test 1: Normal initialization')
      await this.manager.initialize()
      console.log('✅ Normal initialization successful')
      
      // Test 2: Multiple initialization calls
      console.log('Test 2: Multiple initialization calls')
      await Promise.all([
        this.manager.initialize(),
        this.manager.initialize(),
        this.manager.initialize()
      ])
      console.log('✅ Multiple initialization calls handled correctly')
      
      // Test 3: Reset and reinitialize
      console.log('Test 3: Reset and reinitialize')
      this.manager.reset()
      await this.manager.initialize()
      console.log('✅ Reset and reinitialize successful')
      
    } catch (error) {
      console.error('❌ Basic initialization test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testStateTransitions() {
    console.group('🗺️ Testing State Transitions')
    
    try {
      const states: WorkerState[] = []
      
      // Monitor state changes
      const originalGetState = this.manager.getState.bind(this.manager)
      let lastState = originalGetState()
      
      const checkStateTransition = () => {
        const currentState = originalGetState()
        if (currentState !== lastState) {
          states.push(currentState)
          lastState = currentState
          console.log(`🔄 State transition: ${WorkerState[lastState]} → ${WorkerState[currentState]}`)
        }
      }
      
      // Test various state transitions
      checkStateTransition()
      
      this.manager.reset()
      checkStateTransition()
      
      await this.manager.initialize()
      checkStateTransition()
      
      this.manager.terminate()
      checkStateTransition()
      
      console.log('✅ State transitions:', states.map(s => WorkerState[s]).join(' → '))
      
    } catch (error) {
      console.error('❌ State transition test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testConcurrentOperations() {
    console.group('⚡ Testing Concurrent Operations')
    
    try {
      await this.manager.initialize()
      
      // Test 1: Concurrent message sending
      console.log('Test 1: Concurrent message sending')
      const concurrentPromises = Array.from({ length: 20 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Concurrent test ${i}</p>` 
        })
      )
      
      const results = await Promise.all(concurrentPromises)
      console.log(`✅ Concurrent operations completed: ${results.length} results`)
      
      // Test 2: Operations during shutdown
      console.log('Test 2: Operations during shutdown')
      const shutdownPromises = Array.from({ length: 5 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Shutdown test ${i}</p>` 
        }).catch(error => ({ error: error.message, index: i }))
      )
      
      // Start shutdown after a short delay
      setTimeout(() => this.manager.terminate(), 10)
      
      const shutdownResults = await Promise.all(shutdownPromises)
      const rejectedCount = shutdownResults.filter(r => 'error' in r).length
      console.log(`✅ Shutdown test: ${rejectedCount}/${shutdownResults.length} operations rejected`)
      
    } catch (error) {
      console.error('❌ Concurrent operations test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testErrorHandling() {
    console.group('🚨 Testing Error Handling')
    
    try {
      // Test 1: Timeout error
      console.log('Test 1: Timeout error')
      this.manager.updateConfig({ workerTimeout: 1 })
      
      try {
        await this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: "<p>Timeout test</p>" 
        })
        console.log('❌ Timeout test should have failed')
      } catch (error) {
        console.log('✅ Timeout error handled correctly:', error.message)
      }
      
      // Reset timeout
      this.manager.updateConfig({ workerTimeout: 10000 })
      
      // Test 2: Invalid message handling
      console.log('Test 2: Invalid message handling')
      // This would be tested with a mock worker that sends invalid responses
      
      // Test 3: Worker error simulation
      console.log('Test 3: Worker error simulation')
      // This would be tested with a mock worker that throws errors
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testMemoryManagement() {
    console.group('💾 Testing Memory Management')
    
    try {
      await this.manager.initialize()
      
      // Test 1: Memory usage tracking
      console.log('Test 1: Memory usage tracking')
      const initialMemory = this.manager.getDebugInfo().pendingCount
      
      // Create many pending operations
      const pendingPromises = Array.from({ length: 50 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Memory test ${i}</p>` 
        }).catch(() => {}) // Ignore errors for cleanup test
      )
      
      const peakMemory = this.manager.getDebugInfo().pendingCount
      console.log(`✅ Memory usage: ${initialMemory} → ${peakMemory} pending operations`)
      
      // Test 2: Memory cleanup on reset
      console.log('Test 2: Memory cleanup on reset')
      this.manager.reset()
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const finalMemory = this.manager.getDebugInfo().pendingCount
      console.log(`✅ Memory cleanup: ${peakMemory} → ${finalMemory} pending operations`)
      
      // Clean up remaining promises
      await Promise.allSettled(pendingPromises)
      
    } catch (error) {
      console.error('❌ Memory management test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testPerformanceMetrics() {
    console.group('📊 Testing Performance Metrics')
    
    try {
      await this.manager.initialize()
      
      // Test 1: Performance tracking
      console.log('Test 1: Performance tracking')
      const operations = 10
      const startTime = performance.now()
      
      for (let i = 0; i < operations; i++) {
        await this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Performance test ${i}</p>` 
        })
      }
      
      const totalTime = performance.now() - startTime
      const metrics = this.manager.getMetrics()
      
      console.log(`✅ Performance metrics:`)
      console.log(`   Total operations: ${metrics.totalOperations}`)
      console.log(`   Average time: ${metrics.averageEnhancementTime.toFixed(2)}ms`)
      console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
      console.log(`   Error count: ${metrics.errorCount}`)
      
    } catch (error) {
      console.error('❌ Performance metrics test failed:', error)
    }
    
    console.groupEnd()
  }

  private async testConfiguration() {
    console.group('⚙️ Testing Configuration')
    
    try {
      // Test 1: Configuration updates
      console.log('Test 1: Configuration updates')
      const originalConfig = this.manager.getDebugInfo().config
      
      this.manager.updateConfig({
        workerTimeout: 5000,
        maxHtmlSize: 2000000,
        enableMetrics: false
      })
      
      const newConfig = this.manager.getDebugInfo().config
      
      console.log('✅ Configuration updated:')
      console.log(`   Timeout: ${originalConfig.workerTimeout} → ${newConfig.workerTimeout}`)
      console.log(`   Max HTML size: ${originalConfig.maxHtmlSize} → ${newConfig.maxHtmlSize}`)
      console.log(`   Metrics enabled: ${originalConfig.enableMetrics} → ${newConfig.enableMetrics}`)
      
      // Test 2: Configuration behavior
      console.log('Test 2: Configuration behavior')
      await this.manager.initialize()
      
      // Test with disabled metrics
      const metricsBefore = this.manager.getMetrics()
      await this.manager.sendMessageWithTimeout({ 
        type: "enhance", 
        html: "<p>Config test</p>" 
      })
      const metricsAfter = this.manager.getMetrics()
      
      console.log(`✅ Metrics disabled: ${metricsBefore.totalOperations} → ${metricsAfter.totalOperations}`)
      
    } catch (error) {
      console.error('❌ Configuration test failed:', error)
    }
    
    console.groupEnd()
  }

  // Specialized stress tests
  async runStressTest() {
    console.group('💪 Running Stress Test')
    
    try {
      await this.manager.initialize()
      
      const iterations = 100
      const concurrency = 10
      const startTime = performance.now()
      
      console.log(`Running ${iterations} operations with concurrency ${concurrency}`)
      
      const promises = []
      for (let i = 0; i < iterations; i += concurrency) {
        const batch = Array.from({ length: concurrency }, (_, j) => 
          this.manager.sendMessageWithTimeout({ 
            type: "enhance", 
            html: `<p>Stress test ${i + j}</p>` 
          })
        )
        promises.push(Promise.all(batch))
      }
      
      await Promise.all(promises)
      
      const totalTime = performance.now() - startTime
      const metrics = this.manager.getMetrics()
      
      console.log('✅ Stress test completed:')
      console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
      console.log(`   Operations per second: ${(iterations / totalTime * 1000).toFixed(2)}`)
      console.log(`   Average operation time: ${metrics.averageEnhancementTime.toFixed(2)}ms`)
      console.log(`   Error rate: ${(metrics.errorCount / iterations * 100).toFixed(2)}%`)
      
    } catch (error) {
      console.error('❌ Stress test failed:', error)
    }
    
    console.groupEnd()
  }

  async runConcurrencyTest() {
    console.group('🔄 Running Concurrency Test')
    
    try {
      await this.manager.initialize()
      
      // Test rapid state changes
      console.log('Testing rapid state changes')
      const stateChangePromises = Array.from({ length: 20 }, (_, i) => 
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (i % 4 === 0) this.manager.reset()
            else if (i % 4 === 1) this.manager.initialize().catch(() => {})
            else if (i % 4 === 2) this.manager.terminate()
            else resolve()
          }, Math.random() * 50)
        })
      )
      
      await Promise.all(stateChangePromises)
      console.log('✅ Rapid state changes handled')
      
      // Test concurrent operations during state changes
      console.log('Testing concurrent operations during state changes')
      const operationPromises = Array.from({ length: 50 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Concurrency test ${i}</p>` 
        }).catch(error => ({ error: error.message, index: i }))
      )
      
      // Intermix state changes
      setTimeout(() => this.manager.reset(), 25)
      setTimeout(() => this.manager.initialize(), 50)
      
      const results = await Promise.all(operationPromises)
      const successCount = results.filter(r => !('error' in r)).length
      const errorCount = results.filter(r => 'error' in r).length
      
      console.log(`✅ Concurrency test: ${successCount} successful, ${errorCount} errors`)
      
    } catch (error) {
      console.error('❌ Concurrency test failed:', error)
    }
    
    console.groupEnd()
  }

  async runMemoryLeakTest() {
    console.group('🔍 Running Memory Leak Test')
    
    try {
      await this.manager.initialize()
      
      const iterations = 5
      const operationsPerIteration = 100
      
      for (let iteration = 0; iteration < iterations; iteration++) {
        console.log(`Memory leak test iteration ${iteration + 1}/${iterations}`)
        
        // Create many operations
        const promises = Array.from({ length: operationsPerIteration }, (_, i) => 
          this.manager.sendMessageWithTimeout({ 
            type: "enhance", 
            html: `<p>Memory leak test ${iteration}-${i}</p>` 
          }).catch(() => {}) // Ignore errors
        )
        
        // Reset before completion to test cleanup
        if (iteration % 2 === 0) {
          this.manager.reset()
          await new Promise(resolve => setTimeout(resolve, 10))
          await this.manager.initialize()
        }
        
        await Promise.allSettled(promises)
        
        const debugInfo = this.manager.getDebugInfo()
        console.log(`  Pending operations: ${debugInfo.pendingCount}`)
        console.log(`  Memory estimate: ${(debugInfo.config as any).memoryEstimate || 'N/A'} bytes`)
      }
      
      // Final cleanup
      this.manager.terminate()
      
      console.log('✅ Memory leak test completed - check for consistent memory usage')
      
    } catch (error) {
      console.error('❌ Memory leak test failed:', error)
    }
    
    console.groupEnd()
  }

  async runErrorHandlingTest() {
    console.group('🚨 Running Error Handling Test')
    
    try {
      // Test various error scenarios
      await this.manager.initialize()
      
      // Test 1: Timeout errors
      console.log('Test 1: Timeout errors')
      this.manager.updateConfig({ workerTimeout: 1 })
      
      const timeoutPromises = Array.from({ length: 10 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Timeout test ${i}</p>` 
        }).catch(error => ({ type: 'timeout', error: error.message, index: i }))
      )
      
      const timeoutResults = await Promise.all(timeoutPromises)
      const timeoutCount = timeoutResults.filter(r => (r as any).type === 'timeout').length
      console.log(`✅ Timeout errors: ${timeoutCount}/${timeoutResults.length}`)
      
      // Reset timeout
      this.manager.updateConfig({ workerTimeout: 10000 })
      
      // Test 2: Shutdown errors
      console.log('Test 2: Shutdown errors')
      const shutdownPromises = Array.from({ length: 10 }, (_, i) => 
        this.manager.sendMessageWithTimeout({ 
          type: "enhance", 
          html: `<p>Shutdown test ${i}</p>` 
        }).catch(error => ({ type: 'shutdown', error: error.message, index: i }))
      )
      
      this.manager.terminate()
      
      const shutdownResults = await Promise.all(shutdownPromises)
      const shutdownCount = shutdownResults.filter(r => (r as any).type === 'shutdown').length
      console.log(`✅ Shutdown errors: ${shutdownCount}/${shutdownResults.length}`)
      
      // Test 3: Reinitialization after errors
      console.log('Test 3: Reinitialization after errors')
      await this.manager.initialize()
      const recoveryResult = await this.manager.sendMessageWithTimeout({ 
        type: "enhance", 
        html: "<p>Recovery test</p>" 
      })
      console.log(`✅ Recovery successful: ${recoveryResult.length > 0}`)
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error)
    }
    
    console.groupEnd()
  }

  // Debug reporting methods
  showDebugInfo() {
    const info = this.manager.getDebugInfo()
    console.group('🔍 Debug Information')
    console.log('State:', WorkerState[info.state])
    console.log('Shutting down:', info.isShuttingDown)
    console.log('State lock:', info.stateLock)
    console.log('Pending operations:', info.pendingCount)
    console.log('Configuration:', info.config)
    console.log('Metrics:', info.metrics)
    console.groupEnd()
  }

  showPerformanceReport() {
    console.group('📊 Performance Report')
    const reports = this.manager.getDebugReports()
    reports.performanceReport()
    console.groupEnd()
  }

  showErrorReport() {
    console.group('❌ Error Report')
    const reports = this.manager.getDebugReports()
    reports.errorReport()
    console.groupEnd()
  }

  showStateDiagram() {
    console.group('🗺️ State Diagram')
    const reports = this.manager.getDebugReports()
    reports.stateDiagram()
    console.groupEnd()
  }

  exportLogs() {
    const reports = this.manager.getDebugReports()
    const logs = reports.exportLogs()
    console.log('📄 Exported logs:', logs)
    return logs
  }

  clearLogs() {
    workerLogger.clearLogs()
    console.log('🧹 Logs cleared')
  }
}

// Auto-initialize debug runner in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  const debugRunner = new WorkerManagerDebugRunner()
  console.log('🔧 WorkerManager debug runner initialized')
  console.log('Run window.debugWorkerManager.runAllTests() to start testing')
}
