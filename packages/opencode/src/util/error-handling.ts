/**
 * Error handling utilities for consistent error creation and management
 */

export interface ErrorContext {
  filepath?: string
  suggestions?: string[]
  operation?: string
  status?: number
  url?: string
  contentLength?: number
  actualSize?: number
  query?: string
  timeout?: number
}

/**
 * Creates a standardized error with context information
 */
export function createError(message: string, context: ErrorContext = {}): Error {
  const error = new Error(message)

  // Add context properties to the error
  Object.assign(error, context)

  return error
}

/**
 * Creates an error with file operation context
 */
export function createFileError(message: string, filepath: string, operation: string, suggestions?: string[]): Error {
  return createError(message, {
    filepath,
    operation,
    suggestions
  })
}

/**
 * Creates an error with HTTP request context
 */
export function createHttpError(message: string, status: number, url: string): Error {
  return createError(message, {
    status,
    url
  })
}

/**
 * Creates an error with timeout context
 */
export function createTimeoutError(message: string, timeout: number, operation?: string): Error {
  return createError(message, {
    timeout,
    operation
  })
}

// Export as ErrorHandling namespace to match existing usage
export const ErrorHandling = {
  createError,
  createFileError,
  createHttpError,
  createTimeoutError
}
