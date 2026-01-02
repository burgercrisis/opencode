import { Config } from "../config/config"

export interface TaskAnalysis {
  type: string              // "file_operations", "code_generation", etc.
  complexity: number        // 0-100
  priority: "low" | "medium" | "high"
  estimatedTokens: number
  reasoningRequired: boolean
  confidence: number        // 0-1 how confident we are in this analysis
}

export class TaskDetector {
  private readonly taskPatterns = new Map([
    ["file_operations", {
      patterns: ["explore", "search", "find", "list", "navigate", "browse", "locate", "scan", "examine"],
      agentPatterns: ["explore", "general"],
      baseComplexity: 20,
      complexityFactors: {
        "large": 15,    // large files/directories
        "complex": 10,  // complex patterns
        "recursive": 25 // recursive operations
      }
    }],
    ["code_generation", {
      patterns: ["write", "create", "implement", "generate", "build", "develop", "code", "program"],
      agentPatterns: ["general"],
      baseComplexity: 60,
      complexityFactors: {
        "complex": 20,  // complex logic
        "test": 15,     // test generation
        "framework": 10 // framework-specific code
      }
    }],
    ["debugging", {
      patterns: ["debug", "fix", "error", "issue", "problem", "troubleshoot", "resolve"],
      agentPatterns: ["general"],
      baseComplexity: 70,
      complexityFactors: {
        "critical": 25, // critical issues
        "multiple": 15, // multiple issues
        "complex": 20   // complex debugging
      }
    }],
    ["documentation", {
      patterns: ["document", "explain", "describe", "comment", "readme", "docs", "guide"],
      agentPatterns: ["docs"],
      baseComplexity: 35,
      complexityFactors: {
        "technical": 15, // technical content
        "comprehensive": 20, // comprehensive docs
        "api": 10      // API documentation
      }
    }],
    ["git_operations", {
      patterns: ["commit", "push", "pull", "branch", "merge", "checkout", "rebase"],
      agentPatterns: ["git-committer"],
      baseComplexity: 25,
      complexityFactors: {
        "conflict": 30, // merge conflicts
        "history": 15,  // history operations
        "multiple": 20  // multiple operations
      }
    }],
    ["analysis", {
      patterns: ["analyze", "review", "examine", "assess", "evaluate", "audit"],
      agentPatterns: ["general"],
      baseComplexity: 55,
      complexityFactors: {
        "security": 25, // security analysis
        "performance": 20, // performance analysis
        "comprehensive": 15 // comprehensive review
      }
    }]
  ])

  analyzeTask(prompt: string, agentName?: string, toolUsage?: any[]): TaskAnalysis {
    const normalizedPrompt = prompt.toLowerCase()

    // Detect task type
    let detectedType = "general"
    let maxScore = 0

    for (const [taskType, config] of this.taskPatterns) {
      const score = this.calculateTaskScore(normalizedPrompt, config.patterns, agentName, config.agentPatterns)
      if (score > maxScore) {
        maxScore = score
        detectedType = taskType
      }
    }

    const taskConfig = this.taskPatterns.get(detectedType)!

    // Calculate complexity
    let complexity = taskConfig.baseComplexity

    // Add complexity factors based on content
    if (normalizedPrompt.includes("large") || normalizedPrompt.includes("huge")) {
      complexity += taskConfig.complexityFactors["large"] || 0
    }
    if (normalizedPrompt.includes("complex") || normalizedPrompt.includes("advanced")) {
      complexity += taskConfig.complexityFactors["complex"] || 0
    }
    if (normalizedPrompt.includes("recursive") || normalizedPrompt.includes("multiple")) {
      complexity += taskConfig.complexityFactors["recursive"] || 0
    }
    if (normalizedPrompt.includes("test") || normalizedPrompt.includes("testing")) {
      complexity += taskConfig.complexityFactors["test"] || 0
    }
    if (normalizedPrompt.includes("security") || normalizedPrompt.includes("vulnerability")) {
      complexity += taskConfig.complexityFactors["security"] || 0
    }
    if (normalizedPrompt.includes("performance") || normalizedPrompt.includes("optimization")) {
      complexity += taskConfig.complexityFactors["performance"] || 0
    }

    // Clamp complexity to valid range
    complexity = Math.max(0, Math.min(100, complexity))

    // Determine priority based on complexity and urgency
    let priority: "low" | "medium" | "high" = "medium"
    if (complexity >= 75) {
      priority = "high"
    } else if (complexity <= 30) {
      priority = "low"
    }

    // Check if reasoning is required
    const reasoningRequired = this.requiresReasoning(normalizedPrompt, detectedType)

    // Estimate tokens based on complexity and task type
    const estimatedTokens = this.estimateTokens(normalizedPrompt, complexity, detectedType)

    // Calculate confidence in our analysis
    const confidence = Math.min(1.0, maxScore / 3.0) // Normalize score to 0-1

    return {
      type: detectedType,
      complexity,
      priority,
      estimatedTokens,
      reasoningRequired,
      confidence
    }
  }

