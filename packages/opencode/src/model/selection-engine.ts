import { Provider } from "../provider/provider"
import { Config } from "../config/config"
import { TaskDetector, type TaskAnalysis } from "./task-detector"

type ModelInfo = Provider.Model
type ProviderInfo = Provider.Info

export type ModelKey = {
  providerID: string
  id: string
}

export interface ModelSelection {
  model: ModelKey
  providerID: string
  id: string
  quality: number
  estimatedCost: number
  reasoning: boolean
  confidence: number
  score: number
}

export interface SelectionCriteria {
  taskType: string
  qualityPreference: number
  reasoningRequired: boolean
  estimatedTokens: number
  maxCost?: number
  allowedModels?: string[]
  excludedModels?: string[]
}

export class ModelSelectionEngine {
  private taskDetector = new TaskDetector()

  async selectOptimalModel(
    criteria: SelectionCriteria,
    config?: Config.Info["subagent_model_strategy"]
  ): Promise<ModelSelection | null> {
    try {
      // Get all available models
      const availableModels = await this.getAvailableModels()

      // Filter by allowlist if configured
      let candidateModels = this.filterByAllowlist(availableModels, config?.global_allowlist)

      // Filter by task-specific overrides
      if (config?.task_specific_overrides?.[criteria.taskType]?.model_overrides) {
        candidateModels = candidateModels.filter(model =>
          config.task_specific_overrides![criteria.taskType].model_overrides!.includes(
            `${model.providerID}/${model.id}`
          )
        )
      }

      // Filter by reasoning requirement
      candidateModels = candidateModels.filter(model =>
        model.capabilities?.reasoning === true || !criteria.reasoningRequired
      )

      // Filter by excluded models
      if (criteria.excludedModels) {
        candidateModels = candidateModels.filter(model =>
          !criteria.excludedModels!.includes(`${model.providerID}/${model.id}`)
        )
      }

      if (candidateModels.length === 0) {
        console.warn(`No available models match criteria for task: ${criteria.taskType}`)
        return null
      }

      // Score and rank models
      const scoredModels = await this.scoreModels(candidateModels, criteria)

      // Sort by score (higher is better)
      scoredModels.sort((a, b) => b.score - a.score)

      // Return the best model
      return scoredModels[0]

    } catch (error) {
      console.error("Error selecting optimal model:", error)
      return null
    }
  }

  private async getAvailableModels(): Promise<ModelInfo[]> {
    const providers = await Provider.list()
    const models: ModelInfo[] = []

    for (const providerID of Object.keys(providers)) {
      const provider = providers[providerID]
      if (!provider) continue

      const providerModels = provider.models || {}
      models.push(...Object.values(providerModels))
    }

    return models
  }

  private filterByAllowlist(models: ModelInfo[], allowlist?: string[]): ModelInfo[] {
    if (!allowlist || allowlist.length === 0) {
      return models
    }

    return models.filter(model =>
      allowlist.includes(`${model.providerID}/${model.id}`)
    )
  }

  private async scoreModels(
    models: ModelInfo[],
    criteria: SelectionCriteria
  ): Promise<ModelSelection[]> {
    const selections: ModelSelection[] = []

    for (const model of models) {
      const selection = await this.scoreModel(model, criteria)
      if (selection) {
        selections.push(selection)
      }
    }

    return selections
  }

  private async scoreModel(
    model: ModelInfo,
    criteria: SelectionCriteria
  ): Promise<ModelSelection | null> {
    // Calculate quality score based on model capabilities and user preference
    const qualityScore = this.calculateQualityScore(model, criteria.qualityPreference)

    // Calculate cost score (lower cost = higher score)
    const costScore = this.calculateCostScore(model, criteria)

    // Calculate capability score
    const capabilityScore = this.calculateCapabilityScore(model, criteria)

    // Calculate overall score
    const overallScore = (
      qualityScore * 0.4 +      // 40% weight to quality
      costScore * 0.3 +         // 30% weight to cost
      capabilityScore * 0.3     // 30% weight to capabilities
    )

    // Estimate cost for this task
    const estimatedCost = this.estimateTaskCost(model, criteria)

    // Check if cost exceeds threshold
    if (criteria.maxCost && estimatedCost > criteria.maxCost) {
      return null
    }

    return {
      model: {
        providerID: model.providerID,
        id: model.id
      },
      providerID: model.providerID,
      id: model.id,
      quality: qualityScore,
      estimatedCost,
      reasoning: model.capabilities?.reasoning || false,
      confidence: this.calculateConfidence(model, criteria),
      score: overallScore
    }
  }

  private calculateQualityScore(model: ModelInfo, userPreference: number): number {
    // Base quality score based on model characteristics
    let modelQuality = 50 // default

    // Boost for reasoning models
    if (model.capabilities?.reasoning) {
      modelQuality += 20
    }

    // Boost for larger context windows
    if (model.limit?.context && model.limit.context >= 128000) {
      modelQuality += 20
    } else if (model.limit?.context && model.limit.context >= 32000) {
      modelQuality += 10
    }

    // Boost for models with tool calling
    if (model.capabilities?.toolcall) {
      modelQuality += 10
    }

    // Penalty for experimental/alpha models
    if (model.status === "alpha") {
      modelQuality -= 15
    } else if (model.status === "beta") {
      modelQuality -= 5
    }

    // Blend with user preference (0-100)
    const userScore = userPreference

    // Weight the model's inherent quality more for high-preference users
    const userWeight = userPreference / 100
    const modelWeight = 1 - userWeight * 0.3 // Model always has at least 70% weight

    return Math.round(modelQuality * modelWeight + userScore * userWeight)
  }

