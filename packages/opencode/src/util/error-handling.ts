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
  cause?: Error
}

/**
 * Standardized error message formatter
 * Provides consistent formatting for different types of error messages
 */
export class ErrorMessageFormatter {
  /**
   * Formats a file operation error message
   */
  static formatFileError(message: string, filepath: string, operation: string, suggestions?: string[]): string {
    let formatted = `Failed to ${operation} file: ${filepath}`

    if (message && !message.includes(filepath)) {
      formatted += `. ${message}`
    }

    if (suggestions && suggestions.length > 0) {
      formatted += `\n\nSuggestions:\n${suggestions.map(s => `- ${s}`).join('\n')}`
    }

    return formatted
  }

  /**
   * Formats an HTTP request error message
   */
  static formatHttpError(message: string, status: number, url: string): string {
    let formatted = `HTTP ${status} error for ${url}`

    if (message && !message.includes(url)) {
      formatted += `. ${message}`
    }

    return formatted
  }

  /**
   * Formats a timeout error message
   */
  static formatTimeoutError(operation: string, timeout: number): string {
    return `Operation timed out after ${timeout}ms${operation ? ` while ${operation}` : ''}`
  }

  /**
   * Formats a validation error message
   */
  static formatValidationError(field: string, value: any, constraint: string): string {
    return `Invalid ${field}: ${value}. ${constraint}`
  }

  /**
   * Formats a "not found" error message
   */
  static formatNotFoundError(type: string, identifier: string, suggestions?: string[]): string {
    let formatted = `${type} not found: ${identifier}`

    if (suggestions && suggestions.length > 0) {
      formatted += `\n\nDid you mean:\n${suggestions.map(s => `- ${s}`).join('\n')}`
    }

    return formatted
  }

  /**
   * Formats a permission error message
   */
  static formatPermissionError(resource: string, action: string): string {
    return `Permission denied: Cannot ${action} ${resource}`
  }

  /**
   * Formats a generic error with context
   */
  static formatGenericError(message: string, context: ErrorContext): string {
    let formatted = message

    if (context.operation) {
      formatted = `Error during ${context.operation}: ${formatted}`
    }

    if (context.filepath) {
      formatted += ` (file: ${context.filepath})`
    }

    if (context.url) {
      formatted += ` (url: ${context.url})`
    }

    if (context.status) {
      formatted += ` (status: ${context.status})`
    }

    if (context.timeout) {
      formatted += ` (timeout: ${context.timeout}ms)`
    }

    if (context.suggestions && context.suggestions.length > 0) {
      formatted += `\n\nSuggestions:\n${context.suggestions.map(s => `- ${s}`).join('\n')}`
    }

    if (context.cause) {
      formatted += `\n\nCaused by: ${context.cause.message}`
    }

    return formatted
  }
}

/**
 * Creates a standardized error with context information
 */
export function createError(message: string, context: ErrorContext = {}): Error {
  // Use the formatter for consistent message formatting
  const formattedMessage = ErrorMessageFormatter.formatGenericError(message, context)
  const error = new Error(formattedMessage)

  // Add context properties to the error
  Object.assign(error, context)

  return error
}

/**
 * Creates an error with file operation context
 */
export function createFileError(message: string, filepath: string, operation: string, suggestions?: string[]): Error {
  const formattedMessage = ErrorMessageFormatter.formatFileError(message, filepath, operation, suggestions)
  return createError(formattedMessage, {
    filepath,
    operation,
    suggestions
  })
}

/**
 * Creates an error with HTTP request context
 */
export function createHttpError(message: string, status: number, url: string): Error {
  const formattedMessage = ErrorMessageFormatter.formatHttpError(message, status, url)
  return createError(formattedMessage, {
    status,
    url
  })
}

/**
 * Creates an error with timeout context
 */
export function createTimeoutError(message: string, timeout: number, operation?: string): Error {
  const formattedMessage = ErrorMessageFormatter.formatTimeoutError(operation || 'operation', timeout)
  return createError(formattedMessage, {
    timeout,
    operation
  })
}

/**
 * Utility functions for common error message patterns
 */
export const ErrorPatterns = {
  /**
   * Creates a "not found" error with consistent formatting
   */
  notFound(type: string, identifier: string, suggestions?: string[]): Error {
    const message = ErrorMessageFormatter.formatNotFoundError(type, identifier, suggestions)
    return createError(message, { suggestions })
  },

  /**
   * Creates a validation error with consistent formatting
   */
  validation(field: string, value: any, constraint: string): Error {
    const message = ErrorMessageFormatter.formatValidationError(field, value, constraint)
    return createError(message)
  },

  /**
   * Creates a permission error with consistent formatting
   */
  permission(resource: string, action: string): Error {
    const message = ErrorMessageFormatter.formatPermissionError(resource, action)
    return createError(message)
  },

  /**
   * Creates a "failed to" error with consistent formatting
   */
  failed(action: string, target: string, cause?: Error): Error {
    const message = `Failed to ${action} ${target}`
    return createError(message, { operation: action, cause })
  },

  /**
   * Creates a "cannot" error with consistent formatting
   */
  cannot(action: string, target: string, reason?: string): Error {
    const message = `Cannot ${action} ${target}${reason ? `: ${reason}` : ''}`
    return createError(message, { operation: action })
  },

  /**
   * Creates an "invalid" error with consistent formatting
   */
  invalid(type: string, value: any, expected?: string): Error {
    const message = `Invalid ${type}: ${value}${expected ? `. Expected: ${expected}` : ''}`
    return createError(message)
  },

  /**
   * Creates a "missing" error with consistent formatting
   */
  missing(type: string, name: string): Error {
    const message = `Missing ${type}: ${name}`
    return createError(message)
  },

  /**
   * Creates an "already exists" error with consistent formatting
   */
  alreadyExists(type: string, name: string): Error {
    const message = `${type} already exists: ${name}`
    return createError(message)
  }
}

// Export as ErrorHandling namespace to match existing usage
export const ErrorHandling = {
  createError,
  createFileError,
  createHttpError,
  createTimeoutError,
  ...ErrorPatterns,
  ErrorMessageFormatter
}
