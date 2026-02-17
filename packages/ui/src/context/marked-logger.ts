/**
 * Development logging utilities for WorkerManager state transitions and operations
 * Provides detailed debugging information in development mode
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: number
  level: LogLevel
  category: 'state' | 'operation' | 'error' | 'performance' | 'memory'
  message: string
  data?: any
  stack?: string
}

export class WorkerLogger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private enabled = false
  private logLevels: Set<LogLevel> = new Set(['info', 'warn', 'error'])

  constructor(enableInDevelopment = true) {
    this.enabled = enableInDevelopment && this.isDevelopmentMode()
    if (this.enabled) {
      console.log('🔧 WorkerLogger: Development logging enabled')
    }
  }

  private isDevelopmentMode(): boolean {
    return (
      typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' ||
       window.location.hostname === '0.0.0.0' ||
       window.location.protocol === 'file:') ||
      process?.env?.NODE_ENV === 'development'
    )
  }

  enable(levels?: LogLevel[]) {
    this.enabled = true
    if (levels) {
      this.logLevels = new Set(levels)
    }
  }

  disable() {
    this.enabled = false
  }

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && this.logLevels.has(level)
  }

  private createLogEntry(level: LogLevel, category: LogEntry['category'], message: string, data?: any): LogEntry {
    const entry: LogEntry = {
      timestamp: performance.now(),
      level,
      category,
      message,
      data
    }

    if (level === 'error' && data instanceof Error) {
      entry.stack = data.stack
    }

    return entry
  }

  private log(entry: LogEntry) {
    if (!this.shouldLog(entry.level)) return

    // Add to internal log buffer
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Console output with formatting
    const timestamp = new Date().toISOString().substring(11, 23)
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category.toUpperCase()}]`
    
    switch (entry.level) {
      case 'debug':
        console.debug(prefix, entry.message, entry.data || '')
        break
      case 'info':
        console.info(prefix, entry.message, entry.data || '')
        break
      case 'warn':
        console.warn(prefix, entry.message, entry.data || '')
        break
      case 'error':
        console.error(prefix, entry.message, entry.data || '')
        if (entry.stack) {
          console.error(entry.stack)
        }
        break
    }
  }

  // State transition logging
  logStateTransition(from: string, to: string, reason?: string) {
    const entry = this.createLogEntry(
      'info',
      'state',
      `State transition: ${from} → ${to}`,
      { from, to, reason }
    )
    this.log(entry)
  }

  logStateLockAttempt(state: string, lockActive: boolean) {
    const entry = this.createLogEntry(
      'debug',
      'state',
      `State lock ${lockActive ? 'ACTIVE' : 'available'} for ${state}`,
      { state, lockActive }
    )
    this.log(entry)
  }

  // Operation logging
  logOperationStart(operation: string, id: number, data?: any) {
    const entry = this.createLogEntry(
      'info',
      'operation',
      `Operation started: ${operation} (ID: ${id})`,
      { operation, id, ...data }
    )
    this.log(entry)
  }

  logOperationComplete(operation: string, id: number, duration: number, data?: any) {
    const entry = this.createLogEntry(
      'info',
      'operation',
      `Operation completed: ${operation} (ID: ${id}) in ${duration.toFixed(2)}ms`,
      { operation, id, duration, ...data }
    )
    this.log(entry)
  }

  logOperationError(operation: string, id: number, error: Error, data?: any) {
    const entry = this.createLogEntry(
      'error',
      'operation',
      `Operation failed: ${operation} (ID: ${id}) - ${error.message}`,
      { operation, id, error: error.message, ...data }
    )
    this.log(entry)
  }

  logOperationTimeout(operation: string, id: number, timeout: number) {
    const entry = this.createLogEntry(
      'warn',
      'operation',
      `Operation timed out: ${operation} (ID: ${id}) after ${timeout}ms`,
      { operation, id, timeout }
    )
    this.log(entry)
  }

  // Error logging
  logWorkerError(error: ErrorEvent, context?: any) {
    const entry = this.createLogEntry(
      'error',
      'error',
      `Worker error: ${error.message}`,
      { 
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error?.message,
        ...context
      }
    )
    this.log(entry)
  }

  logValidationError(error: Error, context?: any) {
    const entry = this.createLogEntry(
      'error',
      'error',
      `Validation error: ${error.message}`,
      { error: error.message, ...context }
    )
    this.log(entry)
  }

  // Performance logging
  logPerformance(operation: string, duration: number, details?: any) {
    const level = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug'
    const entry = this.createLogEntry(
      level,
      'performance',
      `Performance: ${operation} took ${duration.toFixed(2)}ms`,
      { operation, duration, ...details }
    )
    this.log(entry)
  }

  logMemoryUsage(operation: string, memoryInfo: {
    pendingCount: number
    maxPending: number
    memoryEstimate?: number
  }) {
    const usage = memoryInfo.pendingCount / memoryInfo.maxPending
    const level = usage > 0.8 ? 'warn' : usage > 0.5 ? 'info' : 'debug'
    
    const entry = this.createLogEntry(
      level,
      'memory',
      `Memory usage for ${operation}: ${memoryInfo.pendingCount}/${memoryInfo.maxPending} (${(usage * 100).toFixed(1)}%)`,
      { operation, ...memoryInfo }
    )
    this.log(entry)
  }

  // Debug logging
  logDebug(message: string, data?: any) {
    const entry = this.createLogEntry('debug', 'state', message, data)
    this.log(entry)
  }

  // Utility methods
  getLogs(level?: LogLevel, category?: LogEntry['category']): LogEntry[] {
    return this.logs.filter(entry => {
      if (level && entry.level !== level) return false
      if (category && entry.category !== category) return false
      return true
    })
  }

  getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count)
  }

  getErrorLogs(): LogEntry[] {
    return this.logs.filter(entry => entry.level === 'error')
  }

  getPerformanceLogs(): LogEntry[] {
    return this.logs.filter(entry => entry.category === 'performance')
  }

  clearLogs() {
    this.logs = []
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  // Summary statistics
  getLogSummary() {
    const summary = {
      total: this.logs.length,
      byLevel: {} as Record<LogLevel, number>,
      byCategory: {} as Record<LogEntry['category'], number>,
      recentErrors: this.getRecentLogs(10).filter(entry => entry.level === 'error')
    }

    for (const entry of this.logs) {
      summary.byLevel[entry.level] = (summary.byLevel[entry.level] || 0) + 1
      summary.byCategory[entry.category] = (summary.byCategory[entry.category] || 0) + 1
    }

    return summary
  }

  // Development helper methods
  logStateDiagram() {
    if (!this.enabled) return

    const stateLogs = this.getLogs(undefined, 'state')
    console.group('🗺️ State Transition Diagram')
    
    stateLogs.forEach(entry => {
      const icon = entry.message.includes('→') ? '🔄' : '📍'
      console.log(`${icon} ${entry.message}`)
    })
    
    console.groupEnd()
  }

  logPerformanceReport() {
    if (!this.enabled) return

    const perfLogs = this.getPerformanceLogs()
    if (perfLogs.length === 0) {
      console.log('📊 No performance data available')
      return
    }

    console.group('📊 Performance Report')
    
    const operations = {} as Record<string, { count: number; total: number; max: number; min: number }>
    
    perfLogs.forEach(entry => {
      const { operation, duration } = entry.data
      if (!operations[operation]) {
        operations[operation] = { count: 0, total: 0, max: 0, min: Infinity }
      }
      
      const op = operations[operation]
      op.count++
      op.total += duration
      op.max = Math.max(op.max, duration)
      op.min = Math.min(op.min, duration)
    })

    Object.entries(operations).forEach(([operation, stats]) => {
      const avg = stats.total / stats.count
      console.log(`${operation}:`)
      console.log(`  Count: ${stats.count}`)
      console.log(`  Average: ${avg.toFixed(2)}ms`)
      console.log(`  Min: ${stats.min.toFixed(2)}ms`)
      console.log(`  Max: ${stats.max.toFixed(2)}ms`)
      console.log(`  Total: ${stats.total.toFixed(2)}ms`)
    })
    
    console.groupEnd()
  }

  logErrorReport() {
    if (!this.enabled) return

    const errorLogs = this.getErrorLogs()
    if (errorLogs.length === 0) {
      console.log('✅ No errors logged')
      return
    }

    console.group('❌ Error Report')
    console.log(`Total errors: ${errorLogs.length}`)
    
    errorLogs.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.message}`)
      if (entry.data) {
        console.log('   Data:', entry.data)
      }
    })
    
    console.groupEnd()
  }
}

// Global logger instance
export const workerLogger = new WorkerLogger()

// Development helper - expose to window for debugging
if (typeof window !== 'undefined' && workerLogger['enabled']) {
  (window as any).workerLogger = workerLogger
  console.log('🔧 WorkerLogger exposed to window.workerLogger for debugging')
}
