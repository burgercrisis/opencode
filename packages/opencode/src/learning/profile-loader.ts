import { ConfigMarkdown } from "../config/markdown"
import { Instance } from "../project/instance"
import { Global } from "../global/index"
import { z } from "zod"

export interface LearningProfile {
  name: string
  description?: string
  category: "performance" | "quality" | "security" | "maintainability"
  enabled: boolean
  priority: number
  taskPatterns?: string[]
  modelPreferences?: string[]
  qualityPreference: number
  performanceMetrics?: {
    targetResponseTime?: number  // ms
    maxCostPerTask?: number
    minAccuracy?: number        // 0-1
  }
  learning?: {
    adaptationEnabled: boolean
    feedbackWeight: number
    confidenceThreshold: number
    adaptationRate: number
  }
  rules?: LearningRule[]
  lastUpdated?: Date
}

export interface LearningRule {
  type: "suggestion" | "warning" | "error"
  condition: string           // JavaScript expression
  message: string
  action: "suggest" | "auto-fix" | "notify"
  confidence: number          // 0-1
  enabled: boolean
}

export interface PerformanceEntry {
  profileId: string
  taskType: string
  modelUsed: string
  userSatisfaction: number    // 0-100
  cost: number
  quality: number
  duration: number           // ms
  timestamp: Date
  context: {
    prompt: string
    tools: string[]
    success: boolean
    issues?: string[]
  }
}

// Schema for learning profiles
const LearningProfileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.enum(["performance", "quality", "security", "maintainability"]),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  task_patterns: z.array(z.string()).optional(),
  model_preferences: z.array(z.string()).optional(),
  quality_preference: z.number().min(0).max(100).default(50),
  performance_metrics: z.object({
    target_response_time: z.number().optional(),
    max_cost_per_task: z.number().optional(),
    min_accuracy: z.number().min(0).max(1).optional(),
  }).optional(),
  learning: z.object({
    adaptation_enabled: z.boolean().default(true),
    feedback_weight: z.number().min(0).max(1).default(0.3),
    confidence_threshold: z.number().min(0).max(1).default(0.8),
    adaptation_rate: z.number().min(0).max(1).default(0.1),
  }).optional(),
  rules: z.array(z.object({
    type: z.enum(["suggestion", "warning", "error"]),
    condition: z.string(),
    message: z.string(),
    action: z.enum(["suggest", "auto-fix", "notify"]),
    confidence: z.number().min(0).max(1),
    enabled: z.boolean().default(true),
  })).optional(),
  last_updated: z.string().optional(),
})

export class LearningProfileLoader {
  private readonly LEARNING_GLOB = new Bun.Glob("learning/**/*.md")

