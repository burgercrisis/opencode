/**
 * External Agent Integration Framework
 * Provides secure, resilient external agent calls while maintaining locality
 */

import { createHash } from 'crypto'
import { LRUCache } from 'lru-cache'

export interface AgentRequest {
  agentName: string
  method: string
  params: Record<string, any>
  userId?: string
  sessionId?: string
  timeout?: number
  cacheKey?: string
  cacheTTL?: number
}

export interface AgentResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  metadata: {
    agentName: string
    duration: number
    cached: boolean
    cost?: number
    tokens?: number
  }
}

export interface ExternalAgentConfig {
  name: string
  baseUrl: string
  apiKey?: string
  permissions: PermissionConfig
  rateLimits: RateLimitConfig
  timeouts: TimeoutConfig
  retryPolicy: RetryPolicy
  cacheConfig: CacheConfig
}

export interface PermissionConfig {
  requiresApproval: boolean
  allowedScopes: string[]
  dataRetention: number // seconds
  maxResponseSize: number // bytes
}

export interface RateLimitConfig {
  requestsPerSecond: number
  requestsPerMinute: number
  requestsPerHour: number
  burstLimit: number
  costLimitPerHour?: number
}

export interface TimeoutConfig {
  connect: number
  read: number
  total: number
}

export interface RetryPolicy {
  maxAttempts: number
  backoffMultiplier: number
  maxBackoff: number
  retryableErrors: string[]
}

export interface CacheConfig {
  enabled: boolean
  maxSize: number
  defaultTTL: number
  tiers: CacheTier[]
}

export interface CacheTier {
  name: string
  type: 'memory' | 'redis' | 'disk'
  ttl: number
  maxSize: number
}

export class CircuitBreaker {
  private failures: number = 0
  private lastFailureTime: number = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000, // 1 minute
    private successThreshold: number = 3
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN'
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED'
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  isOpen(): boolean {
    return this.state === 'OPEN'
  }
}

export class ResilientExternalAgent {
  private circuitBreaker: CircuitBreaker
  private cache: LRUCache<string, AgentResponse>
  private rateLimiter: Map<string, number[]> = new Map()
  private metrics: Map<string, any> = new Map()

  constructor(
    private config: ExternalAgentConfig,
    private metricsCollector?: MetricsCollector
  ) {
    this.circuitBreaker = new CircuitBreaker()
    this.cache = new LRUCache({
      max: this.config.cacheConfig.maxSize,
      ttl: this.config.cacheConfig.defaultTTL * 1000 // Convert to milliseconds
    })
  }

  async call<T>(request: AgentRequest): Promise<AgentResponse<T>> {
    const startTime = Date.now()

    try {
      // Check cache first
      if (this.config.cacheConfig.enabled) {
        const cached = await this.checkCache<T>(request)
        if (cached) {
          this.recordMetrics('cache_hit', request.agentName, Date.now() - startTime)
          return {
            ...cached,
            metadata: {
              ...cached.metadata,
              cached: true,
              duration: Date.now() - startTime
            }
          }
        }
      }

      // Check rate limits
      await this.checkRateLimits(request)

      // Check circuit breaker
      if (this.circuitBreaker.isOpen()) {
        return this.handleCircuitOpen(request)
      }

      // Execute with retry logic
      const response = await this.executeWithRetry<T>(request)

      // Cache successful responses
      if (this.config.cacheConfig.enabled && response.success) {
        await this.setCache(request, response)
      }

      this.recordMetrics('success', request.agentName, Date.now() - startTime)
      return response

    } catch (error) {
      this.recordMetrics('error', request.agentName, Date.now() - startTime, error as Error)
      return this.handleFailure(error as Error, request)
    }
  }

  private async checkCache<T>(request: AgentRequest): Promise<AgentResponse<T> | null> {
    const cacheKey = request.cacheKey || this.generateCacheKey(request)
    return this.cache.get(cacheKey) as AgentResponse<T> | null
  }

  private async setCache(request: AgentRequest, response: AgentResponse): Promise<void> {
    const cacheKey = request.cacheKey || this.generateCacheKey(request)
    const ttl = request.cacheTTL || this.config.cacheConfig.defaultTTL

    this.cache.set(cacheKey, response, { ttl: ttl * 1000 })
  }

