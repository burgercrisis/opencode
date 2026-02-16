/**
 * Centralized constants to prevent duplication across files
 */

// Lock system constants
export const LOCK = {
  MAX_CONCURRENT_READERS: 20,
  MAX_WAITING_READERS: 100,
  MAX_WAITING_WRITERS: 50,
} as const

// Tool system constants
export const TOOL = {
  // Diagnostics limits
  MAX_DIAGNOSTICS_PER_FILE: 20,
  MAX_PROJECT_DIAGNOSTICS_FILES: 5,
  
  // Edit tool limits
  MAX_PATTERN_LENGTH: 1000,
  MAX_WORD_COUNT: 100,
  MAX_LENGTH: 1000, // Levenshtein algorithm
  
  // Read tool limits
  DEFAULT_READ_LIMIT: 2000,
  MAX_BYTES: 50 * 1024,
  
  // Webfetch limits
  MAX_RESPONSE_SIZE: 5 * 1024 * 1024, // 5MB
  WEBFETCH_DEFAULT_TIMEOUT: 30 * 1000, // 30 seconds
  WEBFETCH_MAX_TIMEOUT: 120 * 1000, // 2 minutes
  
  // Bash tool limits
  MAX_METADATA_LENGTH: 30_000,
  BASH_DEFAULT_TIMEOUT: 2 * 60 * 1000, // 2 minutes
  
  // Grep tool limits
  MAX_LINE_LENGTH: 2000,
  MATCH_LIMIT: 250,
} as const

// Truncation constants
export const TRUNCATE = {
  MAX_LINES: 2000,
  MAX_BYTES: 50 * 1024,
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const

// Snapshot constants
export const SNAPSHOT = {
  VALIDATION_CACHE_TTL: 60000, // 1 minute cache TTL
  MAX_CACHE_SIZE: 100, // Maximum cache entries
} as const

// CLI constants
export const CLI = {
  MAX_STASH_ENTRIES: 50,
  MAX_FRECENCY_ENTRIES: 1000,
  MAX_HISTORY_ENTRIES: 50,
  MAX_RETRIES: 120,
} as const
