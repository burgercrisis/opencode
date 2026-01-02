/**
 * Enhanced Knowledge Graph with Local-First Learning
 * Implements sophisticated knowledge management while maintaining locality
 */

import { createHash } from 'crypto'
import { HierarchicalNSW } from 'hnswlib-node'

export interface KnowledgeNode {
  id: string
  type: 'concept' | 'pattern' | 'solution' | 'model_performance' | 'task_experience'
  content: string
  embedding: Float32Array
  metadata: {
    project?: string
    taskType: string
    timestamp: number
    confidence: number
    accessCount: number
    lastAccessed: number
    userSatisfaction?: number
    cost?: number
    duration?: number
    success?: boolean
  }
  relationships: Relationship[]
}

export interface Relationship {
  targetId: string
  type: 'similarity' | 'dependency' | 'improves' | 'relates_to' | 'alternative_to'
  weight: number
  metadata: Record<string, any>
}

export interface KnowledgeSnapshot {
  version: string
  timestamp: number
  nodeHashes: Map<string, string>
  graphStructure: string
  compressionStats: CompressionStats
}

export interface CompressionStats {
  originalSize: number
  compressedSize: number
  compressionRatio: number
  preservedImportance: number
}

export interface LearningProfile {
  id: string
  name: string
  taskTypes: string[]
  modelPreferences: ModelPreference[]
  qualityThreshold: number
  costThreshold: number
  adaptationRules: AdaptationRule[]
  performanceHistory: PerformanceEntry[]
}

export interface ModelPreference {
  modelName: string
  provider: string
  taskType: string
  quality: number
  cost: number
  speed: number
  confidence: number
}

export interface AdaptationRule {
  condition: string
  action: 'increase_preference' | 'decrease_preference' | 'switch_model'
  parameters: Record<string, any>
}

export interface PerformanceEntry {
  taskType: string
  modelUsed: string
  userSatisfaction: number
  cost: number
  quality: number
  duration: number
  timestamp: number
  success: boolean
  context: {
    prompt: string
    tools: string[]
    issues?: string[]
  }
}

export class LocalKnowledgeGraph {
  private hnswIndex: any
  private nodeStore: Map<string, KnowledgeNode> = new Map()
  private relationshipIndex: Map<string, Set<string>> = new Map()
  private accessLog: Map<string, number[]> = new Map()
  private dimension: number = 384

  constructor() {
    this.hnswIndex = new HierarchicalNSW('cosine', this.dimension)
  }

  async addNode(node: KnowledgeNode): Promise<void> {
    // Add to HNSW index for semantic search
    this.hnswIndex.addPoint(node.embedding, parseInt(this.hashId(node.id)))

    // Store full node data
    this.nodeStore.set(node.id, node)

    // Update relationship indexes
    for (const rel of node.relationships) {
      if (!this.relationshipIndex.has(rel.targetId)) {
        this.relationshipIndex.set(rel.targetId, new Set())
      }
      this.relationshipIndex.get(rel.targetId)!.add(node.id)
    }

    // Log access
    this.logAccess(node.id)
  }

  async semanticSearch(query: string, k: number = 10): Promise<KnowledgeNode[]> {
    const queryEmbedding = await this.generateEmbedding(query)
    const results = this.hnswIndex.searchKNN(queryEmbedding, k)

    const nodes: KnowledgeNode[] = []
    for (const [index, similarity] of results) {
      const nodeId = this.unhashId(index)
      const node = this.nodeStore.get(nodeId)
      if (node) {
        nodes.push(node)
        this.logAccess(nodeId)
      }
    }

    return nodes
  }

  async getRelatedNodes(nodeId: string, depth: number = 2): Promise<KnowledgeNode[]> {
    const visited = new Set<string>()
    const queue = [{ id: nodeId, depth: 0 }]
    const results: KnowledgeNode[] = []

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      if (visited.has(id) || depth > depth) continue

      visited.add(id)
      const node = this.nodeStore.get(id)
      if (node) {
        results.push(node)
        this.logAccess(id)
      }

      if (depth < depth) {
        const relatedIds = this.relationshipIndex.get(id) || new Set()
        for (const relatedId of relatedIds) {
          if (!visited.has(relatedId)) {
            queue.push({ id: relatedId, depth: depth + 1 })
          }
        }
      }
    }