  private calculateTaskScore(
    prompt: string,
    patterns: string[],
    agentName?: string,
    agentPatterns?: string[]
  ): number {
    let score = 0

    // Score based on prompt patterns
    for (const pattern of patterns) {
      if (prompt.includes(pattern)) {
        score += 1
      }
    }

    // Bonus score if agent matches expected pattern
    if (agentName && agentPatterns) {
      if (agentPatterns.some(pattern => agentName.includes(pattern))) {
        score += 0.5
      }
    }

    return score
  }

  private requiresReasoning(prompt: string, taskType: string): boolean {
    const reasoningIndicators = [
      "why", "how", "explain", "reason", "logic", "cause", "effect",
      "compare", "contrast", "analyze", "evaluate", "synthesize"
    ]

    const reasoningTasks = ["debugging", "analysis", "code_generation"]

    // Check for reasoning indicators in prompt
    const hasReasoningIndicators = reasoningIndicators.some(indicator =>
      prompt.includes(indicator)
    )

    // Check if task type typically requires reasoning
    const taskRequiresReasoning = reasoningTasks.includes(taskType)

    return hasReasoningIndicators || taskRequiresReasoning
  }

  private estimateTokens(prompt: string, complexity: number, taskType: string): number {
    const baseTokens = prompt.length / 4 // Rough estimate: 1 token per 4 chars

    // Multiply by complexity factor
    const complexityMultiplier = 1 + (complexity / 100) * 2 // 1x to 3x multiplier

    // Task type multipliers
    const taskMultipliers: Record<string, number> = {
      "file_operations": 0.5,
      "documentation": 1.2,
      "code_generation": 1.5,
      "debugging": 1.3,
      "git_operations": 0.3,
      "analysis": 1.4,
      "general": 1.0
    }

    const taskMultiplier = taskMultipliers[taskType] || 1.0

    return Math.round(baseTokens * complexityMultiplier * taskMultiplier)
  }

  // Get the default quality preference for a task type
  getDefaultQualityForTask(taskType: string): number {
    const qualityDefaults: Record<string, number> = {
      "file_operations": 25,    // Cost-focused - speed matters more
      "git_operations": 30,      // Cost-focused - predictable operations
      "documentation": 45,        // Balanced - clarity matters
      "code_generation": 65,     // Quality-focused - correctness critical
      "debugging": 70,           // Quality-focused - complex reasoning
      "analysis": 60,            // Quality-focused - thorough analysis
      "general": 50              // Balanced default
    }

    return qualityDefaults[taskType] || 50
  }

  // Check if task has specific quality override in configuration
  getTaskOverride(taskType: string, config?: Config.Info["subagent_model_strategy"]) {
    if (!config?.task_specific_overrides) {
      return null
    }

    return config.task_specific_overrides[taskType] || null
  }
}
