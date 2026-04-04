/**
 * Shared types for markdown processing worker communication
 */

export interface WorkerMessage {
  type: "init" | "enhance"
  id: number
  html?: string
  theme?: any
  config?: MarkdownConfig
}

export interface WorkerResponse {
  id: number
  type: "enhanced" | "theme-initialized" | "error"
  html?: string
  error?: string | Error | { message: string }
}

/**
 * Worker state enumeration for proper lifecycle management
 */
export enum WorkerState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  TERMINATED = 'terminated'
}

/**
 * Performance metrics for worker operations
 */
export interface WorkerMetrics {
  initializationTime?: number
  enhancementTime?: number
  totalOperations: number
  averageEnhancementTime: number
  errorCount: number
}

/**
 * Validates worker message structure
 */
export function validateWorkerMessage(data: any): data is WorkerMessage {
  return data &&
    typeof data === 'object' &&
    typeof data.type === 'string' &&
    typeof data.id === 'number' &&
    (data.type === 'init' || data.type === 'enhance') &&
    (data.type === 'init' || (data.type === 'enhance' && typeof data.html === 'string')) &&
    (data.theme === undefined || data.theme === null) &&
    (data.config === undefined || (
      typeof data.config === 'object' &&
      typeof data.config.maxHtmlSize === 'number' &&
      typeof data.config.workerTimeout === 'number' &&
      typeof data.config.enableMetrics === 'boolean' &&
      data.config.maxHtmlSize > 0 &&
      data.config.workerTimeout > 0
    ))
}

/**
 * Validates worker response structure
 */
export function validateWorkerResponse(data: any): data is WorkerResponse {
  return data &&
    typeof data === 'object' &&
    typeof data.id === 'number' &&
    typeof data.type === 'string' &&
    ['enhanced', 'theme-initialized', 'error'].includes(data.type)
}

/**
 * Configuration options for markdown processing
 */
export interface MarkdownConfig {
  maxHtmlSize: number // Maximum HTML size in bytes
  workerTimeout: number // Worker operation timeout in milliseconds
  enableMetrics: boolean // Whether to collect performance metrics
}

/**
 * Default configuration values
 */
export const DEFAULT_MARKDOWN_CONFIG: MarkdownConfig = {
  maxHtmlSize: 1000000, // 1MB default limit
  workerTimeout: 10000, // 10 seconds default timeout
  enableMetrics: false // Metrics disabled by default
}

/**
 * Validates HTML content structure for security and processing safety
 */
export function validateHtmlContent(html: string): { isValid: boolean; error?: string } {
  // Check for potentially dangerous content
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi, // Script tags
    /<iframe[^>]*>.*?<\/iframe>/gi, // Iframe tags
    /<object[^>]*>.*?<\/object>/gi, // Object tags
    /<embed[^>]*>/gi, // Embed tags
    /javascript:/gi, // JavaScript URLs
    /vbscript:/gi, // VBScript URLs
    /on\w+\s*=/gi // Event handlers
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(html)) {
      return {
        isValid: false,
        error: 'HTML contains potentially dangerous content that cannot be processed'
      }
    }
  }

  // Check for extremely nested structures that could cause performance issues
  const maxNestingLevel = 100
  const openTagRegex = /<[^\/][^>]*>/g
  const closeTagRegex = /<\/[^>]*>/g

  let nestingLevel = 0
  let maxDepth = 0

  const openTags = html.match(openTagRegex) || []
  const closeTags = html.match(closeTagRegex) || []

  for (let i = 0; i < openTags.length; i++) {
    nestingLevel++
    maxDepth = Math.max(maxDepth, nestingLevel)

    if (i < closeTags.length) {
      nestingLevel--
    }
  }

  if (maxDepth > maxNestingLevel) {
    return {
      isValid: false,
      error: `HTML nesting level too deep (${maxDepth}). Maximum allowed is ${maxNestingLevel}`
    }
  }

  return { isValid: true }
}