    return results
  }

  async updateNode(nodeId: string, updates: Partial<KnowledgeNode>): Promise<void> {
    const existingNode = this.nodeStore.get(nodeId)
    if (!existingNode) {
      throw new Error(`Node ${nodeId} not found`)
    }

    const updatedNode = { ...existingNode, ...updates }

    // Update HNSW index if embedding changed
    if (updates.embedding) {
      this.hnswIndex.addPoint(updates.embedding, parseInt(this.hashId(nodeId)))
    }

    this.nodeStore.set(nodeId, updatedNode)
    this.logAccess(nodeId)
  }

  async deleteNode(nodeId: string): Promise<void> {
    this.nodeStore.delete(nodeId)
    this.relationshipIndex.delete(nodeId)
    this.accessLog.delete(nodeId)

    // Remove from HNSW index (mark as deleted)
    const index = parseInt(this.hashId(nodeId))
    this.hnswIndex.markDelete(index)
  }

  private logAccess(nodeId: string): void {
    const now = Date.now()
    const accesses = this.accessLog.get(nodeId) || []
    accesses.push(now)

    // Keep only last 100 accesses
    if (accesses.length > 100) {
      accesses.shift()
    }

    this.accessLog.set(nodeId, accesses)

    // Update node metadata
    const node = this.nodeStore.get(nodeId)
    if (node) {
      node.metadata.accessCount++
      node.metadata.lastAccessed = now
    }
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    // In a real implementation, this would use local embedding generation
    // For now, return a dummy embedding
    const embedding = new Float32Array(this.dimension)
    for (let i = 0; i < this.dimension; i++) {
      embedding[i] = Math.random() * 2 - 1
    }
    return this.normalizeVector(embedding)
  }

  private normalizeVector(vector: Float32Array): Float32Array {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    if (norm === 0) return vector

    const normalized = new Float32Array(vector.length)
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm
    }
    return normalized
  }

  private hashId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString()
  }

  private unhashId(hash: string): string {
    return hash.toString()
  }
}

export class IncrementalKnowledgeManager {
  private knowledgeGraph: LocalKnowledgeGraph
  private changeBuffer: KnowledgeChange[] = []
  private snapshots: Map<string, KnowledgeSnapshot> = new Map()

  constructor(knowledgeGraph: LocalKnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph
  }

  async detectAndApplyChanges(): Promise<void> {
    const changes = await this.analyzeChanges()

    for (const change of changes) {
      this.changeBuffer.push(change)
    }

    // Apply batched changes
    await this.applyBatchedChanges()
  }

  private async analyzeChanges(): Promise<KnowledgeChange[]> {
    const changes: KnowledgeChange[] = []
    const nodes = Array.from(this.knowledgeGraph['nodeStore'].values())

    for (const node of nodes) {
      const lastSnapshot = await this.getLastSnapshot(node.id)
      if (lastSnapshot) {
        const currentHash = this.hashNode(node)
        if (currentHash !== lastSnapshot.nodeHashes.get(node.id)) {
          changes.push({
            nodeId: node.id,
            type: 'modified',
            timestamp: Date.now(),
            impactScore: this.calculateImpact(node)
          })
        }
      }
    }

    return changes
  }

  private async applyBatchedChanges(): Promise<void> {
    // Sort changes by impact score
    this.changeBuffer.sort((a, b) => b.impactScore - a.impactScore)

    // Apply high-impact changes first
    for (const change of this.changeBuffer) {
      await this.applyChange(change)
    }

    // Clear buffer
    this.changeBuffer = []

    // Create new snapshot
    await this.createSnapshot()
  }

  private async applyChange(change: KnowledgeChange): Promise<void> {
    const node = this.knowledgeGraph['nodeStore'].get(change.nodeId)
    if (!node) return

    // Update node based on change type
    switch (change.type) {
      case 'modified':
        // Re-calculate relationships and embeddings
        node.metadata.timestamp = change.timestamp
        break
      case 'accessed':
        // Update access statistics
        node.metadata.lastAccessed = change.timestamp
        node.metadata.accessCount++
        break
    }
  }

  private calculateImpact(node: KnowledgeNode): number {
    const centrality = this.calculatePageRank(node.id)
    const recency = this.calculateRecencyScore(node.metadata.lastAccessed)
    const relationshipWeight = this.sumRelationshipWeights(node.id)

    return centrality * 0.4 + recency * 0.3 + relationshipWeight * 0.3
  }

  private calculatePageRank(nodeId: string): number {
    // Simplified PageRank calculation
    const node = this.knowledgeGraph['nodeStore'].get(nodeId)
    if (!node) return 0

    const incomingWeight = node.relationships
      .filter(rel => rel.type === 'similarity' || rel.type === 'dependency')
      .reduce((sum, rel) => sum + rel.weight, 0)

    return Math.min(1.0, incomingWeight / 10.0)
  }

