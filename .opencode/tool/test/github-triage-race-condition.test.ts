import { describe, it, expect } from 'bun:test'
import { getAssigneesEnum } from '../github-triage'

describe('GitHub Triage Race Condition Fix', () => {
  // Note: Due to module caching, we'll test the core logic rather than full module reloads

  it('should initialize ASSIGNEES_ENUM synchronously from environment variables', async () => {
    // Set environment variables
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify(['user1', 'user2'])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify(['user3'])
    process.env.NODE_ENV = 'test'

    // Import the module (this will trigger synchronous initialization)
    const githubTriageModule = await import('../github-triage.ts')

    // The tool should be available immediately with correct assignees
    expect(githubTriageModule.default).toBeDefined()

    // The enum should contain our test users
    const assigneeEnum = getAssigneesEnum()
    expect(assigneeEnum).toContain('user1')
    expect(assigneeEnum).toContain('user2')
    expect(assigneeEnum).toContain('user3')
  })

  it('should fall back to defaults when no environment variables are set', async () => {
    process.env.NODE_ENV = 'test'

    // Import the module (should use defaults)
    const githubTriageModule = await import('../github-triage.ts')

    expect(githubTriageModule.default).toBeDefined()

    const assigneeEnum = getAssigneesEnum()

    // Should contain default assignees
    expect(assigneeEnum).toContain('rekram1-node')
    expect(assigneeEnum).toContain('adamdotdevin')
    expect(assigneeEnum).toContain('iamdavidhill')
  })

  it('should handle empty environment arrays gracefully', async () => {
    // Set empty arrays
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify([])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify([])
    process.env.NODE_ENV = 'test'

    const githubTriageModule = await import('../github-triage.ts')

    expect(githubTriageModule.default).toBeDefined()

    const assigneeEnum = getAssigneesEnum()

    // Should fall back to defaults when all teams are empty
    expect(assigneeEnum).toContain('rekram1-node')
    expect(assigneeEnum).toContain('adamdotdevin')
  })

  it('should handle malformed environment variables gracefully', async () => {
    // Set malformed JSON
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = 'invalid-json'
    process.env.NODE_ENV = 'test'

    const githubTriageModule = await import('../github-triage.ts')

    expect(githubTriageModule.default).toBeDefined()

    const assigneeEnum = getAssigneesEnum()

    // Should fall back to defaults when JSON is invalid
    expect(assigneeEnum).toContain('rekram1-node')
    expect(assigneeEnum).toContain('adamdotdevin')
  })

  it('should deduplicate assignees across teams', async () => {
    // Set overlapping users in different teams
    process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify(['user1', 'user2'])
    process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify(['user2', 'user3']) // user2 appears in both
    process.env.NODE_ENV = 'test'

    const githubTriageModule = await import('../github-triage.ts')

    const assigneeEnum = getAssigneesEnum()

    // Should contain unique users only
    expect(assigneeEnum).toContain('user1')
    expect(assigneeEnum).toContain('user2')
    expect(assigneeEnum).toContain('user3')

    // Count occurrences of user2 (should be 1 due to deduplication)
    const user2Count = assigneeEnum.filter((user: string) => user === 'user2').length
    expect(user2Count).toBe(1)
  })
})
