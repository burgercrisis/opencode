/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./github-triage.txt"

// Use Node.js fs and path modules for synchronous file reading
import fs from 'fs'
import path from 'path'
const MAX_ISSUE_TITLE_LENGTH = 1000
const MAX_ISSUE_BODY_LENGTH = 10000
const MAX_JSON_SIZE_BYTES = 100 * 1024 // 100KB limit for JSON strings

// Security constants
const DANGEROUS_PATTERNS = [
  '__proto__', 'constructor', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'toString', 'valueOf',
]

// Safer individual patterns to prevent catastrophic backtracking
const DANGEROUS_JSON_PATTERNS = [
  /"__proto__"\s*:\s*["'{[]/i,
  /"constructor"\s*:\s*["'{[]/i,
  /"prototype"\s*:\s*["'{[]/i,
  /\["(?:__proto__|constructor|prototype)"\]\s*=/i,
  /"__proto__"\s*:\s*\{/i,
  /"constructor"\s*:\s*\{/i,
  /"prototype"\s*:\s*\{/i,
  /"__defineGetter__"\s*:\s*/i,
  /"__defineSetter__"\s*:\s*/i,
  /"__lookupGetter__"\s*:\s*/i,
  /"__lookupSetter__"\s*:\s*/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /setTimeout\s*\(/i,
  /setInterval\s*\(/i,
  /new\s+Function\s*\(/i,
  /\bbind\s*\(/i,
  /\bcall\s*\(/i,
  /\bapply\s*\(/i
]

// Simplified nested patterns (keeping only the most reliable ones)
const OPTIMIZED_NESTED_PATTERNS = [
  /"__proto__"\s*:\s*\{/i,
  /"constructor"\s*:\s*\{/i,
  /"prototype"\s*:\s*\{/i
]

// Combined bracket notation patterns
const COMBINED_BRACKET_PATTERNS = /\[\s*["'](?:__proto__|constructor|prototype|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)["']\s*\]/i

// Advanced prototype pollution detection with optimized performance
function detectPrototypePollution(jsonString: string): boolean {
  if (typeof jsonString !== 'string') return false

  // Check individual dangerous patterns to prevent catastrophic backtracking
  for (const pattern of DANGEROUS_JSON_PATTERNS) {
    if (pattern.test(jsonString)) {
      console.warn(`Dangerous JSON pattern detected: ${pattern.source}`)
      return true
    }
  }

  // Check simplified nested patterns (fewer, more reliable)
  for (const pattern of OPTIMIZED_NESTED_PATTERNS) {
    if (pattern.test(jsonString)) {
      console.warn('Nested prototype pollution pattern detected')
      return true
    }
  }

  // Check combined bracket notation pattern
  if (COMBINED_BRACKET_PATTERNS.test(jsonString)) {
    console.warn('Bracket notation pollution pattern detected')
    return true
  }

  return false
}

// Security-safe JSON parsing with comprehensive prototype pollution protection
function safeJsonParse(jsonString: string, fallback: any): any {
  if (typeof jsonString !== 'string') return fallback

  // Input size validation to prevent DoS through extremely large environment variables
  if (jsonString.length > MAX_JSON_SIZE_BYTES) {
    console.warn(`Environment variable JSON string too large (${jsonString.length} > ${MAX_JSON_SIZE_BYTES} characters), using fallback`)
    return fallback
  }

  // Multiple layers of protection against prototype pollution
  try {
    // First, comprehensive pattern detection
    if (detectPrototypePollution(jsonString)) {
      console.warn('Environment variable contains potentially dangerous prototype pollution pattern')
      return fallback
    }

    // Parse the JSON
    const parsed = JSON.parse(jsonString)

    // Deep sanitize the parsed object to remove any dangerous properties
    return sanitizeObject(parsed)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Failed to parse JSON from environment variable: ${error instanceof Error ? error.message : String(error)}`)
    }
    return fallback
  }
}

// Helper function to check if a key is dangerous
function isDangerousKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().trim()

  // Direct dangerous patterns
  if (DANGEROUS_PATTERNS.includes(key) || DANGEROUS_PATTERNS.includes(normalizedKey)) {
    return true
  }

  // Partial matches for dangerous patterns
  const dangerousSubstrings = ['__proto__', 'constructor', 'prototype', '__definegetter__', '__definesetter__', '__lookupgetter__', '__lookupsetter__']
  if (dangerousSubstrings.some(sub => normalizedKey.includes(sub))) {
    return true
  }

  // Common encoded variations
  const encodedPatterns = [
    '%5F%5Fproto%5F%5F', // URL encoded __proto__
    '\u005f\u005fproto\u005f\u005f', // Unicode encoded
    '\x5f\x5fproto\x5f\x5f', // Hex encoded
    'X19fcm9vdG9fXw==', // base64 for __proto__
    'Y29uc3RydWN0b3I=', // base64 for constructor
    'cHJvdG90eXBl' // base64 for prototype
  ]

  return encodedPatterns.some(pattern => key.includes(pattern))
}

// Deep object sanitization to prevent prototype pollution
function sanitizeObject(obj: any, depth = 0, seen = new WeakSet(), maxSize = 10000): any {
  // Prevent infinite recursion and circular references
  if (depth > 10 || seen.has(obj)) {
    return obj
  }

  // Prevent memory exhaustion from overly large inputs
  if (typeof obj === 'object' && obj !== null) {
    // Count total object/array size to prevent DoS
    const size = countObjectSize(obj)
    if (size > maxSize) {
      console.warn(`Object too large for sanitization (${size} > ${maxSize}), skipping sanitization`)
      return obj // Return unsanitized but don't crash
    }
  }

  // Add to seen set for circular reference detection
  if (typeof obj === 'object' && obj !== null) {
    seen.add(obj)
  }

  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, seen, maxSize))
  }

  // Create a clean object without prototype chain
  const clean: Record<string, any> = Object.create(null)

  for (const key of Object.keys(obj)) {
    // Simplified dangerous key checking
    if (isDangerousKey(key)) {
      console.warn(`Skipping dangerous key during sanitization`, key)
      continue
    }

    // Recursively sanitize nested objects
    try {
      clean[key] = sanitizeObject(obj[key], depth + 1, seen, maxSize)
    } catch (error) {
      console.warn(`Failed to sanitize key '${key}', skipping`, error instanceof Error ? error.message : String(error))
      continue
    }
  }

  return clean
}

// Helper function to count object size for DoS prevention
function countObjectSize(obj: any, seen = new WeakSet(), depth = 0, maxDepth = 20): number {
  // Prevent infinite recursion and circular references
  if (depth > maxDepth) {
    return 1 // Count as single item to avoid over-counting deep structures
  }

  if (obj === null || typeof obj !== 'object') {
    return 1
  }

  if (seen.has(obj)) {
    return 0 // Circular reference, count as 0 to avoid double-counting
  }

  seen.add(obj)
  let size = 1 // Count the object/array itself

  if (Array.isArray(obj)) {
    for (const item of obj) {
      size += countObjectSize(item, seen, depth + 1, maxDepth)
    }
  } else {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        size += 1 // Count each property
        size += countObjectSize(obj[key], seen, depth + 1, maxDepth)
      }
    }
  }

  return size
}

// Load team configuration from external file with fallback
interface TeamStructure {
  readonly desktop: readonly string[]
  readonly zen: readonly string[]
  readonly tui: readonly string[]
  readonly core: readonly string[]
  readonly docs: readonly string[]
  readonly windows: readonly string[]
}

interface TeamConfig {
  teams: TeamStructure
  labelMappings: Record<string, string>
  assigneeMappings: Record<string, string>
}

// Default configuration fallback
const DEFAULT_TEAM_CONFIG: TeamConfig = {
  teams: {
    desktop: ["adamdotdevin", "iamdavidhill", "Brendonovich", "nexxeln"],
    zen: ["fwang", "MrMushrooooom"],
    tui: ["thdxr", "kommander", "rekram1-node"],
    core: ["thdxr", "rekram1-node", "jlongster"],
    docs: ["R44VC0RP"],
    windows: ["Hona"]
  },
  labelMappings: {
    "desktop": "web"
  },
  assigneeMappings: {
    "jlongster": "thdxr"
  }
}

let teamConfig: TeamConfig
try {
  // Use Node.js fs module for synchronous file reading
  const configPath = path.resolve(__dirname, 'team-config.json')

  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8')
    teamConfig = safeJsonParse(configContent, DEFAULT_TEAM_CONFIG) as TeamConfig

    // Validate the loaded configuration has required structure
    if (!teamConfig.teams || !teamConfig.labelMappings || !teamConfig.assigneeMappings) {
      throw new Error('Invalid team configuration structure: missing required properties')
    }

    // Validate configuration contents
    validateTeamConfig(teamConfig)
    console.log('Successfully loaded team configuration from team-config.json')
  } else {
    throw new Error('team-config.json file not found')
  }
} catch (error) {
  let errorMessage = "Unknown configuration loading error"

  if (error instanceof Error) {
    // Handle specific file system errors
    if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
      errorMessage = `Permission denied reading team-config.json: ${error.message}`
    } else if (error.message.includes('ENOENT')) {
      errorMessage = `team-config.json file not found: ${error.message}`
    } else if (error.message.includes('SyntaxError') || error.message.includes('JSON')) {
      errorMessage = `Invalid JSON in team-config.json: ${error.message}`
    } else {
      errorMessage = `Configuration loading error: ${error.message}`
    }
  }

  console.warn(`Failed to load team-config.json, using default configuration: ${errorMessage}`)
  teamConfig = DEFAULT_TEAM_CONFIG
}

function validateTeamConfig(config: TeamConfig): void {
  // Validate teams structure
  const requiredTeams = ['desktop', 'zen', 'tui', 'core', 'docs', 'windows']
  for (const team of requiredTeams) {
    if (!config.teams[team as keyof TeamStructure] || !Array.isArray(config.teams[team as keyof TeamStructure])) {
      throw new Error(`Invalid team configuration: missing or invalid ${team} team`)
    }
  }

  // Validate label mappings
  if (typeof config.labelMappings !== 'object' || config.labelMappings === null) {
    throw new Error('Invalid label mappings: must be an object')
  }

  // Validate assignee mappings
  if (typeof config.assigneeMappings !== 'object' || config.assigneeMappings === null) {
    throw new Error('Invalid assignee mappings: must be an object')
  }
}

const TEAM: TeamStructure = teamConfig.teams

const ASSIGNEES = [...new Set(Object.values(TEAM).flat())]

// Type-safe function to create enum tuple with runtime validation
function createAssigneeEnum(assignees: readonly string[]): [string, ...string[]] {
  if (assignees.length === 0) {
    throw new Error("ASSIGNEES array cannot be empty")
  }
  return assignees as [string, ...string[]]
}

const ASSIGNEES_ENUM = createAssigneeEnum(ASSIGNEES)

// Export for testing
export const getAssigneesEnum = () => ASSIGNEES_ENUM

function pick<T>(items: readonly T[], seed: number): T {
  // Deterministic selection based on seed to ensure consistent assignments
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty array')
  }
  const index = seed % items.length
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Array access returned undefined at index ${index}`)
  }
  return item
}

function getIssueNumber(): number {
  const issue = parseInt(process.env.ISSUE_NUMBER ?? "", 10)
  if (!issue) throw new Error("ISSUE_NUMBER env var not set")
  return issue
}

function getIssueContent(): string {
  // Comprehensive validation of environment variables
  const titleEnv = process.env.ISSUE_TITLE
  const bodyEnv = process.env.ISSUE_BODY

  // Validate that environment variables are properly set and are strings
  if (titleEnv !== undefined && titleEnv !== null && typeof titleEnv !== 'string') {
    throw new Error(`ISSUE_TITLE environment variable must be a string, got ${typeof titleEnv}`)
  }
  if (bodyEnv !== undefined && bodyEnv !== null && typeof bodyEnv !== 'string') {
    throw new Error(`ISSUE_BODY environment variable must be a string, got ${typeof bodyEnv}`)
  }

  const title = typeof titleEnv === 'string' ? titleEnv.trim() : ""
  const body = typeof bodyEnv === 'string' ? bodyEnv.trim() : ""

  // Additional validation to ensure we're working with valid strings
  if (title.length > MAX_ISSUE_TITLE_LENGTH) {
    throw new Error(`Issue title too long (max ${MAX_ISSUE_TITLE_LENGTH} characters)`)
  }
  if (body.length > MAX_ISSUE_BODY_LENGTH) {
    throw new Error(`Issue body too long (max ${MAX_ISSUE_BODY_LENGTH} characters)`)
  }

  // Content sanitization for dangerous patterns - check before lowercase conversion
  const originalContent = `${title}\n${body}`

  // Validate minimum content length to prevent processing empty issues
  if (originalContent.trim().length === 0) {
    throw new Error("Issue content cannot be empty")
  }

  // Check for dangerous content patterns on original case
  if (detectPrototypePollution(originalContent)) {
    throw new Error("Issue content contains potentially dangerous patterns")
  }

  // Additional content validation - use original case for case-sensitive patterns
  const dangerousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(originalContent)) {
      throw new Error("Issue content contains potentially dangerous script patterns")
    }
  }

  // Convert to lowercase only for case-insensitive text matching
  const content = originalContent.toLowerCase()

  return content
}

function validateAssigneeLabel(assignee: string, requiredLabel: string, labels: string[]): void {
  // Get the appropriate team for the required label
  const teamMembers = (() => {
    switch (requiredLabel) {
      case "windows": return TEAM.windows
      case "docs": return TEAM.docs
      case "opentui": return TEAM.tui
      case "zen": return TEAM.zen
      default: return []
    }
  })()

  // Validate both directions:
  // 1. If assignee is in the specialty team, issue must have the specialty label
  // 2. If issue has specialty label, assignee must be in the specialty team

  if (teamMembers.includes(assignee) && !labels.includes(requiredLabel)) {
    throw new Error(`Only ${requiredLabel} issues should be assigned to ${assignee}`)
  }

  if (labels.includes(requiredLabel) && !teamMembers.includes(assignee)) {
    throw new Error(`${requiredLabel} issues must be assigned to team members: ${teamMembers.join(", ")}`)
  }
}

// Constants for configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_RATE_LIMIT_DELAY_MS = 60000

// Network error codes for proper error detection
const RETRYABLE_ERROR_CODES = [
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'
]

// Enhanced error detection for retryable errors
function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase()

  // Check for specific network error codes
  const hasRetryableCode = RETRYABLE_ERROR_CODES.some(code =>
    errorMessage.includes(code.toLowerCase())
  )

  // Check for network-related error messages
  const networkErrorPatterns = [
    'fetch failed',
    'network error',
    'connection refused',
    'connection timeout',
    'connection reset',
    'name resolution failed',
    'timeout',
    'socket hang up',
    'econnreset',
    'etimedout',
    'enotfound',
    'econnrefused',
    'ehostunreach',
    'enetunreach',
    'epipe'
  ]

  const hasNetworkError = networkErrorPatterns.some(pattern =>
    errorMessage.includes(pattern)
  )

  // Check for specific error types that are retryable
  const retryableErrorTypes = [
    'TypeError',
    'NetworkError',
    'AbortError'
  ]

  const hasRetryableType = retryableErrorTypes.includes(error.name)

  return hasRetryableCode || hasNetworkError || hasRetryableType
}

async function githubFetch(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  // Validate GitHub token presence
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required for GitHub API calls')
  }

  const url = `https://api.github.com${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      let errorDetails = ""
      try {
        const errorBody = await response.text()
        errorDetails = ` | Response: ${errorBody}`
      } catch (e) {
        errorDetails = " | Could not read error response"
      }

      // Check if this is a retryable HTTP error
      if (retryCount < MAX_RETRIES && (
        response.status >= 500 || // Server errors
        response.status === 429 ||  // Rate limiting
        response.status === 408 ||  // Request timeout
        response.status === 502 ||  // Bad gateway
        response.status === 503 ||  // Service unavailable
        response.status === 504     // Gateway timeout
      )) {
        const delay = response.status === 429
          ? Math.min(MAX_RATE_LIMIT_DELAY_MS, BASE_DELAY_MS * Math.pow(2, retryCount + 1)) // Longer delay for rate limiting
          : BASE_DELAY_MS * Math.pow(2, retryCount) // Standard exponential backoff

        if (process.env.NODE_ENV !== 'production') {
          console.warn(`GitHub API error ${response.status}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES}): ${response.statusText}${errorDetails}`)
        }
        await new Promise(resolve => setTimeout(resolve, delay))
        return githubFetch(endpoint, options, retryCount + 1)
      }

      throw new Error(`GitHub API error: ${response.status} ${response.statusText} | Endpoint: ${endpoint} | Method: ${options.method || 'GET'}${errorDetails}`)
    }

    // Parse and validate JSON response
    let jsonResponse: any
    try {
      jsonResponse = await response.json()
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response from GitHub API: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    }

    // Basic response validation - ensure we got an object
    if (typeof jsonResponse !== 'object' || jsonResponse === null) {
      throw new Error(`GitHub API returned invalid response format: expected object, got ${typeof jsonResponse}`)
    }

    return jsonResponse
  } catch (error) {
    // Enhanced retry logic for transient network failures
    if (retryCount < MAX_RETRIES && error instanceof Error && isRetryableError(error)) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount) // Exponential backoff
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`GitHub API request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, delay))
      return githubFetch(endpoint, options, retryCount + 1)
    }

    // Re-throw non-retryable errors or max retries exceeded
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error(String(error))
    }
  }
}

// Execution lock to prevent concurrent operations on the same issue
let executionLock: string | null = null

export default tool({
  description: DESCRIPTION,
  args: {
    assignee: tool.schema
      .enum(ASSIGNEES_ENUM)
      .describe("The username of assignee")
      .default("rekram1-node"),
    labels: tool.schema
      .array(tool.schema.enum(["nix", "opentui", "perf", "web", "zen", "docs", "windows", "core"]))
      .describe("The labels(s) to add to issue")
      .default([]),
  },
  async execute(args) {
    const issue = getIssueNumber()
    const owner = "anomalyco"
    const repo = "opencode"
    const issueLockKey = `issue-${issue}`

    // Check for concurrent execution on the same issue
    if (executionLock === issueLockKey) {
      throw new Error(`Another triage operation is already in progress for issue #${issue}. Please wait for it to complete.`)
    }

    // Acquire lock for this issue
    executionLock = issueLockKey

    try {

      const results: string[] = []
      let labels = [...new Set(args.labels.map((x) => teamConfig.labelMappings[x] ?? x))]
      const web = labels.includes("web")
      const text = getIssueContent()
      const zen = /\bzen\b/.test(text) || text.includes("opencode black")
      const nix = /\bnix(os)?\b/.test(text)

      if (labels.includes("nix") && !nix) {
        labels = labels.filter((x) => x !== "nix")
        results.push("Dropped label: nix (issue does not mention nix)")
      }

      // Fixed logic: handle web + nix combination properly
      let assignee: string
      if (nix && web) {
        // Issues that mention both web and nix should be assigned to rekram1-node for coordination
        assignee = "rekram1-node"
      } else if (nix) {
        assignee = "rekram1-node"
      } else if (web) {
        assignee = pick(TEAM.desktop, issue)
      } else {
        // Validate assignee mapping exists and points to valid assignee
        const mappedAssignee = teamConfig.assigneeMappings[args.assignee]
        if (mappedAssignee && ASSIGNEES.includes(mappedAssignee)) {
          assignee = mappedAssignee
        } else if (mappedAssignee && !ASSIGNEES.includes(mappedAssignee)) {
          throw new Error(`Assignee mapping for ${args.assignee} points to invalid assignee: ${mappedAssignee}`)
        } else {
          assignee = args.assignee
        }
      }

      // Log assignee mapping if applicable
      const mappedAssignee = teamConfig.assigneeMappings[args.assignee]
      if (mappedAssignee && mappedAssignee !== args.assignee) {
        results.push(`Remapped assignee: ${args.assignee} -> ${mappedAssignee}`)
      }

      if (labels.includes("zen") && !zen) {
        throw new Error("Only add zen label when issue title/body contains 'zen' or 'opencode black'")
      }

      // Comprehensive validation: ensure web issues are properly assigned regardless of nix status
      if (web && !nix && !TEAM.desktop.includes(assignee)) {
        throw new Error("Web issues must be assigned to adamdotdevin, iamdavidhill, Brendonovich, or nexxeln")
      }

      // Validate team member assignments with required labels (only for cases not covered above)
      validateAssigneeLabel(assignee, "docs", labels)
      validateAssigneeLabel(assignee, "opentui", labels)
      validateAssigneeLabel(assignee, "windows", labels)
      validateAssigneeLabel(assignee, "zen", labels)

      // Execute API calls sequentially with rollback capability
      const executedCalls: Array<{ endpoint: string; method: string; rollback?: () => Promise<void>; canRollback: boolean }> = []
      let originalAssignees: string[] = []
      let originalLabels: string[] = []
      let canRollbackSafely = false

      try {
        // First, fetch current assignees and labels to enable proper rollback
        try {
          const currentIssue = await githubFetch(`/repos/${owner}/${repo}/issues/${issue}`)
          originalAssignees = currentIssue.assignees?.map((a: any) => a.login) || []
          originalLabels = currentIssue.labels?.map((l: any) => typeof l === 'string' ? l : l.name) || []
          canRollbackSafely = true
        } catch (fetchError) {
          // If we can't fetch current state, skip rollback to prevent accidental data loss
          console.warn(`Could not fetch current issue state for rollback preparation: ${fetchError}. Rollback will be skipped to prevent accidental data loss.`)
        }

        // Always attempt assignment first
        executedCalls.push({
          endpoint: `/repos/${owner}/${repo}/issues/${issue}/assignees`,
          method: "POST",
          canRollback: canRollbackSafely,
          rollback: canRollbackSafely ? async () => {
            // Restore original assignees if assignment was successful
            try {
              await githubFetch(`/repos/${owner}/${repo}/issues/${issue}/assignees`, {
                method: "PUT",
                body: JSON.stringify({ assignees: originalAssignees }),
              })
            } catch (rollbackError) {
              console.error(`Failed to restore original assignees during rollback:`, rollbackError)
            }
          } : undefined
        })

        await githubFetch(`/repos/${owner}/${repo}/issues/${issue}/assignees`, {
          method: "POST",
          body: JSON.stringify({ assignees: [assignee] }),
        })
        results.push(`Assigned @${assignee} to issue #${issue}`)

        // Add labels if any exist
        if (labels.length > 0) {
          executedCalls.push({
            endpoint: `/repos/${owner}/${repo}/issues/${issue}/labels`,
            method: "POST",
            canRollback: canRollbackSafely,
            rollback: canRollbackSafely ? async () => {
              // Restore original labels if labeling was successful
              try {
                await githubFetch(`/repos/${owner}/${repo}/issues/${issue}/labels`, {
                  method: "PUT",
                  body: JSON.stringify({ labels: originalLabels }),
                })
              } catch (rollbackError) {
                console.error(`Failed to restore original labels during rollback:`, rollbackError)
              }
            } : undefined
          })

          await githubFetch(`/repos/${owner}/${repo}/issues/${issue}/labels`, {
            method: "POST",
            body: JSON.stringify({ labels }),
          })
          results.push(`Added labels: ${labels.join(", ")}`)
        }
      } catch (error) {
        // Rollback all successful operations in reverse order, but only if we can rollback safely
        if (canRollbackSafely) {
          for (const call of executedCalls.reverse()) {
            try {
              if (call.rollback && call.canRollback) {
                await call.rollback()
                if (process.env.NODE_ENV !== 'production') {
                  console.warn(`Rolled back ${call.method} ${call.endpoint}`)
                }
              }
            } catch (rollbackError) {
              // Log rollback failure but continue with other rollbacks
              console.error(`Failed to rollback ${call.method} ${call.endpoint}:`, rollbackError)
            }
          }
        } else {
          console.warn('Skipping rollback due to unknown original state - manual cleanup may be required')
        }

        throw new Error(`Failed to update issue #${issue}. ${canRollbackSafely ? 'All changes have been rolled back to maintain consistency.' : 'Rollback could not be performed due to fetch failure.'} Error: ${error instanceof Error ? error.message : String(error)}`)
      }

      return results.join("\n")
    } finally {
      // Always release the execution lock
      executionLock = null
    }
  },
})