  private calculateRecencyScore(lastAccessed: number): number {
    const now = Date.now()
    const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24)
    return Math.max(0, 1.0 - daysSinceAccess / 30.0) // Decay over 30 days
  }

  private sumRelationshipWeights(nodeId: string): number {
    const node = this.knowledgeGraph['nodeStore'].get(nodeId)
    if (!node) return 0

    return node.relationships.reduce((sum, rel) => sum + rel.weight, 0)
  }

  private hashNode(node: KnowledgeNode): string {
    const content = JSON.stringify({
      content: node.content,
      type: node.type,
      relationships: node.relationships
    })
    return createHash('sha256').update(content).digest('hex')
  }

  private async getLastSnapshot(nodeId: string): Promise<KnowledgeSnapshot | null> {
    const snapshots = Array.from(this.snapshots.values()).sort((a, b) => b.timestamp - a.timestamp)
    return snapshots[0] || null
  }

  async createSnapshot(): Promise<string> {
    const version = this.generateVersionId()
    const nodes = Array.from(this.knowledgeGraph['nodeStore'].values())

    const nodeHashes = new Map<string, string>()
    for (const node of nodes) {
      nodeHashes.set(node.id, this.hashNode(node))
    }

    const snapshot: KnowledgeSnapshot = {
      version,
      timestamp: Date.now(),
      nodeHashes,
      graphStructure: this.serializeGraph(),
      compressionStats: {
        originalSize: nodes.length,
        compressedSize: nodes.length,
        compressionRatio: 1.0,
        preservedImportance: 1.0
      }
    }

    this.snapshots.set(version, snapshot)
    return version
  }

  private generateVersionId(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private serializeGraph(): string {
    const nodes = Array.from(this.knowledgeGraph['nodeStore'].values())
    const adjacencyList: Record<string, string[]> = {}

    for (const node of nodes) {
      adjacencyList[node.id] = node.relationships.map(rel => rel.targetId)
    }

    return JSON.stringify(adjacencyList)
  }
}

export class AdaptiveLearningEngine {
  private knowledgeGraph: LocalKnowledgeGraph
  private profiles: Map<string, LearningProfile> = new Map()
  private incrementalManager: IncrementalKnowledgeManager

  constructor(knowledgeGraph: LocalKnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph
    this.incrementalManager = new IncrementalKnowledgeManager(knowledgeGraph)
  }

  async initialize(): Promise<void> {
    await this.loadProfiles()
    await this.incrementalManager.detectAndApplyChanges()
  }

  async recordPerformance(entry: PerformanceEntry): Promise<void> {
    // Find or create profile for task type
    const profile = await this.getOrCreateProfile(entry.taskType)

    // Add to performance history
    profile.performanceHistory.push(entry)

    // Keep only last 100 entries
    if (profile.performanceHistory.length > 100) {
      profile.performanceHistory.shift()
    }

    // Update model preferences based on performance
    await this.updateModelPreferences(profile, entry)

    // Create knowledge node for this experience
    await this.createExperienceNode(entry)

    // Apply incremental changes
    await this.incrementalManager.detectAndApplyChanges()
  }

  async getModelRecommendation(taskType: string, context: any): Promise<ModelPreference | null> {
    const profile = this.profiles.get(taskType)
    if (!profile) return null

    // Find best model based on learned preferences
    const candidates = profile.modelPreferences.filter(pref => pref.taskType === taskType)

    if (candidates.length === 0) return null

    // Score candidates based on recent performance
    const scored = candidates.map(pref => {
      const recentPerformance = this.getRecentPerformance(pref.modelName, taskType)
      const score = pref.confidence * 0.6 + recentPerformance * 0.4
      return { pref, score }
    })

    const best = scored.sort((a, b) => b.score - a.score)[0]
    return best.pref
  }

  private async getOrCreateProfile(taskType: string): Promise<LearningProfile> {
    let profile = this.profiles.get(taskType)

    if (!profile) {
      profile = {
        id: this.generateProfileId(taskType),
        name: `Profile for ${taskType}`,
        taskTypes: [taskType],
        modelPreferences: [],
        qualityThreshold: 0.8,
        costThreshold: 0.1,
        adaptationRules: this.getDefaultAdaptationRules(),
        performanceHistory: []
      }

      this.profiles.set(taskType, profile)
    }

    return profile
  }