  private calculateCostScore(model: ModelInfo, criteria: SelectionCriteria): number {
    // Default pricing if not available
    const defaultPricing = { input: 0.01, output: 0.02 }
    const pricing = (model as any).pricing || defaultPricing

    if (!pricing.input) {
      return 50 // Default score if pricing unknown
    }

    const costPer1K = pricing.input

    // Lower cost = higher score
    // Scale from $0.001 (100 points) to $0.10 (0 points)
    const maxCost = 0.10
    const normalizedCost = Math.min(costPer1K, maxCost)
    const score = Math.round((1 - normalizedCost / maxCost) * 100)

    // Apply cost preference weighting
    const costPreference = 100 - criteria.qualityPreference // Invert: lower quality preference = higher cost preference
    if (costPreference > 75) {
      return Math.round(score * 1.3) // Boost cost score for cost-focused users
    } else if (costPreference < 25) {
      return Math.round(score * 0.7) // Reduce cost score for quality-focused users
    }

    return score
  }

  private calculateCapabilityScore(model: ModelInfo, criteria: SelectionCriteria): number {
    let score = 50 // Base score

    // Check reasoning capability
    if (criteria.reasoningRequired && model.capabilities?.reasoning) {
      score += 30
    } else if (criteria.reasoningRequired && !model.capabilities?.reasoning) {
      score -= 20
    }

    // Check tool calling capability
    if (model.capabilities?.toolcall) {
      score += 15
    }

    // Check context window adequacy
    if (model.limit?.context && criteria.estimatedTokens) {
      if (model.limit?.context >= criteria.estimatedTokens * 2) {
        score += 10 // Plenty of context
      } else if (model.limit?.context >= criteria.estimatedTokens) {
        score += 5 // Just enough context
      } else {
        score -= 15 // Insufficient context
      }
    }

    // Modality scoring
    if (model.capabilities?.input?.text) {
      score += 10 // Text input capability
    }

    return Math.max(0, Math.min(100, score))
  }

  private estimateTaskCost(model: ModelInfo, criteria: SelectionCriteria): number {
    const baseCost = model.cost?.input || 0.001
    const outputCost = model.cost?.output || 0.002

    const estimatedInputTokens = criteria.estimatedTokens || 1000
    const estimatedOutputTokens = Math.floor(estimatedInputTokens * 0.3) // Estimate 30% of input for output

    return (baseCost * estimatedInputTokens / 1000) + (outputCost * estimatedOutputTokens / 1000)
  }

  private calculateConfidence(model: ModelInfo, criteria: SelectionCriteria): number {
    let confidence = 0.5 // Base confidence

    // Higher confidence for well-established models
    if (model.status === "active") {
      confidence += 0.3
    } else if (model.status === "beta") {
      confidence += 0.1
    } else if (model.status === "alpha") {
      confidence -= 0.2
    }

    // Higher confidence for models matching requirements
    if (criteria.reasoningRequired && model.capabilities?.reasoning) {
      confidence += 0.2
    }

    // Lower confidence for very new or very old models
    if (model.id.includes("latest") || model.id.includes("-old")) {
      confidence -= 0.1
    }

    return Math.max(0, Math.min(1, confidence))
  }

  // Fallback model selection when intelligent selection fails
  async getFallbackModel(
    defaultModel?: { providerID: string; id: string }
  ): Promise<ModelSelection | null> {
    if (defaultModel) {
      try {
        const provider = await Provider.getProvider(defaultModel.providerID)
        if (!provider) return null
        const modelInfo = (Provider as any).getModel(defaultModel.providerID, defaultModel.id)
        if (!modelInfo) return null
        return {
          model: defaultModel,
          providerID: defaultModel.providerID,
          id: defaultModel.id,
          quality: 50,
          estimatedCost: this.estimateTaskCost(modelInfo, {
            taskType: "general",
            qualityPreference: 50,
            reasoningRequired: false,
            estimatedTokens: 1000
          }),
          reasoning: modelInfo.capabilities?.reasoning || false,
          confidence: 1.0,
          score: 1.0
        }
      } catch (error: any) {
        console.warn("Fallback model not available, trying any available model:", error)
      }
    }

    // Last resort: get any available model
    const availableModels = await this.getAvailableModels()
    if (availableModels && availableModels.length > 0) {
      const model = availableModels[0]
      return {
        model: {
          providerID: model.providerID,
          id: model.id
        },
        providerID: model.providerID,
        id: model.id,
        quality: 50,
        estimatedCost: 0.01,
        reasoning: model.capabilities?.reasoning || false,
        confidence: 0.3,
        score: 0.3
      }
    }
    return null
  }
}
