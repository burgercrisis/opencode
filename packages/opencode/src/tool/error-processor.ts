/**
 * Unified Error Processing Framework for Bash Tool
 * 
 * This framework consolidates error processing logic across different shell types
 * to reduce code duplication, improve maintainability, and simplify testing.
 */

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'sh' | 'zsh' | 'fish' | 'unknown'

export interface ProcessedOutput {
  output: string
  hasErrors: boolean
  exitCode?: number
}

export interface ErrorPattern {
  name: string
  pattern: RegExp
  processor: (match: RegExpMatchArray, command: string) => string
  priority: number // Lower numbers = higher priority
}

export interface ErrorProcessor {
  shellType: ShellType
  detect(output: string, command: string): boolean
  process(output: string, command: string): ProcessedOutput
  getPatterns(): ErrorPattern[]
}

export class UnifiedErrorProcessor {
  private processors = new Map<ShellType, ErrorProcessor>()
  private fallbackProcessor: ErrorProcessor

  constructor() {
    this.fallbackProcessor = new UnknownShellProcessor()
  }

  /**
   * Register an error processor for a specific shell type
   */
  register(processor: ErrorProcessor): void {
    this.processors.set(processor.shellType, processor)
  }

  /**
   * Process output using the appropriate shell processor
   */
  process(output: string, command: string, shellType: ShellType): ProcessedOutput {
    const processor = this.processors.get(shellType) || this.fallbackProcessor
    return processor.process(output, command)
  }

  /**
   * Detect if output contains errors for a specific shell type
   */
  detect(output: string, command: string, shellType: ShellType): boolean {
    const processor = this.processors.get(shellType) || this.fallbackProcessor
    return processor.detect(output, command)
  }

  /**
   * Get all registered processors
   */
  getProcessors(): Map<ShellType, ErrorProcessor> {
    return new Map(this.processors)
  }

  /**
   * Get processor for a specific shell type
   */
  getProcessor(shellType: ShellType): ErrorProcessor | undefined {
    return this.processors.get(shellType)
  }
}

/**
 * Base class for error processors with common functionality
 */
export abstract class BaseErrorProcessor implements ErrorProcessor {
  abstract shellType: ShellType
  protected patterns: ErrorPattern[] = []

  /**
   * Detect if output contains errors
   */
  detect(output: string, command: string): boolean {
    return this.patterns.some(pattern => pattern.pattern.test(output))
  }

  /**
   * Process output by applying error patterns
   */
  process(output: string, command: string): ProcessedOutput {
    let processed = output
    let hasErrors = false
    let exitCode: number | undefined

    // Sort patterns by priority (lower numbers first), then by pattern specificity and creation order
    const sortedPatterns = [...this.patterns].sort((a, b) => {
      // Primary sort: priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }

      // Secondary sort: pattern specificity (longer patterns are more specific)
      const aSpecificity = a.pattern.source.length
      const bSpecificity = b.pattern.source.length
      if (aSpecificity !== bSpecificity) {
        return bSpecificity - aSpecificity // More specific patterns first
      }

      // Tertiary sort: pattern name for deterministic ordering
      return a.name.localeCompare(b.name)
    })

    for (const pattern of sortedPatterns) {
      if (pattern.pattern.test(processed)) {
        processed = processed.replace(pattern.pattern, (match, ...args) => {
          const currentMatch = [match, ...args] as RegExpMatchArray
          const result = pattern.processor(currentMatch, command)
          if (result.includes("Error:") || result.includes("error")) {
            hasErrors = true
          }
          return result
        })
      }
    }

    // Additional shell-specific error detection
    // Check both original and processed output for shell-specific errors
    const originalErrors = this.detectShellSpecificErrors(output, command)
    const processedErrors = this.detectShellSpecificErrors(processed, command)

    if (originalErrors.hasErrors || processedErrors.hasErrors) {
      hasErrors = true
      // Prefer exit code from processed errors, fallback to original
      exitCode = processedErrors.exitCode || originalErrors.exitCode
    }

    return { output: processed, hasErrors, exitCode }
  }

  /**
   * Get all error patterns for this processor
   */
  getPatterns(): ErrorPattern[] {
    return [...this.patterns]
  }

  /**
   * Add an error pattern
   */
  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern)
  }

  /**
   * Shell-specific error detection logic
   * Override in subclasses for custom error detection
   */
  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    return { hasErrors: false }
  }

  /**
   * Helper method to create error patterns
   */
  protected createErrorPattern(
    name: string,
    pattern: RegExp,
    replacement: string | ((match: RegExpMatchArray, command: string) => string),
    priority = 10
  ): ErrorPattern {
    const processor = typeof replacement === 'string'
      ? () => replacement
      : replacement

    return { name, pattern, processor, priority }
  }
}

/**
 * Fallback processor for unknown shell types
 */
export class UnknownShellProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'unknown'

  constructor() {
    super()
    // Add basic error patterns that work across most shells
    this.addPattern(
      this.createErrorPattern(
        'command-not-found',
        /command not found|not recognized|cannot be found|error|exception|failed|cannot|denied/gi,
        "Error: Command not found. Please check the spelling and ensure the command is available in your PATH.",
        1
      )
    )
  }

  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    // Basic error detection for unknown shells
    const hasErrors = /error|exception|failed|cannot|denied/gi.test(output)
    return { hasErrors }
  }
}

/**
 * Statistics and monitoring for error processing
 */
export interface ErrorProcessorStats {
  shellType: ShellType
  totalProcessed: number
  errorsDetected: number
  patternsMatched: Record<string, number>
  averageProcessingTime: number
}

export class ErrorProcessorMonitor {
  private stats = new Map<ShellType, ErrorProcessorStats>()

  /**
   * Record processing statistics
   */
  record(shellType: ShellType, processingTime: number, patternsMatched: string[], hasErrors: boolean): void {
    if (!this.stats.has(shellType)) {
      this.stats.set(shellType, {
        shellType,
        totalProcessed: 0,
        errorsDetected: 0,
        patternsMatched: {},
        averageProcessingTime: 0,
      })
    }

    const stats = this.stats.get(shellType)!
    stats.totalProcessed++
    if (hasErrors) stats.errorsDetected++

    // Update pattern match counts
    for (const pattern of patternsMatched) {
      stats.patternsMatched[pattern] = (stats.patternsMatched[pattern] || 0) + 1
    }

    // Update average processing time
    stats.averageProcessingTime =
      (stats.averageProcessingTime * (stats.totalProcessed - 1) + processingTime) / stats.totalProcessed
  }

  /**
   * Get statistics for all processors
   */
  getStats(): Map<ShellType, ErrorProcessorStats> {
    return new Map(this.stats)
  }

  /**
   * Get statistics for a specific shell type
   */
  getStatsForShell(shellType: ShellType): ErrorProcessorStats | undefined {
    return this.stats.get(shellType)
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.stats.clear()
  }

  /**
   * Reset statistics for a specific shell type
   */
  resetForShell(shellType: ShellType): void {
    this.stats.delete(shellType)
  }
}