  private async updateModelPreferences(profile: LearningProfile, entry: PerformanceEntry): Promise<void> {
    // Find existing preference for this model
    let pref = profile.modelPreferences.find(p => p.modelName === entry.modelUsed)

    if (!pref) {
      // Create new preference
      pref = {
        modelName: entry.modelUsed,
        provider: 'unknown',
        taskType: entry.taskType,
        quality: entry.success ? entry.userSatisfaction / 100 : 0,
        cost: entry.cost,
        speed: 1 / (entry.duration / 1000), // Convert to operations per second
        confidence: 0.5
      }
      profile.modelPreferences.push(pref)
    } else {
      // Update existing preference with exponential moving average
      const alpha = 0.3 // Learning rate
      pref.quality = alpha * (entry.success ? entry.userSatisfaction / 100 : 0) + (1 - alpha) * pref.quality
      pref.cost = alpha * entry.cost + (1 - alpha) * pref.cost
      pref.speed = alpha * (1 / (entry.duration / 1000)) + (1 - alpha) * pref.speed
      pref.confidence = Math.min(1.0, pref.confidence + 0.05)
    }

    // Apply adaptation rules
    await this.applyAdaptationRules(profile, entry)
  }

  private async applyAdaptationRules(profile: LearningProfile, entry: PerformanceEntry): Promise<void> {
    for (const rule of profile.adaptationRules) {
      if (this.evaluateCondition(rule.condition, entry)) {
        await this.executeAction(rule.action, rule.parameters, profile, entry)
      }
    }
  }

  private evaluateCondition(condition: string, entry: PerformanceEntry): boolean {
    // Simple condition evaluation (in real implementation, use a proper expression parser)
    if (condition.includes('userSatisfaction < 50')) {
      return entry.userSatisfaction < 50
    }
    if (condition.includes('cost > 0.5')) {
      return entry.cost > 0.5
    }
    if (condition.includes('duration > 30000')) {
      return entry.duration > 30000
    }
    return false
  }

  private async executeAction(
    action: string,
    parameters: Record<string, any>,
    profile: LearningProfile,
    entry: PerformanceEntry
  ): Promise<void> {
    switch (action) {
      case 'decrease_preference':
        const pref = profile.modelPreferences.find(p => p.modelName === entry.modelUsed)
        if (pref) {
          pref.confidence = Math.max(0.1, pref.confidence - 0.2)
        }
        break
      case 'switch_model':
        // Logic to switch to alternative model
        console.log(`Switching model for ${entry.taskType} due to poor performance`)
        break
    }
  }

  private async createExperienceNode(entry: PerformanceEntry): Promise<void> {
    const nodeId = this.generateExperienceId(entry)
    const embedding = await this.generateEmbedding(entry.context.prompt)

    const node: KnowledgeNode = {
      id: nodeId,
      type: 'task_experience',
      content: `Task: ${entry.taskType}, Model: ${entry.modelUsed}, Satisfaction: ${entry.userSatisfaction}`,
      embedding,
      metadata: {
        taskType: entry.taskType,
        timestamp: entry.timestamp,
        confidence: entry.userSatisfaction / 100,
        accessCount: 0,
        lastAccessed: entry.timestamp,
        userSatisfaction: entry.userSatisfaction,
        cost: entry.cost,
        duration: entry.duration,
        success: entry.success
      },
      relationships: []
    }

    await this.knowledgeGraph.addNode(node)
  }

  private getRecentPerformance(modelName: string, taskType: string): number {
    const profile = this.profiles.get(taskType)
    if (!profile) return 0.5

    const recent = profile.performanceHistory
      .filter(entry => entry.modelUsed === modelName)
      .slice(-10) // Last 10 entries

    if (recent.length === 0) return 0.5

    return recent.reduce((sum, entry) => sum + entry.userSatisfaction, 0) / recent.length / 100
  }

  private getDefaultAdaptationRules(): AdaptationRule[] {
    return [
      {
        condition: 'userSatisfaction < 50',
        action: 'decrease_preference',
        parameters: { amount: 0.2 }
      },
      {
        condition: 'cost > 0.5',
        action: 'decrease_preference',
        parameters: { amount: 0.1 }
      },
      {
        condition: 'duration > 30000',
        action: 'switch_model',
        parameters: { reason: 'slow_response' }
      }
    ]
  }

  private generateProfileId(taskType: string): string {
    return `profile-${taskType}-${Date.now()}`
  }

  private generateExperienceId(entry: PerformanceEntry): string {
    const content = `${entry.taskType}-${entry.modelUsed}-${entry.timestamp}`
    return createHash('sha256').update(content).digest('hex').substr(0, 16)
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    // Use knowledge graph's embedding generation
    return await this.knowledgeGraph['generateEmbedding'](text)
  }

  private async loadProfiles(): Promise<void> {
    // In a real implementation, load from persistent storage
    console.log('Loading learning profiles...')
  }
}

// Type definitions for internal use
interface KnowledgeChange {
  nodeId: string
  type: 'modified' | 'accessed' | 'deleted'
  timestamp: number
  impactScore: number
}
