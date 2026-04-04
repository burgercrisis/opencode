import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { createSimpleContext } from "./helper"
import { getSharedHighlighter, registerCustomTheme, ThemeRegistrationResolved } from "@pierre/diffs"
import MarkedWorkerUrl from "./marked-worker?worker&url"
import { WorkerMessage, WorkerResponse, WorkerState, WorkerMetrics, MarkdownConfig, validateWorkerResponse } from "./marked-types"
import { workerLogger, type LogEntry } from "./marked-logger"

registerCustomTheme("OpenCode", () => {
  return Promise.resolve({
    name: "OpenCode",
    colors: {
      "editor.background": "var(--color-background-stronger)",
      "editor.foreground": "var(--text-base)",
      "gitDecoration.addedResourceForeground": "var(--syntax-diff-add)",
      "gitDecoration.deletedResourceForeground": "var(--syntax-diff-delete)",
    },
    tokenColors: [
      {
        scope: ["comment", "punctuation.definition.comment", "string.comment"],
        settings: {
          foreground: "var(--syntax-comment)",
        },
      },
      {
        scope: ["entity.name.function", "support.type.primitive"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: "keyword",
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: [
          "string",
          "punctuation.definition.string",
          "string punctuation.section.embedded source",
          "entity.name.tag",
        ],
        settings: {
          foreground: "var(--syntax-string)",
        },
      },
    ],
    semanticTokenColors: {
      comment: "var(--syntax-comment)",
      string: "var(--syntax-string)",
      number: "var(--syntax-constant)",
      keyword: "var(--syntax-keyword)",
      variable: "var(--syntax-variable)",
      function: "var(--syntax-primitive)",
      type: "var(--syntax-type)",
    },
  } as unknown as ThemeRegistrationResolved)
})

export type NativeMarkdownParser = (markdown: string) => Promise<string>

export interface MarkedContextValue {
  parse(markdown: string): Promise<string>
  fastParse?(markdown: string): Promise<string>
  enhance?(html: string): Promise<string>
}

/**
 * Enhanced WorkerManager with comprehensive logging for debugging
 * 
 * This class provides detailed logging of all state transitions, operations,
 * and performance metrics to help debug complex state management issues.
 */
class EnhancedWorkerManager {
  private config: MarkdownConfig = {
    maxHtmlSize: 1000000, // 1MB default
    workerTimeout: 10000, // 10 seconds default
    enableMetrics: true
  }

  private metrics: WorkerMetrics = {
    totalOperations: 0,
    averageEnhancementTime: 0,
    errorCount: 0
  }

  private worker: Worker | undefined
  private pending = new Map<number, { 
    resolve: (value: any) => void; 
    reject: (err: any) => void;
    startTime: number;
    operation: string;
  }>()
  private nextId = 0
  private state: WorkerState = WorkerState.INITIALIZING
  private initializationPromise: Promise<void> | null = null
  private isShuttingDown = false
  private stateLock = false

  constructor() {
    workerLogger.logStateTransition('NONE', WorkerState.INITIALIZING, 'Constructor called')
    workerLogger.logDebug('EnhancedWorkerManager initialized', { config: this.config })
  }

  /**
   * Get current worker metrics
   */
  getMetrics(): WorkerMetrics {
    return { ...this.metrics }
  }

  /**
   * Get detailed debugging information
   */
  getDebugInfo() {
    return {
      state: this.state,
      isShuttingDown: this.isShuttingDown,
      stateLock: this.stateLock,
      pendingCount: this.pending.size,
      maxPending: 1000, // Configurable limit
      config: this.config,
      metrics: this.metrics,
      logs: workerLogger.getRecentLogs(20)
    }
  }

  /**
   * Update worker configuration
   */
  updateConfig(newConfig: Partial<MarkdownConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...newConfig }
    
    workerLogger.logDebug('Configuration updated', { 
      oldConfig, 
      newConfig, 
      changes: Object.keys(newConfig) 
    })
  }

  getState(): WorkerState {
    return this.state
  }

  /**
   * Atomic state transition with comprehensive logging
   */
  private setState(newState: WorkerState, reason?: string): void {
    const oldState = this.state
    
    workerLogger.logStateLockAttempt(newState.toString(), this.stateLock)
    
    if (this.stateLock) {
      workerLogger.logDebug('State transition blocked by lock', { 
        attempted: newState, 
        current: oldState 
      })
      return
    }

    this.stateLock = true
    
    try {
      this.state = newState
      workerLogger.logStateTransition(oldState, newState, reason)
      
      // Log memory usage on state changes
      this.logMemoryUsage('setState')
      
    } finally {
      this.stateLock = false
    }
  }

  /**
   * Log memory usage for debugging
   */
  private logMemoryUsage(operation: string) {
    const memoryInfo = {
      pendingCount: this.pending.size,
      maxPending: 1000,
      memoryEstimate: this.estimateMemoryUsage()
    }
    workerLogger.logMemoryUsage(operation, memoryInfo)
  }

  /**
   * Estimate memory usage of pending operations
   */
  private estimateMemoryUsage(): number {
    // Rough estimation: each pending operation ~1KB
    return this.pending.size * 1024
  }

  /**
   * Reset worker to ERROR state and clean up resources with detailed logging
   */
  reset(): void {
    const startTime = performance.now()
    const pendingCount = this.pending.size
    
    workerLogger.logOperationStart('reset', -1, { 
      state: this.state, 
      pendingCount 
    })

    this.isShuttingDown = true

    if (this.worker) {
      try {
        this.worker.terminate()
        workerLogger.logDebug('Worker terminated during reset')
      } catch (e) {
        workerLogger.logWorkerError(e as ErrorEvent, { context: 'reset' })
      }
    }
    
    this.worker = undefined
    this.setState(WorkerState.INITIALIZING, 'Reset called')
    this.initializationPromise = null

    // Clear all pending requests with detailed logging
    const pendingEntries = Array.from(this.pending.entries())
    this.pending.clear()

    pendingEntries.forEach(([id, promise]) => {
      try {
        promise.reject(new Error('Worker reset'))
      } catch (e) {
        workerLogger.logDebug('Failed to reject pending promise during reset', { id, error: e })
      }
    })

    this.isShuttingDown = false
    
    const duration = performance.now() - startTime
    workerLogger.logOperationComplete('reset', -1, duration, { 
      clearedPromises: pendingCount 
    })
  }

  /**
   * Initialize worker with comprehensive logging and error handling
   */
  async initialize(): Promise<void> {
    const operationId = this.nextId++
    const startTime = performance.now()
    
    workerLogger.logOperationStart('initialize', operationId, { 
      currentState: this.state,
      isShuttingDown: this.isShuttingDown
    })

    if (this.isShuttingDown) {
      const error = new Error('Worker is shutting down')
      workerLogger.logOperationError('initialize', operationId, error)
      throw error
    }

    if (this.state === WorkerState.READY) {
      workerLogger.logDebug('Worker already ready', { operationId })
      return Promise.resolve()
    }

    if (this.state === WorkerState.INITIALIZING && this.initializationPromise) {
      workerLogger.logDebug('Initialization already in progress', { operationId })
      return this.initializationPromise
    }

    if (this.state === WorkerState.ERROR) {
      workerLogger.logDebug('Resetting worker due to ERROR state', { operationId })
      this.reset()
    }

    // Set promise immediately to prevent race conditions
    this.initializationPromise = new Promise((resolve, reject) => {
      this.setState(WorkerState.INITIALIZING, 'Starting initialization')

      const initId = this.nextId++
      const initStartTime = performance.now()

      const timeout = setTimeout(() => {
        if (this.isShuttingDown) {
          workerLogger.logDebug('Initialization timeout ignored - shutting down')
          return
        }

        const promise = this.pending.get(initId)
        if (promise) {
          this.pending.delete(initId)
          this.setState(WorkerState.ERROR, 'Initialization timeout')
          this.initializationPromise = null
          
          if (this.config.enableMetrics) {
            this.metrics.errorCount++
          }
          
          workerLogger.logOperationTimeout('initialize', initId, this.config.workerTimeout)
          reject(new Error('Worker initialization timeout'))
        }
      }, this.config.workerTimeout)

      this.pending.set(initId, {
        resolve: () => {
          if (this.isShuttingDown) return

          clearTimeout(timeout)
          this.pending.delete(initId)
          this.setState(WorkerState.READY, 'Initialization successful')
          this.initializationPromise = null

          // Record initialization metrics
          if (this.config.enableMetrics) {
            const duration = performance.now() - initStartTime
            this.metrics.initializationTime = duration
            workerLogger.logPerformance('initialize', duration, { operationId })
          }

          const totalDuration = performance.now() - startTime
          workerLogger.logOperationComplete('initialize', operationId, totalDuration)
          resolve()
        },
        reject: (err) => {
          if (this.isShuttingDown) return

          clearTimeout(timeout)
          this.pending.delete(initId)
          this.setState(WorkerState.ERROR, 'Initialization failed')
          this.initializationPromise = null
          
          workerLogger.logOperationError('initialize', operationId, err)
          reject(err)
        },
        startTime: initStartTime,
        operation: 'initialize'
      })

      const w = this.getWorker()
      if (w) {
        w.postMessage({ type: "init", id: initId, theme: null })
        workerLogger.logDebug('Initialization message sent', { initId })
      } else {
        clearTimeout(timeout)
        this.pending.delete(initId)
        this.setState(WorkerState.ERROR, 'Failed to create worker')
        this.initializationPromise = null
        
        const error = new Error('Failed to create worker')
        workerLogger.logOperationError('initialize', operationId, error)
        reject(error)
      }
    })

    return this.initializationPromise
  }

  private getWorker(): Worker | undefined {
    if (typeof window === "undefined") return undefined
    
    if (!this.worker) {
      try {
        this.worker = new Worker(MarkedWorkerUrl, { type: "module" })
        workerLogger.logDebug('Worker created', { url: MarkedWorkerUrl })
        
        this.worker.onmessage = (e) => {
          const startTime = performance.now()
          
          if (!validateWorkerResponse(e.data)) {
            workerLogger.logValidationError(
              new Error('Invalid worker response'), 
              { data: e.data }
            )
            return
          }

          const { id, type, html, error } = e.data
          const promise = this.pending.get(id)
          
          if (!promise) {
            workerLogger.logDebug('Received response for unknown promise', { id, type })
            return
          }

          // Remove promise before processing to prevent race conditions
          this.pending.delete(id)

          const duration = startTime - promise.startTime
          workerLogger.logPerformance(`worker-${type}`, duration, { id })

          if (type === "enhanced") {
            promise.resolve(html || "")
            workerLogger.logOperationComplete('enhance', id, duration, { htmlLength: html?.length })
          } else if (type === "theme-initialized") {
            promise.resolve(html || "")
            workerLogger.logOperationComplete('theme-init', id, duration)
          } else if (type === "error") {
            const errorMessage = typeof error === 'string' ? error :
              (error && typeof error === 'object' && 'message' in error) ? String(error.message) :
                'Unknown worker error'
            
            const errorObj = new Error(errorMessage)
            promise.reject(errorObj)
            workerLogger.logOperationError('worker-response', id, errorObj)
          }
        }

        this.worker.onerror = (error) => {
          workerLogger.logWorkerError(error, { 
            pendingCount: this.pending.size,
            currentState: this.state 
          })
          
          this.setState(WorkerState.ERROR, 'Worker error')

          // Clean up all pending promises on worker error
          const pendingPromises = Array.from(this.pending.entries())
          this.pending.clear()

          pendingPromises.forEach(([id, promise]) => {
            try {
              promise.reject(new Error('Worker encountered an error'))
            } catch (e) {
              workerLogger.logDebug('Failed to reject pending promise on worker error', { id, error: e })
            }
          })

          workerLogger.logDebug('All pending promises rejected due to worker error', { 
            count: pendingPromises.length 
          })
        }
        
      } catch (error) {
        workerLogger.logOperationError('create-worker', -1, error as Error)
        return undefined
      }
    }
    
    return this.worker
  }

  /**
   * Terminate worker and clean up all resources with logging
   */
  terminate(): void {
    const startTime = performance.now()
    const pendingCount = this.pending.size
    
    workerLogger.logOperationStart('terminate', -1, { 
      state: this.state, 
      pendingCount 
    })

    this.reset()
    this.setState(WorkerState.TERMINATED, 'Terminate called')
    
    const duration = performance.now() - startTime
    workerLogger.logOperationComplete('terminate', -1, duration)
  }

  /**
   * Send message to worker with timeout and comprehensive metrics collection
   */
  async sendMessageWithTimeout<T>(message: Omit<WorkerMessage, 'id'>, timeoutMs?: number): Promise<T> {
    const operationId = this.nextId++
    const startTime = performance.now()
    const messageType = message.type
    const actualTimeout = timeoutMs || this.config.workerTimeout

    workerLogger.logOperationStart(`send-${messageType}`, operationId, { 
      message: { ...message, id: operationId },
      timeout: actualTimeout,
      pendingCount: this.pending.size
    })

    if (this.isShuttingDown) {
      const error = new Error('Worker is shutting down')
      workerLogger.logOperationError(`send-${messageType}`, operationId, error)
      throw error
    }

    const id = this.nextId++
    const cleanup = () => {
      if (this.pending.has(id)) {
        this.pending.delete(id)
        this.logMemoryUsage(`cleanup-${messageType}`)
      }
    }

    const mainPromise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => {
          cleanup()

          // Record metrics for enhancement operations (throttled)
          if (this.config.enableMetrics && messageType === 'enhance') {
            const duration = performance.now() - startTime
            this.metrics.totalOperations++
            this.metrics.averageEnhancementTime = this.metrics.totalOperations === 1 ?
              duration :
              (this.metrics.averageEnhancementTime * (this.metrics.totalOperations - 1) + duration) / this.metrics.totalOperations
            
            workerLogger.logPerformance('enhance-average', this.metrics.averageEnhancementTime, {
              totalOperations: this.metrics.totalOperations
            })
          }

          const totalDuration = performance.now() - startTime
          workerLogger.logOperationComplete(messageType, operationId, totalDuration, {
            resultSize: typeof value === 'string' ? value.length : 'object'
          })
          resolve(value)
        },
        reject: (err) => {
          cleanup()
          if (this.config.enableMetrics) {
            this.metrics.errorCount++
          }
          workerLogger.logOperationError(messageType, operationId, err)
          reject(err)
        },
        startTime,
        operation: messageType
      })

      const w = this.getWorker()
      if (w) {
        w.postMessage({ ...message, id })
        workerLogger.logDebug('Message sent to worker', { id, type: messageType })
      } else {
        cleanup()
        const error = new Error('Worker not available')
        workerLogger.logOperationError(messageType, operationId, error)
        reject(error)
      }
    })

    // Only create timeout promise if actual timeout is valid and greater than 0
    if (actualTimeout > 0) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          if (this.pending.has(id)) {
            cleanup()
            if (this.config.enableMetrics) {
              this.metrics.errorCount++
            }
            workerLogger.logOperationTimeout(messageType, operationId, actualTimeout)
            reject(new Error(`Worker request timeout: ${messageType}`))
          }
        }, actualTimeout)
      })
      return Promise.race([mainPromise, timeoutPromise])
    }

    // No timeout needed - return main promise directly for performance
    return mainPromise
  }

  /**
   * Get comprehensive debugging reports
   */
  getDebugReports() {
    return {
      summary: workerLogger.getLogSummary(),
      recentLogs: workerLogger.getRecentLogs(50),
      errorLogs: workerLogger.getErrorLogs(),
      performanceLogs: workerLogger.getPerformanceLogs(),
      stateDiagram: () => workerLogger.logStateDiagram(),
      performanceReport: () => workerLogger.logPerformanceReport(),
      errorReport: () => workerLogger.logErrorReport(),
      exportLogs: () => workerLogger.exportLogs()
    }
  }
}

