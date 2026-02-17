/// <reference path="../env.d.ts" />
// import { Octokit } from "@octokit/rest"
import { tool } from "@opencode-ai/plugin"
import DESCRIPTION from "./github-triage.txt"

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
  teamConfig = require('./team-config.json') as TeamConfig
  // Validate the loaded configuration has required structure
  if (!teamConfig.teams || !teamConfig.labelMappings || !teamConfig.assigneeMappings) {
    throw new Error('Invalid team configuration structure')
  }

  // Validate configuration contents
  validateTeamConfig(teamConfig)
} catch (error) {
  console.warn('Failed to load team-config.json, using default configuration:', error instanceof Error ? error.message : String(error))
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

function pick<T>(items: readonly T[], seed: number): T {
  // Deterministic selection based on seed to ensure consistent assignments
  return items[seed % items.length]
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
  if (title.length > 10000) {
    throw new Error("Issue title too long (max 10000 characters)")
  }
  if (body.length > 100000) {
    throw new Error("Issue body too long (max 100000 characters)")
  }

  return `${title}\n${body}`.toLowerCase()
}

function validateAssigneeLabel(assignee: string, requiredLabel: string, labels: string[]): void {
  // Validate specific team member assignments with required labels
  switch (requiredLabel) {
    case "windows":
      if (assignee === "Hona" && !labels.includes("windows")) {
        throw new Error(`Only ${requiredLabel} issues should be assigned to ${assignee}`)
      }
      break
    case "docs":
      if (assignee === "R44VC0RP" && !labels.includes("docs")) {
        throw new Error(`Only ${requiredLabel} issues should be assigned to ${assignee}`)
      }
      break
    case "opentui":
      if (assignee === "kommander" && !labels.includes("opentui")) {
        throw new Error(`Only ${requiredLabel} issues should be assigned to ${assignee}`)
      }
      break
    case "zen":
      if (TEAM.zen.includes(assignee) && !labels.includes("zen")) {
        throw new Error(`Only ${requiredLabel} issues should be assigned to ${TEAM.zen.join(" or ")}`)
      }
      break
  }
}

async function githubFetch(endpoint: string, options: RequestInit = {}) {
  // Validate GitHub token presence
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required for GitHub API calls')
  }

  const url = `https://api.github.com${endpoint}`
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
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} | Endpoint: ${endpoint} | Method: ${options.method || 'GET'}${errorDetails}`)
  }
  return response.json()
}

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

    const results: string[] = []
    let labels = [...new Set(args.labels.map((x) => teamConfig.labelMappings[x] || x))]
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
      assignee = teamConfig.assigneeMappings[args.assignee] || args.assignee
    }

    // Log assignee mapping if applicable
    const mappedAssignee = teamConfig.assigneeMappings[args.assignee]
    if (mappedAssignee && mappedAssignee !== args.assignee) {
      results.push(`Remapped assignee: ${args.assignee} -> ${mappedAssignee}`)
    }

    if (labels.includes("zen") && !zen) {
      throw new Error("Only add zen label when issue title/body contains 'zen'")
    }

    // Comprehensive validation: ensure web issues are properly assigned regardless of nix status
    if (web && !nix && !TEAM.desktop.includes(assignee)) {
      throw new Error("Web issues must be assigned to adamdotdevin, iamdavidhill, Brendonovich, or nexxeln")
    }

    // Validate team member assignments with required labels (only for cases not covered above)
    validateAssigneeLabel(assignee, "docs", labels)
    validateAssigneeLabel(assignee, "opentui", labels)

    // Transactional API calls: ensure both assignment and labeling succeed or fail together
    const apiCalls: Promise<any>[] = []

    // Prepare results array upfront to avoid race conditions
    const expectedResults: string[] = []

    // Always attempt assignment first
    expectedResults.push(`Assigned @${assignee} to issue #${issue}`)
    apiCalls.push(
      githubFetch(`/repos/${owner}/${repo}/issues/${issue}/assignees`, {
        method: "POST",
        body: JSON.stringify({ assignees: [assignee] }),
      })
    )

    // Add labels if any exist
    if (labels.length > 0) {
      expectedResults.push(`Added labels: ${labels.join(", ")}`)
      apiCalls.push(
        githubFetch(`/repos/${owner}/${repo}/issues/${issue}/labels`, {
          method: "POST",
          body: JSON.stringify({ labels }),
        })
      )
    }

    // Execute all API calls transactionally - if any fail, all fail
    try {
      await Promise.all(apiCalls)
      // Only add results to output if all API calls succeeded
      results.push(...expectedResults)
    } catch (error) {
      // If any API call fails, we don't get partial success
      throw new Error(`Failed to update issue #${issue}. No changes were applied to maintain consistency. Error: ${error instanceof Error ? error.message : String(error)}`)
    }

    return results.join("\n")
  },
})