  private async checkRateLimits(request: AgentRequest): Promise<void> {
    const now = Date.now()
    const window = 60000 // 1 minute window
    const key = `${request.agentName}:${request.userId || 'anonymous'}`

    let requests = this.rateLimiter.get(key) || []
    requests = requests.filter(timestamp => now - timestamp < window)

    if (requests.length >= this.config.rateLimits.requestsPerMinute) {
      throw new Error(`Rate limit exceeded for ${request.agentName}`)
    }

    requests.push(now)
    this.rateLimiter.set(key, requests)
  }

  private async executeWithRetry<T>(request: AgentRequest): Promise<AgentResponse<T>> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.retryPolicy.maxAttempts; attempt++) {
      try {
        return await this.circuitBreaker.execute(async () => {
          return await this.executeRequest<T>(request)
        })
      } catch (error) {
        lastError = error as Error

        if (attempt < this.config.retryPolicy.maxAttempts &&
          this.isRetryableError(lastError)) {
          const backoff = Math.min(
            this.config.retryPolicy.maxBackoff,
            this.config.retryPolicy.backoffMultiplier * Math.pow(2, attempt - 1)
          )
          await new Promise(resolve => setTimeout(resolve, backoff))
        } else {
          throw lastError
        }
      }
    }

    throw lastError
  }

  private async executeRequest<T>(request: AgentRequest): Promise<AgentResponse<T>> {
    const url = `${this.config.baseUrl}/${request.method}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenCode/1.0'
    }

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request.params),
      signal: AbortSignal.timeout(request.timeout || this.config.timeouts.total)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      success: true,
      data,
      metadata: {
        agentName: request.agentName,
        duration: 0, // Will be set by caller
        cached: false,
        cost: this.estimateCost(request),
        tokens: this.estimateTokens(request)
      }
    }
  }

  private handleCircuitOpen<T>(request: AgentRequest): AgentResponse<T> {
    return {
      success: false,
      error: `Service ${request.agentName} is temporarily unavailable`,
      metadata: {
        agentName: request.agentName,
        duration: 0,
        cached: false
      }
    }
  }

  private handleFailure<T>(error: Error, request: AgentRequest): AgentResponse<T> {
    return {
      success: false,
      error: error.message,
      metadata: {
        agentName: request.agentName,
        duration: 0,
        cached: false
      }
    }
  }

  private isRetryableError(error: Error): boolean {
    return this.config.retryPolicy.retryableErrors.some(pattern =>
      error.message.includes(pattern)
    )
  }

  private generateCacheKey(request: AgentRequest): string {
    const keyData = {
      agent: request.agentName,
      method: request.method,
      params: request.params
    }
    return createHash('sha256').update(JSON.stringify(keyData)).digest('hex')
  }

  private estimateCost(request: AgentRequest): number {
    // Simple cost estimation based on agent and request size
    const costMap: Record<string, number> = {
      'bigpickle': 0.01,
      'grok-code': 0.02,
      'websearch': 0.005,
      'codesearch': 0.01
    }

    const baseCost = costMap[request.agentName] || 0.01
    const sizeMultiplier = Math.max(1, JSON.stringify(request.params).length / 1000)
    return baseCost * sizeMultiplier
  }

  private estimateTokens(request: AgentRequest): number {
    // Rough token estimation
    const text = JSON.stringify(request.params)
    return Math.ceil(text.length / 4) // ~4 characters per token
  }

  private recordMetrics(
    action: string,
    agentName: string,
    duration: number,
    error?: Error
  ): void {
    if (this.metricsCollector) {
      this.metricsCollector.record({
        action,
        agentName,
        duration,
        timestamp: Date.now(),
        error: error?.message
      })
    }
  }
}

export class MetricsCollector {
  private metrics: Map<string, any[]> = new Map()

  record(event: any): void {
    const key = `${event.agentName}:${event.action}`
    const events = this.metrics.get(key) || []
    events.push(event)

    // Keep only last 1000 events per key
    if (events.length > 1000) {
      events.shift()
    }

    this.metrics.set(key, events)
  }

  getMetrics(agentName: string, action?: string): any[] {
    if (action) {
      return this.metrics.get(`${agentName}:${action}`) || []
    }

    // Return all metrics for the agent
    const allMetrics: any[] = []
    for (const [key, events] of this.metrics) {
      if (key.startsWith(`${agentName}:`)) {
        allMetrics.push(...events)
      }
    }
    return allMetrics
  }

  getStats(agentName: string): any {
    const events = this.getMetrics(agentName)

    if (events.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        averageDuration: 0,
        errorRate: 0
      }
    }

    const successes = events.filter(e => e.action === 'success').length
    const errors = events.filter(e => e.action === 'error').length
    const cacheHits = events.filter(e => e.action === 'cache_hit').length
    const durations = events.map(e => e.duration).filter(d => d > 0)

    return {
      totalRequests: events.length,
      successRate: successes / events.length,
      errorRate: errors / events.length,
      cacheHitRate: cacheHits / events.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      totalCost: events.reduce((sum, e) => sum + (e.metadata?.cost || 0), 0),
      totalTokens: events.reduce((sum, e) => sum + (e.metadata?.tokens || 0), 0)
    }
  }
}

// Default configurations for common external agents
export const DEFAULT_AGENT_CONFIGS: Record<string, ExternalAgentConfig> = {
  'bigpickle': {
    name: 'bigpickle',
    baseUrl: 'https://api.bigpickle.ai',
    permissions: {
      requiresApproval: true,
      allowedScopes: ['code-generation', 'refactoring'],
      dataRetention: 3600,
      maxResponseSize: 1048576 // 1MB
    },
    rateLimits: {
      requestsPerSecond: 10,
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      burstLimit: 20,
      costLimitPerHour: 10.0
    },
    timeouts: {
      connect: 5000,
      read: 30000,
      total: 35000
    },
    retryPolicy: {
      maxAttempts: 3,
      backoffMultiplier: 1000,
      maxBackoff: 10000,
      retryableErrors: ['timeout', 'connection', 'rate limit']
    },
    cacheConfig: {
      enabled: true,
      maxSize: 1000,
      defaultTTL: 3600, // 1 hour
      tiers: [
        { name: 'memory', type: 'memory', ttl: 300, maxSize: 100 },
        { name: 'disk', type: 'disk', ttl: 3600, maxSize: 900 }
      ]
    }
  },
  'grok-code': {
    name: 'grok-code',
    baseUrl: 'https://api.x.ai',
    permissions: {
      requiresApproval: false,
      allowedScopes: ['code-analysis', 'generation', 'debugging'],
      dataRetention: 1800,
      maxResponseSize: 2097152 // 2MB
    },
    rateLimits: {
      requestsPerSecond: 5,
      requestsPerMinute: 50,
      requestsPerHour: 500,
      burstLimit: 10,
      costLimitPerHour: 5.0
    },
    timeouts: {
      connect: 3000,
      read: 25000,
      total: 30000
    },
    retryPolicy: {
      maxAttempts: 2,
      backoffMultiplier: 500,
      maxBackoff: 5000,
      retryableErrors: ['timeout', 'connection']
    },
    cacheConfig: {
      enabled: true,
      maxSize: 500,
      defaultTTL: 1800, // 30 minutes
      tiers: [
        { name: 'memory', type: 'memory', ttl: 300, maxSize: 50 },
        { name: 'disk', type: 'disk', ttl: 1800, maxSize: 450 }
      ]
    }
  }
}

// Agent Registry for managing multiple external agents
export class AgentRegistry {
  private agents: Map<string, ResilientExternalAgent> = new Map()
  private metrics: MetricsCollector = new MetricsCollector()

  registerAgent(config: ExternalAgentConfig): void {
    const agent = new ResilientExternalAgent(config, this.metrics)
    this.agents.set(config.name, agent)
  }

  async callAgent<T>(agentName: string, request: Omit<AgentRequest, 'agentName'>): Promise<AgentResponse<T>> {
    const agent = this.agents.get(agentName)
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`)
    }

    return await agent.call<T>({ ...request, agentName })
  }

  getAgentStats(agentName: string): any {
    return this.metrics.getStats(agentName)
  }

  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {}
    for (const agentName of this.agents.keys()) {
      stats[agentName] = this.getAgentStats(agentName)
    }
    return stats
  }

  // Initialize with default agents
  static createDefault(): AgentRegistry {
    const registry = new AgentRegistry()

    // Register default agents if API keys are available
    if (process.env.BIGPICKLE_API_KEY) {
      registry.registerAgent({
        ...DEFAULT_AGENT_CONFIGS['bigpickle'],
        apiKey: process.env.BIGPICKLE_API_KEY
      })
    }

    if (process.env.GROK_API_KEY) {
      registry.registerAgent({
        ...DEFAULT_AGENT_CONFIGS['grok-code'],
        apiKey: process.env.GROK_API_KEY
      })
    }

    return registry
  }
}
