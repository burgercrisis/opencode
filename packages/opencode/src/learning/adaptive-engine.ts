import { LearningProfileLoader } from "./profile-loader"
import { Config } from "../config/config"
import type { TaskAnalysis } from "../model/task-detector"
import type { ModelSelection } from "../model/selection-engine"
import type { LearningProfile, PerformanceEntry } from "./profile-loader"

export interface AdaptationResult {
  profileId: string
  adapted: boolean
  changes: {
    qualityPreference?: number
    modelPreferences?: string[]
    adaptationRate?: number
  }
  confidence: number
  reason: string
}

export interface LearningMetrics {
  profileId: string
  totalTasks: number
  averageSatisfaction: number
  averageCost: number
  averageDuration: number
  successRate: number
  lastAdaptation?: Date
  adaptationsCount: number
}

export class AdaptiveLearningEngine {
  private profileLoader = new LearningProfileLoader()
  private feedbackHistory: Map<string, PerformanceEntry[]> = new Map()
  private learningMetrics: Map<string, LearningMetrics> = new Map()

  async initialize(): Promise<void> {
    // Load existing performance data
    await this.loadFeedbackHistory()

    // Create default profiles if none exist
    const profiles = await this.profileLoader.loadProfiles()
    if (profiles.size === 0) {
      await this.profileLoader.createDefaultProfiles()
    }
  }

  async recordPerformance(
    taskType: string,
    modelUsed: string,
    taskAnalysis: TaskAnalysis,
    modelSelection: ModelSelection,
    userSatisfaction: number,
    duration: number,
    success: boolean,
    context: {
      prompt: string
      tools: string[]
      issues?: string[]
    }
  ): Promise<void> {
    const profileId = this.getProfileIdForTask(taskType)

    const entry: PerformanceEntry = {
      profileId,
      taskType,
      modelUsed,
      userSatisfaction,
      cost: modelSelection.estimatedCost,
      quality: modelSelection.quality,
      duration,
      timestamp: new Date(),
      context: {
        prompt: context.prompt,
        tools: context.tools,
        success,
        issues: context.issues
      }
    }

    // Store feedback
    const existing = this.feedbackHistory.get(profileId) || []
    existing.push(entry)
    this.feedbackHistory.set(profileId, existing)

    // Keep only recent feedback (last 100 entries per profile)
    if (existing.length > 100) {
      this.feedbackHistory.set(profileId, existing.slice(-100))
    }

    // Update metrics
    this.updateMetrics(profileId)

    // Save to persistent storage
    await this.saveFeedbackHistory()
  }

  async adaptFromFeedback(
    taskType: string,
    config?: Config.Info["subagent_model_strategy"]
  ): Promise<AdaptationResult[]> {
    if (!config?.performance_learning?.enabled) {
      return []
    }

    const profileId = this.getProfileIdForTask(taskType)
    const profile = await this.getProfile(profileId)

    if (!profile || !profile.learning?.adaptationEnabled) {
      return []
    }

    const feedback = this.feedbackHistory.get(profileId) || []
    if (feedback.length < 5) {
      // Need more data before adapting
      return []
    }

    const results: AdaptationResult[] = []

    // Adapt quality preference
    const qualityResult = await this.adaptQualityPreference(profileId, profile, feedback, config)
    if (qualityResult.adapted) {
      results.push(qualityResult)
    }

    // Adapt model preferences
    const modelResult = await this.adaptModelPreferences(profileId, profile, feedback, config)
    if (modelResult.adapted) {
      results.push(modelResult)
    }

    // Adapt learning parameters
    const learningResult = await this.adaptLearningParameters(profileId, profile, feedback, config)
    if (learningResult.adapted) {
      results.push(learningResult)
    }

    return results
  }

  private async adaptQualityPreference(
    profileId: string,
    profile: LearningProfile,
    feedback: PerformanceEntry[],
    config: Config.Info["subagent_model_strategy"]
  ): Promise<AdaptationResult> {
    const recentFeedback = feedback.slice(-20) // Last 20 entries
    const avgSatisfaction = recentFeedback.reduce((sum, f) => sum + f.userSatisfaction, 0) / recentFeedback.length

    const currentQuality = profile.qualityPreference
    const adaptationRate = profile.learning?.adaptationRate || 0.1
    const confidenceThreshold = profile.learning?.confidenceThreshold || 0.8

    // Calculate target quality based on satisfaction
    let targetQuality: number
    if (avgSatisfaction > 80) {
      targetQuality = Math.min(100, currentQuality + 10) // Increase quality
    } else if (avgSatisfaction < 60) {
      targetQuality = Math.max(0, currentQuality - 10) // Decrease quality (maybe too expensive)
    } else {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence: 0,
        reason: "Satisfaction is satisfactory, no adaptation needed"
      }
    }

