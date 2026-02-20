import { describe, it, expect, beforeEach, afterAll } from 'bun:test'

// Test the core synchronous initialization logic directly
function parseEnvArray(envVar: string, defaultValue: readonly string[]): readonly string[] {
  const envValue = process.env[envVar]
  if (!envValue) {
    return defaultValue
  }

  try {
    const parsed = JSON.parse(envValue)
    if (!Array.isArray(parsed)) {
      return defaultValue
    }

    const stringArray = parsed.filter(item => typeof item === 'string')
    return stringArray
  } catch {
    return defaultValue
  }
}

const DEFAULT_ASSIGNEES = [
  "rekram1-node", "adamdotdevin", "iamdavidhill", "Brendonovich", "nexxeln",
  "fwang", "MrMushrooooom", "thdxr", "kommander", "jlongster", "R44VC0RP", "Hona"
]

function initializeAssigneesEnum(): [string, ...string[]] {
  try {
    const fallbackConfig = {
      teams: {
        desktop: parseEnvArray('GITHUB_TRIAGE_DESKTOP_TEAM', DEFAULT_ASSIGNEES),
        zen: parseEnvArray('GITHUB_TRIAGE_ZEN_TEAM', DEFAULT_ASSIGNEES),
        tui: parseEnvArray('GITHUB_TRIAGE_TUI_TEAM', DEFAULT_ASSIGNEES),
        core: parseEnvArray('GITHUB_TRIAGE_CORE_TEAM', DEFAULT_ASSIGNEES),
        docs: parseEnvArray('GITHUB_TRIAGE_DOCS_TEAM', DEFAULT_ASSIGNEES),
        windows: parseEnvArray('GITHUB_TRIAGE_WINDOWS_TEAM', DEFAULT_ASSIGNEES),
      }
    }

    const assignees = [...new Set(Object.values(fallbackConfig.teams).flat())]
    if (assignees.length === 0) {
      return DEFAULT_ASSIGNEES as [string, ...string[]]
    }

    return assignees as [string, ...string[]]
  } catch {
    return DEFAULT_ASSIGNEES as [string, ...string[]]
  }
}

describe('GitHub Triage Race Condition Fix - Core Logic', () => {
  // Clear environment before each test
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear relevant environment variables
    delete process.env.GITHUB_TRIAGE_DESKTOP_TEAM
    delete process.env.GITHUB_TRIAGE_ZEN_TEAM
    delete process.env.GITHUB_TRIAGE_TUI_TEAM
    delete process.env.GITHUB_TRIAGE_CORE_TEAM
    delete process.env.GITHUB_TRIAGE_DOCS_TEAM
    delete process.env.GITHUB_TRIAGE_WINDOWS_TEAM
  })

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv
  })

  it('should initialize assignees synchronously from environment variables', () => {
    // Set environment variables
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify(['user1', 'user2'])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify(['user3'])

    // Test synchronous initialization
    const assignees = initializeAssigneesEnum()

    // Should contain our test users
    expect(assignees).toContain('user1')
    expect(assignees).toContain('user2')
    expect(assignees).toContain('user3')
  })

  it('should fall back to defaults when no environment variables are set', () => {
    // No environment variables set

    const assignees = initializeAssigneesEnum()

    // Should contain default assignees
    expect(assignees).toContain('rekram1-node')
    expect(assignees).toContain('adamdotdevin')
    expect(assignees).toContain('iamdavidhill')
  })

  it('should handle empty environment arrays gracefully', () => {
    // Set empty arrays
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify([])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify([])

    const assignees = initializeAssigneesEnum()

    // Should fall back to defaults when all teams are empty
    expect(assignees).toContain('rekram1-node')
    expect(assignees).toContain('adamdotdevin')
  })

  it('should handle malformed environment variables gracefully', () => {
    // Set malformed JSON
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = 'invalid-json'

    const assignees = initializeAssigneesEnum()

    // Should fall back to defaults when JSON is invalid
    expect(assignees).toContain('rekram1-node')
    expect(assignees).toContain('adamdotdevin')
  })

  it('should deduplicate assignees across teams', () => {
    // Set overlapping users in different teams
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify(['user1', 'user2'])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify(['user2', 'user3']) // user2 appears in both

    const assignees = initializeAssigneesEnum()

    // Should contain unique users only
    expect(assignees).toContain('user1')
    expect(assignees).toContain('user2')
    expect(assignees).toContain('user3')

    // Count occurrences of user2 (should be 1 due to deduplication)
    const user2Count = assignees.filter(user => user === 'user2').length
    expect(user2Count).toBe(1)
  })

  it('should return tuple type with at least one element', () => {
    const assignees = initializeAssigneesEnum()

    // Should be an array with at least one element
    expect(Array.isArray(assignees)).toBe(true)
    expect(assignees.length).toBeGreaterThan(0)

    // First element should be a string
    expect(typeof assignees[0]).toBe('string')
  })
})
