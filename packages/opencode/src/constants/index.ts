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
  MAX_DIAGNOSTICS_PER_FILE: 200,
  MAX_PROJECT_DIAGNOSTICS_FILES: 100,

  // Edit tool limits
  MAX_PATTERN_LENGTH: 10000,
  MAX_WORD_COUNT: 50000,
  MAX_LENGTH: 500000, // Levenshtein algorithm

  // Read tool limits
  DEFAULT_READ_LIMIT: 20000,
  MAX_BYTES: 2 * 1024 * 1024, // 2MB

  // Webfetch limits
  MAX_RESPONSE_SIZE: 50 * 1024 * 1024, // 50MB
  WEBFETCH_DEFAULT_TIMEOUT: 60 * 1000, // 60 seconds
  WEBFETCH_MAX_TIMEOUT: 300 * 1000, // 5 minutes

  // Bash tool limits
  MAX_METADATA_LENGTH: 100_000,
  BASH_DEFAULT_TIMEOUT: 10 * 60 * 1000, // 10 minutes

  // Grep tool limits
  MAX_LINE_LENGTH: 50000,
  MATCH_LIMIT: 5000,
} as const

// Truncation constants
export const TRUNCATE = {
  MAX_LINES: 10000,
  MAX_BYTES: 10 * 1024 * 1024, // 10MB
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const

// Snapshot constants
export const SNAPSHOT = {
  VALIDATION_CACHE_TTL: 60000, // 1 minute cache TTL
  MAX_CACHE_SIZE: 100, // Maximum cache entries
} as const

// CLI constants
export const CLI = {
  MAX_STASH_ENTRIES: 200,
  MAX_FRECENCY_ENTRIES: 5000,
  MAX_HISTORY_ENTRIES: 200,
  MAX_RETRIES: 300,
} as const