    // Calculate new quality with adaptation rate
    const newQuality = Math.round(
      currentQuality + (targetQuality - currentQuality) * adaptationRate
    )

    // Calculate confidence based on data consistency
    const satisfactionVariance = this.calculateVariance(recentFeedback.map(f => f.userSatisfaction))
    const confidence = Math.max(0, 1 - (satisfactionVariance / 100)) // Lower variance = higher confidence

    if (confidence < confidenceThreshold) {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence,
        reason: "Insufficient confidence in adaptation"
      }
    }

    // Apply the change
    profile.qualityPreference = newQuality
    await this.profileLoader.saveProfile(profile)

    return {
      profileId,
      adapted: true,
      changes: { qualityPreference: newQuality },
      confidence,
      reason: `Average satisfaction: ${avgSatisfaction.toFixed(1)}%, adapting quality from ${currentQuality}% to ${newQuality}%`
    }
  }

  private async adaptModelPreferences(
    profileId: string,
    profile: LearningProfile,
    feedback: PerformanceEntry[],
    config: Config.Info["subagent_model_strategy"]
  ): Promise<AdaptationResult> {
    const recentFeedback = feedback.slice(-30) // Last 30 entries
    const modelPerformance = new Map<string, { satisfaction: number; cost: number; count: number }>()

    // Aggregate performance by model
    for (const entry of recentFeedback) {
      const current = modelPerformance.get(entry.modelUsed) || { satisfaction: 0, cost: 0, count: 0 }
      current.satisfaction += entry.userSatisfaction
      current.cost += entry.cost
      current.count += 1
      modelPerformance.set(entry.modelUsed, current)
    }

    // Calculate average performance per model
    const modelScores = new Map<string, number>()
    for (const [model, data] of modelPerformance) {
      if (data.count >= 3) { // Only consider models with enough data
        const avgSatisfaction = data.satisfaction / data.count
        const avgCost = data.cost / data.count
        const score = avgSatisfaction - (avgCost * 1000) // Penalize expensive models
        modelScores.set(model, score)
      }
    }

    if (modelScores.size === 0) {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence: 0,
        reason: "Insufficient model performance data"
      }
    }

    // Sort models by score
    const sortedModels = Array.from(modelScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([model]) => model)

    const currentPreferences = profile.modelPreferences || []
    const newPreferences = sortedModels.slice(0, 5) // Top 5 models

    // Check if there's a meaningful change
    const hasSignificantChange = this.calculateModelPreferenceChange(currentPreferences, newPreferences)

    if (!hasSignificantChange) {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence: 0,
        reason: "No significant change in model preferences needed"
      }
    }

    // Apply the change
    profile.modelPreferences = newPreferences
    await this.profileLoader.saveProfile(profile)

    return {
      profileId,
      adapted: true,
      changes: { modelPreferences: newPreferences },
      confidence: 0.8,
      reason: `Updated model preferences based on performance data: ${newPreferences.join(", ")}`
    }
  }

  private async adaptLearningParameters(
    profileId: string,
    profile: LearningProfile,
    feedback: PerformanceEntry[],
    config: Config.Info["subagent_model_strategy"]
  ): Promise<AdaptationResult> {
    if (!profile.learning) {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence: 0,
        reason: "Learning is not enabled for this profile"
      }
    }

    const recentFeedback = feedback.slice(-50) // Last 50 entries
    const satisfactionTrend = this.calculateTrend(recentFeedback.map(f => f.userSatisfaction))

    let changes: any = {}
    let reason = ""

    // Adapt adaptation rate based on trend stability
    if (Math.abs(satisfactionTrend) > 10) { // Large swings in satisfaction
      // Increase adaptation rate to respond faster
      const newAdaptationRate = Math.min(0.5, (profile.learning.adaptationRate || 0.1) * 1.5)
      changes.adaptationRate = newAdaptationRate
      reason += `Increasing adaptation rate to ${newAdaptationRate.toFixed(2)} due to satisfaction volatility. `
    } else if (Math.abs(satisfactionTrend) < 2) { // Very stable satisfaction
      // Decrease adaptation rate to avoid overfitting
      const newAdaptationRate = Math.max(0.05, (profile.learning.adaptationRate || 0.1) * 0.8)
      changes.adaptationRate = newAdaptationRate
      reason += `Decreasing adaptation rate to ${newAdaptationRate.toFixed(2)} due to satisfaction stability. `
    }

    if (Object.keys(changes).length === 0) {
      return {
        profileId,
        adapted: false,
        changes: {},
        confidence: 0,
        reason: "No learning parameter adaptation needed"
      }
    }

    // Apply changes
    Object.assign(profile.learning, changes)
    await this.profileLoader.saveProfile(profile)

    return {
      profileId,
      adapted: true,
      changes,
      confidence: 0.7,
      reason: reason.trim()
    }
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0

    // Simple linear trend calculation
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * values[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    return slope * 10 // Scale for easier interpretation
  }

  private calculateModelPreferenceChange(current: string[], newModels: string[]): boolean {
    // Calculate how much the preferences have changed
    const overlap = current.filter(model => newModels.includes(model)).length
    const totalUnique = new Set([...current, ...newModels]).size
    const similarity = overlap / totalUnique

    return similarity < 0.7 // Less than 70% similarity = significant change
  }

  private getProfileIdForTask(taskType: string): string {
    // Map task types to profile IDs
    const taskToProfile: Record<string, string> = {
      "file_operations": "file-exploration",
      "code_generation": "code-generation",
      "debugging": "debugging",
      "documentation": "documentation",
      "git_operations": "git-operations",
      "analysis": "analysis"
    }

    return taskToProfile[taskType] || "general"
  }

  private async getProfile(profileId: string): Promise<LearningProfile | null> {
    const profiles = await this.profileLoader.loadProfiles()
    return profiles.get(profileId) || null
  }

  private updateMetrics(profileId: string): void {
    const feedback = this.feedbackHistory.get(profileId) || []
    if (feedback.length === 0) return

    const totalTasks = feedback.length
    const averageSatisfaction = feedback.reduce((sum, f) => sum + f.userSatisfaction, 0) / totalTasks
    const averageCost = feedback.reduce((sum, f) => sum + f.cost, 0) / totalTasks
    const averageDuration = feedback.reduce((sum, f) => sum + f.duration, 0) / totalTasks
    const successRate = feedback.filter(f => f.context.success).length / totalTasks

    this.learningMetrics.set(profileId, {
      profileId,
      totalTasks,
      averageSatisfaction,
      averageCost,
      averageDuration,
      successRate,
      adaptationsCount: 0
    })
  }

  private async loadFeedbackHistory(): Promise<void> {
    // Load feedback history from persistent storage
    // In a real implementation, this would load from a database or file
    try {
      const feedbackFile = ".learning/feedback.json"
      if (await Bun.file(feedbackFile).exists()) {
        const data = await Bun.file(feedbackFile).json()

        // Convert timestamp strings back to Date objects
        for (const [profileId, entries] of Object.entries(data)) {
          const parsedEntries = (entries as any[]).map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          }))
          this.feedbackHistory.set(profileId, parsedEntries)
          this.updateMetrics(profileId)
        }
      }
    } catch (error) {
      console.warn("Failed to load feedback history:", error)
    }
  }

  private async saveFeedbackHistory(): Promise<void> {
    try {
      // Ensure directory exists
      await Bun.$`mkdir -p .learning`.quiet()

      // Convert Date objects to strings for JSON serialization
      const data: Record<string, any[]> = {}
      for (const [profileId, entries] of this.feedbackHistory) {
        data[profileId] = entries.map(entry => ({
          ...entry,
          timestamp: entry.timestamp.toISOString()
        }))
      }

      await Bun.write(".learning/feedback.json", JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("Failed to save feedback history:", error)
    }
  }

  getMetrics(profileId: string): LearningMetrics | undefined {
    return this.learningMetrics.get(profileId)
  }

  getAllMetrics(): Map<string, LearningMetrics> {
    return new Map(this.learningMetrics)
  }
}
