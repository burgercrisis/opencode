/**
 * Shared types for markdown processing worker communication
 */

export interface WorkerMessage {
  type: "init" | "enhance"
  id: number
  html?: string
  theme?: any
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
    (data.theme === undefined || data.theme === null)
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