// Global enhanced worker manager instance
const enhancedWorkerManager = new EnhancedWorkerManager()

// Performance monitoring for main thread syntax highlighting
const syntaxHighlightingMetrics = {
  totalOperations: 0,
  totalTime: 0,
  averageTime: 0,
  errorCount: 0
}

/**
 * Get performance metrics for both worker and main thread operations
 */
export function getMarkdownMetrics() {
  return {
    worker: enhancedWorkerManager.getMetrics(),
    syntaxHighlighting: { ...syntaxHighlightingMetrics },
    debug: enhancedWorkerManager.getDebugInfo()
  }
}

/**
 * Get comprehensive debugging information
 */
export function getMarkdownDebugInfo() {
  return enhancedWorkerManager.getDebugReports()
}

/**
 * Update markdown processing configuration
 */
export function updateMarkdownConfig(config: Partial<MarkdownConfig>) {
  enhancedWorkerManager.updateConfig(config)
}

async function enhanceInWorker(html: string): Promise<string> {
  const operationId = enhancedWorkerManager['nextId']++
  const startTime = performance.now()
  
  workerLogger.logOperationStart('enhance-in-worker', operationId, { 
    htmlLength: html.length 
  })

  try {
    await enhancedWorkerManager.initialize()
    const result = await enhancedWorkerManager.sendMessageWithTimeout<string>({
      type: "enhance",
      html,
      config: enhancedWorkerManager['config']
    })
    
    const duration = performance.now() - startTime
    workerLogger.logOperationComplete('enhance-in-worker', operationId, duration, {
      resultLength: result.length
    })
    
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    workerLogger.logOperationError('enhance-in-worker', operationId, error as Error, {
      duration,
      htmlLength: html.length
    })
    
    console.error('Worker enhancement failed:', error)
    // Only fallback if it's a worker error, not for validation errors
    if (error instanceof Error &&
      (error.message.includes('Worker') ||
        error.message.includes('timeout') ||
        error.message.includes('initialization'))) {
      return html // Fallback to original HTML
    }
    throw error // Re-throw validation and other errors
  }
}