  async loadProfiles(): Promise<Map<string, LearningProfile>> {
    const profiles = new Map<string, LearningProfile>()

    // Load from global and project directories
    for (const dir of this.getLearningDirectories()) {
      for await (const item of this.LEARNING_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: true,
        cwd: dir
      })) {
        try {
          const profile = await this.parseProfile(item)
          if (profile) {
            profiles.set(profile.name, profile)
          }
        } catch (error) {
          console.warn(`Failed to load learning profile from ${item}:`, error)
        }
      }
    }

    return profiles
  }

  private async parseProfile(filePath: string): Promise<LearningProfile | null> {
    const content = await Bun.file(filePath).text()
    const parsed = await ConfigMarkdown.parse(content)

    if (!parsed.data) {
      return null
    }

    const validated = LearningProfileSchema.safeParse(parsed.data)
    if (!validated.success) {
      console.warn(`Invalid learning profile in ${filePath}:`, validated.error)
      return null
    }

    return {
      name: validated.data.name,
      description: validated.data.description,
      category: validated.data.category,
      enabled: validated.data.enabled,
      priority: validated.data.priority,
      taskPatterns: validated.data.task_patterns,
      modelPreferences: validated.data.model_preferences,
      qualityPreference: validated.data.quality_preference,
      performanceMetrics: validated.data.performance_metrics ? {
        targetResponseTime: validated.data.performance_metrics.target_response_time,
        maxCostPerTask: validated.data.performance_metrics.max_cost_per_task,
        minAccuracy: validated.data.performance_metrics.min_accuracy,
      } : undefined,
      learning: validated.data.learning ? {
        adaptationEnabled: validated.data.learning.adaptation_enabled,
        feedbackWeight: validated.data.learning.feedback_weight,
        confidenceThreshold: validated.data.learning.confidence_threshold,
        adaptationRate: validated.data.learning.adaptation_rate,
      } : undefined,
      rules: validated.data.rules?.map(rule => ({
        type: rule.type,
        condition: rule.condition,
        message: rule.message,
        action: rule.action,
        confidence: rule.confidence,
        enabled: rule.enabled,
      })),
      lastUpdated: validated.data.last_updated ? new Date(validated.data.last_updated) : undefined,
    }
  }

  private getLearningDirectories(): string[] {
    const directories = [
      Global.Path.config,
      Instance.directory,
      Global.Path.home,
    ]

    return directories.map(dir => `${dir}/.learning`).filter(async (dir) => {
      try {
        await Bun.file(dir).exists()
        return true
      } catch {
        return false
      }
    }) as string[]
  }

  async saveProfile(profile: LearningProfile, location: "global" | "project" = "project"): Promise<void> {
    const baseDir = location === "global" ? Global.Path.config : Instance.directory
    const learningDir = `${baseDir}/.learning`
    const profilePath = `${learningDir}/profiles/${profile.name}.md`

    // Ensure directory exists
    await Bun.$`mkdir -p ${learningDir}/profiles`.quiet()

    // Convert profile to YAML frontmatter + markdown
    const frontmatter = {
      name: profile.name,
      description: profile.description,
      category: profile.category,
      enabled: profile.enabled,
      priority: profile.priority,
      task_patterns: profile.taskPatterns,
      model_preferences: profile.modelPreferences,
      quality_preference: profile.qualityPreference,
      performance_metrics: profile.performanceMetrics ? {
        target_response_time: profile.performanceMetrics.targetResponseTime,
        max_cost_per_task: profile.performanceMetrics.maxCostPerTask,
        min_accuracy: profile.performanceMetrics.minAccuracy,
      } : undefined,
      learning: profile.learning ? {
        adaptation_enabled: profile.learning.adaptationEnabled,
        feedback_weight: profile.learning.feedbackWeight,
        confidence_threshold: profile.learning.confidenceThreshold,
        adaptation_rate: profile.learning.adaptationRate,
      } : undefined,
      rules: profile.rules?.map(rule => ({
        type: rule.type,
        condition: rule.condition,
        message: rule.message,
        action: rule.action,
        confidence: rule.confidence,
        enabled: rule.enabled,
      })),
      last_updated: new Date().toISOString(),
    }

    const yaml = await this.stringifyYaml(frontmatter)
    const markdown = this.generateProfileMarkdown(profile)

    const content = `---\n${yaml}\n---\n\n${markdown}`

    await Bun.write(profilePath, content)
  }

  private async stringifyYaml(obj: any): Promise<string> {
    // Simple YAML stringification - in a real implementation, use a proper YAML library
    const lines: string[] = []
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue

      if (Array.isArray(value)) {
        lines.push(`${key}:`)
        for (const item of value) {
          if (typeof item === 'object') {
            lines.push(`  -`)
            for (const [subKey, subValue] of Object.entries(item)) {
              lines.push(`    ${subKey}: ${subValue}`)
            }
          } else {
            lines.push(`  - ${item}`)
          }
        }
      } else if (typeof value === 'object') {
        lines.push(`${key}:`)
        for (const [subKey, subValue] of Object.entries(value)) {
          lines.push(`  ${subKey}: ${subValue}`)
        }
      } else {
        lines.push(`${key}: ${value}`)
      }
    }
    return lines.join('\n')
  }

  private generateProfileMarkdown(profile: LearningProfile): string {
    let markdown = `# ${profile.name}\n\n`

    if (profile.description) {
      markdown += `${profile.description}\n\n`
    }

    markdown += `**Category:** ${profile.category}\n`
    markdown += `**Priority:** ${profile.priority}\n`
    markdown += `**Quality Preference:** ${profile.qualityPreference}%\n\n`

    if (profile.taskPatterns && profile.taskPatterns.length > 0) {
      markdown += `## Task Patterns\n\n`
      for (const pattern of profile.taskPatterns) {
        markdown += `- ${pattern}\n`
      }
      markdown += `\n`
    }

    if (profile.modelPreferences && profile.modelPreferences.length > 0) {
      markdown += `## Preferred Models\n\n`
      for (const model of profile.modelPreferences) {
        markdown += `- ${model}\n`
      }
      markdown += `\n`
    }

    if (profile.rules && profile.rules.length > 0) {
      markdown += `## Learning Rules\n\n`
      for (const rule of profile.rules) {
        markdown += `### ${rule.type.charAt(0).toUpperCase() + rule.type.slice(1)} Rule\n\n`
        markdown += `**Condition:** \`${rule.condition}\`\n\n`
        markdown += `**Message:** ${rule.message}\n\n`
        markdown += `**Action:** ${rule.action}\n\n`
        markdown += `**Confidence:** ${rule.confidence}\n\n`
        markdown += `**Enabled:** ${rule.enabled ? '✅' : '❌'}\n\n`
      }
    }

    if (profile.learning?.adaptationEnabled) {
      markdown += `## Learning Configuration\n\n`
      markdown += `- **Adaptation Rate:** ${profile.learning.adaptationRate}\n`
      markdown += `- **Feedback Weight:** ${profile.learning.feedbackWeight}\n`
      markdown += `- **Confidence Threshold:** ${profile.learning.confidenceThreshold}\n\n`
    }

    return markdown
  }

  async createDefaultProfiles(): Promise<void> {
    const defaultProfiles: LearningProfile[] = [
      {
        name: "file-exploration",
        description: "Optimized for rapid file system exploration and search tasks",
        category: "performance",
        enabled: true,
        priority: 80,
        taskPatterns: ["*.search*", "*.explore*", "*.find*", "*.list*"],
        modelPreferences: ["claude-haiku-4-5", "gemini-2.5-flash", "gpt-5-nano"],
        qualityPreference: 25,
        performanceMetrics: {
          targetResponseTime: 2000,
          maxCostPerTask: 0.01,
        },
        learning: {
          adaptationEnabled: true,
          feedbackWeight: 0.3,
          confidenceThreshold: 0.8,
          adaptationRate: 0.1,
        }
      },
      {
        name: "code-generation",
        description: "Balanced approach for code generation tasks",
        category: "quality",
        enabled: true,
        priority: 70,
        taskPatterns: ["*.write*", "*.create*", "*.implement*"],
        modelPreferences: ["claude-3-5-sonnet", "gpt-4", "gemini-pro"],
        qualityPreference: 65,
        performanceMetrics: {
          targetResponseTime: 5000,
          maxCostPerTask: 0.05,
          minAccuracy: 0.85,
        },
        learning: {
          adaptationEnabled: true,
          feedbackWeight: 0.4,
          confidenceThreshold: 0.8,
          adaptationRate: 0.15,
        }
      },
      {
        name: "debugging",
        description: "High-quality model selection for complex debugging tasks",
        category: "quality",
        enabled: true,
        priority: 90,
        taskPatterns: ["*.debug*", "*.fix*", "*.error*"],
        modelPreferences: ["claude-3-opus", "gpt-4-turbo", "gemini-1.5-pro"],
        qualityPreference: 75,
        performanceMetrics: {
          targetResponseTime: 8000,
          maxCostPerTask: 0.10,
          minAccuracy: 0.90,
        },
        learning: {
          adaptationEnabled: true,
          feedbackWeight: 0.5,
          confidenceThreshold: 0.85,
          adaptationRate: 0.2,
        }
      }
    ]

    for (const profile of defaultProfiles) {
      await this.saveProfile(profile, "project")
    }
  }
}