const context = createSimpleContext<MarkedContextValue, { nativeParser?: NativeMarkdownParser }>({
  name: "Marked",
  init: (props) => {
    const jsParser = marked.use(
      {
        renderer: {
          link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : ""
            return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
          },
        },
      },
      markedKatex({
        throwOnError: false,
        nonStandard: true,
      }),
      markedShiki({
        async highlight(code, lang) {
          const startTime = performance.now()

          try {
            const highlighter = await getSharedHighlighter({ themes: ["OpenCode"], langs: [] })
            if (!(lang in bundledLanguages)) {
              lang = "text"
            }
            if (!highlighter.getLoadedLanguages().includes(lang)) {
              await highlighter.loadLanguage(lang as BundledLanguage)
            }

            const result = highlighter.codeToHtml(code, {
              lang: lang || "text",
              theme: "OpenCode",
              tabindex: false,
            })

            // Record performance metrics
            const duration = performance.now() - startTime
            syntaxHighlightingMetrics.totalOperations++
            syntaxHighlightingMetrics.totalTime += duration
            syntaxHighlightingMetrics.averageTime =
              syntaxHighlightingMetrics.totalTime / syntaxHighlightingMetrics.totalOperations

            workerLogger.logPerformance('syntax-highlighting', duration, {
              language: lang,
              codeLength: code.length
            })

            return result
          } catch (error) {
            syntaxHighlightingMetrics.errorCount++
            workerLogger.logOperationError('syntax-highlighting', -1, error as Error, {
              language: lang,
              codeLength: code.length
            })
            console.error('Syntax highlighting failed:', error)
            throw error
          }
        },
      }),
    )

    if (props.nativeParser) {
      const nativeParser = props.nativeParser
      return {
        async parse(markdown: string): Promise<string> {
          const html = await nativeParser(markdown)
          return enhanceInWorker(html)
        },
        async fastParse(markdown: string): Promise<string> {
          return nativeParser(markdown)
        },
        async enhance(html: string): Promise<string> {
          return enhanceInWorker(html)
        },
      }
    }

    return {
      async parse(markdown: string) {
        return jsParser.parse(markdown)
      },
    }
  },
})

export const { use: useMarked, provider: MarkedProvider, ctx: MarkedContext } = context
