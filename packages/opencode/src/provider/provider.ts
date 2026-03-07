import z from "zod"
import os from "os"
import fuzzysort from "fuzzysort"
import { Config } from "../config/config"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
import { NoSuchModelError, type Provider as SDK } from "ai"
import { Log } from "../util/log"
import { BunProc } from "../bun"
import { Hash } from "../util/hash"
import { Plugin } from "../plugin"
import { NamedError } from "@opencode-ai/util/error"
import { ModelsDev } from "./models"
import { Auth } from "../auth"
import { Env } from "../env"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { iife } from "@/util/iife"
import { Global } from "../global"
import path from "path"
import { Filesystem } from "../util/filesystem"

// Direct imports for bundled providers
import { createAmazonBedrock, type AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter, type LanguageModelV2 } from "@openrouter/ai-sdk-provider"
import { createOpenaiCompatible as createGitHubCopilotOpenAICompatible } from "./sdk/copilot"
import { createXai } from "@ai-sdk/xai"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createGateway } from "@ai-sdk/gateway"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createVercel } from "@ai-sdk/vercel"
import { createGitLab, VERSION as GITLAB_PROVIDER_VERSION } from "@gitlab/gitlab-ai-provider"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { GoogleAuth } from "google-auth-library"
import { ProviderTransform } from "./transform"
import { Installation } from "../installation"

export namespace Provider {
  const log = Log.create({ service: "provider" })

  function isGpt5OrLater(modelID: string): boolean {
    const match = /^gpt-(\d+)/.exec(modelID)
    if (!match) {
      return false
    }
    return Number(match[1]) >= 5
  }

  function shouldUseCopilotResponsesApi(modelID: string): boolean {
    return isGpt5OrLater(modelID) && !modelID.startsWith("gpt-5-mini")
  }

  function googleVertexVars(options: Record<string, any>) {
    const project =
      options["project"] ?? Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
    const location =
      options["location"] ?? Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-central1"
    const endpoint = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`

    return {
      GOOGLE_VERTEX_PROJECT: project,
      GOOGLE_VERTEX_LOCATION: location,
      GOOGLE_VERTEX_ENDPOINT: endpoint,
    }
  }

  function loadBaseURL(model: Model, options: Record<string, any>) {
    const raw = options["baseURL"] ?? model.api.url
    if (typeof raw !== "string") return raw
    const vars = model.providerID === "google-vertex" ? googleVertexVars(options) : undefined
    return raw.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const val = Env.get(String(key)) ?? vars?.[String(key) as keyof typeof vars]
      return val ?? match
    })
  }

  const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
    "@ai-sdk/amazon-bedrock": (options) => createAmazonBedrock(options),
    "@ai-sdk/anthropic": (options) => createAnthropic(options),
    "@ai-sdk/azure": (options) => createAzure(options),
    "@ai-sdk/google": (options) => createGoogleGenerativeAI(options),
    "@ai-sdk/google-vertex": (options) => createVertex(options),
    "@ai-sdk/google-vertex/anthropic": (options) => createVertexAnthropic(options),
    "@ai-sdk/openai": (options) => createOpenAI(options),
    "@ai-sdk/openai-compatible": (options) => createOpenAICompatible(options),
    "@openrouter/ai-sdk-provider": (options) => createOpenRouter(options),
    "@ai-sdk/xai": (options) => createXai(options),
    "@ai-sdk/mistral": (options) => createMistral(options),
    "@ai-sdk/groq": (options) => createGroq(options),
    "@ai-sdk/deepinfra": (options) => createDeepInfra(options),
    "@ai-sdk/cerebras": (options) => createCerebras(options),
    "@ai-sdk/cohere": (options) => createCohere(options),
    "@ai-sdk/gateway": (options) => createGateway(options),
    "@ai-sdk/togetherai": (options) => createTogetherAI(options),
    "@ai-sdk/perplexity": (options) => createPerplexity(options),
    "@ai-sdk/vercel": (options) => createVercel(options),
    "@gitlab/gitlab-ai-provider": (options) => createGitLab(options),
    "@ai-sdk/github-copilot": (options) => (createGitHubCopilotOpenAICompatible as any)(options),
  }

  type CustomModelLoader = (sdk: any, model: Model, options?: Record<string, any>) => Promise<any>
  type CustomLoader = (provider: Info) => Promise<{
    autoload: boolean
    getModel?: CustomModelLoader
    options?: Record<string, any>
  }>

  const CUSTOM_LOADERS: Record<string, CustomLoader> = {
    async anthropic() {
      return {
        autoload: false,
        options: {
          headers: {
            "anthropic-beta":
              "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
          },
        },
      }
    },
    async opencode(input) {
      const env = Env.all()
      const config = await Config.get()
      const hasKey =
        input.env.some((item) => env[item]) ||
        !!(await Auth.get(input.id)) ||
        !!config.provider?.["opencode"]?.options?.apiKey

      const models = hasKey ? input.models : pickBy(input.models, (m) => m.cost?.input === 0)

      return {
        autoload: Object.keys(models).length > 0,
        options: hasKey ? {} : { apiKey: "public" },
      }
    },
    openai: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, model: Model, _options?: Record<string, any>) {
          if (model && model.api.npm !== "@ai-sdk/openai") {
            return sdk.languageModel(model.api.id)
          }
          return sdk.responses(model.api.id)
        },
        options: {},
      }
    },
    "github-copilot": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, model: Model, _options?: Record<string, any>) {
          if (model && model.api.npm !== "@ai-sdk/github-copilot") {
            return sdk.languageModel(model.api.id)
          }
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(model.api.id)
          return shouldUseCopilotResponsesApi(model.api.id) ? sdk.responses(model.api.id) : sdk.chat(model.api.id)
        },
        options: {},
      }
    },
    "github-copilot-enterprise": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, model: Model, _options?: Record<string, any>) {
          if (model && model.api.npm !== "@ai-sdk/github-copilot") {
            return sdk.languageModel(model.api.id)
          }
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(model.api.id)
          return shouldUseCopilotResponsesApi(model.api.id) ? sdk.responses(model.api.id) : sdk.chat(model.api.id)
        },
        options: {},
      }
    },
    azure: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, model: Model, options?: Record<string, any>) {
          if (model && model.api.npm !== "@ai-sdk/azure") {
            return sdk.languageModel(model.api.id)
          }
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(model.api.id)
          }
          return sdk.responses(model.api.id)
        },
        options: {},
      }
    },
    "azure-cognitive-services": async () => {
      const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
      return {
        autoload: false,
        async getModel(sdk: any, model: Model, options?: Record<string, any>) {
          if (model && model.api.npm !== "@ai-sdk/azure") {
            return sdk.languageModel(model.api.id)
          }
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(model.api.id)
          }
          return sdk.responses(model.api.id)
        },
        options: {
          baseURL: resourceName ? `https://${resourceName}.cognitiveservices.azure.com/openai` : undefined,
        },
      }
    },
    "amazon-bedrock": async () => {
      const config = await Config.get()
      const providerConfig = config.provider?.["amazon-bedrock"]

      const auth = await Auth.get("amazon-bedrock")

      // Region precedence: 1) config file, 2) env var, 3) default
      const configRegion = providerConfig?.options?.region
      const envRegion = Env.get("AWS_REGION")
      const defaultRegion = configRegion ?? envRegion ?? "us-east-1"

      // Profile: config file takes precedence over env var
      const configProfile = providerConfig?.options?.profile
      const envProfile = Env.get("AWS_PROFILE")
      const profile = configProfile ?? envProfile

      const awsAccessKeyId = Env.get("AWS_ACCESS_KEY_ID")

      // TODO: Using process.env directly because Env.set only updates a process.env shallow copy,
      // until the scope of the Env API is clarified (test only or runtime?)
      const awsBearerToken = iife(() => {
        const envToken = process.env.AWS_BEARER_TOKEN_BEDROCK
        if (envToken) return envToken
        if (auth?.type === "api") {
          process.env.AWS_BEARER_TOKEN_BEDROCK = auth.key
          return auth.key
        }
        return undefined
      })

      const awsWebIdentityTokenFile = Env.get("AWS_WEB_IDENTITY_TOKEN_FILE")

      const containerCreds = Boolean(
        process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
      )

      if (!profile && !awsAccessKeyId && !awsBearerToken && !awsWebIdentityTokenFile && !containerCreds)
        return { autoload: false }

      const providerOptions: AmazonBedrockProviderSettings = {
        region: defaultRegion,
      }

      // Only use credential chain if no bearer token exists
      // Bearer token takes precedence over credential chain (profiles, access keys, IAM roles, web identity tokens)
      if (!awsBearerToken) {
        // Build credential provider options (only pass profile if specified)
        const credentialProviderOptions = profile ? { profile } : {}

        providerOptions.credentialProvider = fromNodeProviderChain(credentialProviderOptions)
      }

      // Add custom endpoint if specified (endpoint takes precedence over baseURL)
      const endpoint = providerConfig?.options?.endpoint ?? providerConfig?.options?.baseURL
      if (endpoint) {
        providerOptions.baseURL = endpoint
      }

      return {
        autoload: true,
        options: providerOptions,
        async getModel(sdk: any, model: Model, options?: Record<string, any>) {
          const modelID = model.api.id
          // Skip region prefixing if model already has a cross-region inference profile prefix
          // Models from models.dev may already include prefixes like us., eu., global., etc.
          const crossRegionPrefixes = ["global.", "us.", "eu.", "jp.", "apac.", "au."]
          if (crossRegionPrefixes.some((prefix) => modelID.startsWith(prefix))) {
            return sdk.languageModel(modelID)
          }

          // Region resolution precedence (highest to lowest):
          // 1. options.region from opencode.json provider config
          // 2. defaultRegion from AWS_REGION environment variable
          // 3. Default "us-east-1" (baked into defaultRegion)
          const region = options?.region ?? defaultRegion

          const resolved = iife(() => {
            const regionPrefix = region.split("-")[0]
            const modelID = model.api.id

            if (regionPrefix === "us") {
              const modelRequiresPrefix = [
                "nova-micro",
                "nova-lite",
                "nova-pro",
                "nova-premier",
                "nova-2",
                "claude",
                "deepseek",
              ].some((m) => modelID.includes(m))
              const isGovCloud = region.startsWith("us-gov")
              if (modelRequiresPrefix && !isGovCloud) {
                return { regionPrefix, modelID: `${regionPrefix}.${modelID}` }
              }
              return { regionPrefix, modelID }
            }

            if (regionPrefix === "eu") {
              const regionRequiresPrefix = [
                "eu-west-1",
                "eu-west-2",
                "eu-west-3",
                "eu-north-1",
                "eu-central-1",
                "eu-south-1",
                "eu-south-2",
                "eu-south-3",
              ].some((r) => region.includes(r))
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((m) =>
                modelID.includes(m),
              )
              if (regionRequiresPrefix && modelRequiresPrefix) {
                return { regionPrefix, modelID: `${regionPrefix}.${modelID}` }
              }
              return { regionPrefix, modelID }
            }

            if (regionPrefix === "ap") {
              const isAustraliaRegion = ["ap-southeast-2", "ap-southeast-4"].includes(region)
              const isTokyoRegion = region === "ap-northeast-1"
              if (
                isAustraliaRegion &&
                ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((m) => modelID.includes(m))
              ) {
                return { regionPrefix: "au", modelID: `au.${modelID}` }
              }
              if (isTokyoRegion) {
                // Tokyo region uses jp. prefix for cross-region inference
                const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                  modelID.includes(m),
                )
                if (modelRequiresPrefix) {
                  return { regionPrefix: "jp", modelID: `jp.${modelID}` }
                }
                return { regionPrefix, modelID }
              }

              // Other APAC regions use apac. prefix
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                modelID.includes(m),
              )
              if (modelRequiresPrefix) {
                return { regionPrefix: "apac", modelID: `apac.${modelID}` }
              }
              return { regionPrefix, modelID }
            }

            return { regionPrefix, modelID }
          })

          return sdk.languageModel(resolved.modelID)
        },
      }
    },
    openrouter: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }
    },
    vercel: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "http-referer": "https://opencode.ai/",
            "x-title": "opencode",
          },
        },
      }
    },
    "google-vertex": async (provider) => {
      const project =
        provider.options?.project ??
        Env.get("GOOGLE_CLOUD_PROJECT") ??
        Env.get("GCP_PROJECT") ??
        Env.get("GCLOUD_PROJECT")

      const location =
        provider.options?.location ?? Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-central1"

      const autoload = Boolean(project)
      if (!autoload) return { autoload: false }
      return {
        autoload: true,
        options: {
          project,
          location,
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const auth = new GoogleAuth()
            const client = await auth.getApplicationDefault()
            const token = await client.credential.getAccessToken()

            const headers = new Headers(init?.headers)
            headers.set("Authorization", `Bearer ${token.token}`)

            return fetch(input, { ...init, headers })
          },
        },
        async getModel(sdk: any, model: Model) {
          const id = String(model.api.id).trim()
          return sdk.languageModel(id)
        },
      }
    },
    "google-vertex-anthropic": async () => {
      const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
      const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "global"
      const autoload = Boolean(project)
      if (!autoload) return { autoload: false }
      return {
        autoload: true,
        options: {
          project,
          location,
        },
        async getModel(sdk: any, model: Model) {
          const id = String(model.api.id).trim()
          return sdk.languageModel(id)
        },
      }
    },
    "sap-ai-core": async () => {
      const auth = await Auth.get("sap-ai-core")
      // TODO: Using process.env directly because Env.set only updates a shallow copy (not process.env),
      // until the scope of the Env API is clarified (test only or runtime?)
      const envServiceKey = iife(() => {
        const envAICoreServiceKey = process.env.AICORE_SERVICE_KEY
        if (envAICoreServiceKey) return envAICoreServiceKey
        if (auth?.type === "api") {
          process.env.AICORE_SERVICE_KEY = auth.key
          return auth.key
        }
        return undefined
      })
      const deploymentId = process.env.AICORE_DEPLOYMENT_ID
      const resourceGroup = process.env.AICORE_RESOURCE_GROUP

      return {
        autoload: !!envServiceKey,
        options: envServiceKey ? { deploymentId, resourceGroup } : {},
        async getModel(sdk: any, model: Model) {
          return sdk(model.api.id)
        },
      }
    },
    zenmux: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }
    },
    gitlab: async (input) => {
      const instanceUrl = Env.get("GITLAB_INSTANCE_URL") || "https://gitlab.com"

      const auth = await Auth.get(input.id)
      const apiKey = await (async () => {
        if (auth?.type === "oauth") return auth.access
        if (auth?.type === "api") return auth.key
        return Env.get("GITLAB_TOKEN")
      })()

      const config = await Config.get()
      const providerConfig = config.provider?.["gitlab"]

      const aiGatewayHeaders = {
        "User-Agent": `opencode/${Installation.VERSION} gitlab-ai-provider/${GITLAB_PROVIDER_VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`,
        ...(providerConfig?.options?.aiGatewayHeaders || {}),
      }

      return {
        autoload: !!apiKey,
        options: {
          instanceUrl,
          apiKey,
          aiGatewayHeaders,
          featureFlags: {
            duo_agent_platform_agentic_chat: true,
            duo_agent_platform: true,
            ...(providerConfig?.options?.featureFlags || {}),
          },
        },
        async getModel(sdk: any, model: Model) {
          return sdk.agenticChat(model.api.id, {
            aiGatewayHeaders,
            featureFlags: {
              duo_agent_platform_agentic_chat: true,
              duo_agent_platform: true,
              ...(providerConfig?.options?.featureFlags || {}),
            },
          })
        },
      }
    },
    "cloudflare-workers-ai": async (input) => {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      if (!accountId) return { autoload: false }

      const apiKey = await iife(async () => {
        const envToken = Env.get("CLOUDFLARE_API_KEY")
        if (envToken) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })

      return {
        autoload: !!apiKey,
        options: {
          apiKey,
          baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
        },
        async getModel(sdk: any, model: Model) {
          return sdk.languageModel(model.api.id)
        },
      }
    },
    "cloudflare-ai-gateway": async (input) => {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      const gateway = Env.get("CLOUDFLARE_GATEWAY_ID")

      if (!accountId || !gateway) return { autoload: false }

      // Get API token from env or auth - required for authenticated gateways
      const apiToken = await (async () => {
        const envToken = Env.get("CLOUDFLARE_API_TOKEN") || Env.get("CF_AIG_TOKEN")
        if (envToken) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })()

      if (!apiToken) {
        throw new Error(
          "CLOUDFLARE_API_TOKEN (or CF_AIG_TOKEN) is required for Cloudflare AI Gateway. " +
          "Set it via environment variable or run `opencode auth cloudflare-ai-gateway`.",
        )
      }

      // Use official ai-gateway-provider package (v2.x for AI SDK v5 compatibility)
      const { createAiGateway } = await import("ai-gateway-provider")
      const { createUnified } = await import("ai-gateway-provider/providers/unified")

      const metadata = iife(() => {
        if (input.options?.metadata) return input.options.metadata
        try {
          return JSON.parse(input.options?.headers?.["cf-aig-metadata"])
        } catch {
          return undefined
        }
      })
      const opts = {
        metadata,
        cacheTtl: input.options?.cacheTtl,
        cacheKey: input.options?.cacheKey,
        skipCache: input.options?.skipCache,
        collectLog: input.options?.collectLog,
      }

      const aigateway = createAiGateway({
        accountId,
        gateway,
        apiKey: apiToken,
        ...(Object.values(opts).some((v) => v !== undefined) ? { options: opts } : {}),
      })
      const unified = createUnified()

      return {
        autoload: true,
        async getModel(_sdk: any, model: Model, _options?: Record<string, any>) {
          // Model IDs use Unified API format: provider/model (e.g., "anthropic/claude-sonnet-4-5")
          return aigateway(unified(model.api.id))
        },
        options: {
          baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/compat`,
          headers: {
            // Cloudflare AI Gateway uses cf-aig-authorization for authenticated gateways
            // This enables Unified Billing where Cloudflare handles upstream provider auth
            ...(apiToken ? { "cf-aig-authorization": `Bearer ${apiToken}` } : {}),
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
          // Custom fetch to handle parameter transformation and auth
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers)
            // Strip Authorization header - AI Gateway uses cf-aig-authorization instead
            headers.delete("Authorization")

            // Transform max_tokens to max_completion_tokens for newer models
            if (init?.body && init.method === "POST") {
              try {
                const body = JSON.parse(init.body as string)
                if (body.max_tokens !== undefined && !body.max_completion_tokens) {
                  body.max_completion_tokens = body.max_tokens
                  delete body.max_tokens
                  init = { ...init, body: JSON.stringify(body) }
                }
              } catch (e) {
                // If body parsing fails, continue with original request
              }
            }

            return fetch(input, { ...init, headers })
          },
        },
      }
    },
    cerebras: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "X-Cerebras-3rd-Party-Integration": "opencode",
          },
        },
      }
    },
    kilo: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }
    },
  }

  export const Model = z
    .object({
      id: z.string(),
      providerID: z.string(),
      api: z.object({
        id: z.string(),
        url: z.string(),
        npm: z.string(),
      }),
      name: z.string(),
      family: z.string().optional(),
      capabilities: z.object({
        temperature: z.boolean(),
        reasoning: z.boolean(),
        attachment: z.boolean(),
        toolcall: z.boolean(),
        input: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        output: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        interleaved: z.union([
          z.boolean(),
          z.object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          }),
        ]),
      }),
      cost: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
        experimentalOver200K: z
          .object({
            input: z.number(),
            output: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          })
          .optional(),
      }),
      limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
      }),
      status: z.enum(["alpha", "beta", "deprecated", "active"]),
      options: z.record(z.string(), z.any()),
      headers: z.record(z.string(), z.string()),
      release_date: z.string(),
      variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
    })
    .meta({
      ref: "Model",
    })
  export type Model = z.infer<typeof Model>

  export const Info = z
    .object({
      id: z.string(),
      name: z.string(),
      source: z.enum(["env", "config", "custom", "api"]),
      env: z.string().array(),
      key: z.string().optional(),
      options: z.record(z.string(), z.any()),
      models: z.record(z.string(), Model),
    })
    .meta({
      ref: "Provider",
    })
  export type Info = z.infer<typeof Info>

  function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Model {
    const m: Model = {
      id: model.id,
      providerID: provider.id,
      name: model.name,
      family: model.family,
      api: {
        id: model.id,
        url: model.provider?.api ?? provider.api!,
        npm: iife(() => {
          if (provider.id.startsWith("github-copilot")) return "@ai-sdk/github-copilot"
          return model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible"
        }),
      },
      status: model.status ?? "active",
      headers: model.headers ?? {},
      options: model.options ?? {},
      cost: {
        input: model.cost?.input ?? 0,
        output: model.cost?.output ?? 0,
        cache: {
          read: model.cost?.cache_read ?? 0,
          write: model.cost?.cache_write ?? 0,
        },
        experimentalOver200K: model.cost?.context_over_200k
          ? {
            cache: {
              read: model.cost.context_over_200k.cache_read ?? 0,
              write: model.cost.context_over_200k.cache_write ?? 0,
            },
            input: model.cost.context_over_200k.input,
            output: model.cost.context_over_200k.output,
          }
          : undefined,
      },
      limit: {
        context: model.limit.context,
        input: model.limit.input,
        output: model.limit.output,
      },
      capabilities: {
        temperature: model.temperature,
        reasoning: model.reasoning,
        attachment: model.attachment,
        toolcall: model.tool_call,
        input: {
          text: model.modalities?.input?.includes("text") ?? false,
          audio: model.modalities?.input?.includes("audio") ?? false,
          image: model.modalities?.input?.includes("image") ?? false,
          video: model.modalities?.input?.includes("video") ?? false,
          pdf: model.modalities?.input?.includes("pdf") ?? false,
        },
        output: {
          text: model.modalities?.output?.includes("text") ?? false,
          audio: model.modalities?.output?.includes("audio") ?? false,
          image: model.modalities?.output?.includes("image") ?? false,
          video: model.modalities?.output?.includes("video") ?? false,
          pdf: model.modalities?.output?.includes("pdf") ?? false,
        },
        interleaved: model.interleaved ?? false,
      },
      release_date: model.release_date,
      variants: {},
    }

    m.variants = mapValues(ProviderTransform.variants(m), (v) => v)

    return m
  }

  export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
    return {
      id: provider.id,
      source: "custom",
      name: provider.name,
      env: provider.env ?? [],
      options: {},
      models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
    }
  }

  const state = Instance.state(async () => {
    using _ = log.time("state")
    const config = await Config.get()
    const modelsDev = await ModelsDev.get()

    const initialDatabase = mapValues(modelsDev, fromModelsDevProvider)

    // Add GitHub Copilot Enterprise provider that inherits from GitHub Copilot
    const database = iife(() => {
      const githubCopilot = initialDatabase["github-copilot"]
      if (!githubCopilot) return initialDatabase
      return {
        ...initialDatabase,
        "github-copilot-enterprise": {
          ...githubCopilot,
          id: "github-copilot-enterprise",
          name: "GitHub Copilot Enterprise",
          models: mapValues(githubCopilot.models, (model) => ({
            ...model,
            providerID: "github-copilot-enterprise",
          })),
        },
      }
    })

    const disabled = new Set(config.disabled_providers ?? [])
    const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

    function isProviderAllowed(providerID: string): boolean {
      if (enabled && !enabled.has(providerID)) return false
      if (disabled.has(providerID)) return false
      return true
    }

    const languages = new Map<string, LanguageModelV2>()
    let modelLoaders: {
      [providerID: string]: CustomModelLoader
    } = {}
    const sdk = new Map<string, SDK>()

    log.info("init")

    // 1. Build initial providers from database + config extensions
    const providersFromConfig = Object.entries((config.provider ?? {}) as Record<string, any>).reduce(
      (acc: Record<string, Info>, [providerID, provider]: [string, any]) => {
        const existing = database[providerID]
        const parsed: Info = {
          id: providerID,
          name: provider.name ?? existing?.name ?? providerID,
          env: provider.env ?? existing?.env ?? [],
          options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
          source: "config",
          models: existing?.models ?? {},
        }

        const models = Object.entries((provider.models ?? {}) as Record<string, any>).reduce((mAcc: Record<string, Model>, [modelID, model]: [string, any]) => {
          const existingModel = parsed.models[model.id ?? modelID]
          const name = iife(() => {
            if (model.name) return model.name
            if (model.id && model.id !== modelID) return modelID
            return existingModel?.name ?? modelID
          })
          const parsedModel: Model = {
            id: modelID,
            api: {
              id: model.id ?? existingModel?.api.id ?? modelID,
              npm:
                model.provider?.npm ??
                provider.npm ??
                existingModel?.api.npm ??
                modelsDev[providerID]?.npm ??
                "@ai-sdk/openai-compatible",
              url: model.provider?.api ?? provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api,
            },
            status: model.status ?? existingModel?.status ?? "active",
            name,
            providerID,
            capabilities: {
              temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
              reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
              attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
              toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
              input: {
                text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
                audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
                image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
                video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
                pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
              },
              output: {
                text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
                audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
                image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
                video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
                pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
              },
              interleaved: model.interleaved ?? false,
            },
            cost: {
              input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
              output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
              cache: {
                read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
                write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
              },
            },
            options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
            limit: {
              context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
              output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
            },
            headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
            family: model.family ?? existingModel?.family ?? "",
            release_date: model.release_date ?? existingModel?.release_date ?? "",
            variants: {},
          }
          const merged = mergeDeep(ProviderTransform.variants(parsedModel), (model.variants ?? {}) as any)
          parsedModel.variants = mapValues(
            pickBy(merged as any, (v: any) => !v.disabled),
            (v) => omit(v as any, ["disabled"]),
          )
          return { ...mAcc, [modelID]: parsedModel }
        }, parsed.models)

        return { ...acc, [providerID]: { ...parsed, models } }
      },
      {} as Record<string, Info>,
    )

    // Update database with config-extended models
    Object.assign(database, providersFromConfig)

    // 2. Load from various sources (env, auth, plugins, loaders)
    const env = Env.all()
    const providersFromEnv = Object.entries(database).reduce((acc: Record<string, Info>, [providerID, provider]: [string, Info]) => {
      if (disabled.has(providerID)) return acc
      const apiKey = provider.env.map((item: string) => (env as any)[item]).find(Boolean)
      if (!apiKey) return acc
      return {
        ...acc,
        [providerID]: mergeDeep(acc[providerID] ?? database[providerID], {
          source: "env",
          key: provider.env.length === 1 ? apiKey : undefined,
        } as any),
      }
    }, providersFromConfig)

    const providersFromAuth = Object.entries(await Auth.all()).reduce((acc: Record<string, Info>, [providerID, provider]: [string, any]) => {
      if (disabled.has(providerID) || provider.type !== "api") return acc
      return {
        ...acc,
        [providerID]: mergeDeep(acc[providerID] ?? database[providerID], {
          source: "api",
          key: provider.key,
        } as any),
      }
    }, providersFromEnv)

    const plugins = await Plugin.list()
    const providersFromPlugins = await plugins.reduce(async (accPromise, plugin) => {
      const acc = await accPromise
      if (!plugin.auth) return acc
      const providerID = plugin.auth.provider
      if (disabled.has(providerID)) return acc

      const auth = await Auth.get(providerID)
      const enterpriseAuth = providerID === "github-copilot" ? await Auth.get("github-copilot-enterprise") : undefined
      const hasAuth = !!auth || !!enterpriseAuth

      if (!hasAuth || !plugin.auth.loader) return acc

      const nextAcc = iife(async () => {
        const withAuth = auth
          ? {
            ...acc,
            [providerID]: mergeDeep(acc[providerID] ?? database[providerID], {
              source: "custom",
              options: await plugin.auth!.loader!(() => Auth.get(providerID) as any, database[providerID]),
            } as any),
          }
          : acc

        if (providerID === "github-copilot") {
          const enterpriseProviderID = "github-copilot-enterprise"
          if (!disabled.has(enterpriseProviderID) && enterpriseAuth) {
            return {
              ...withAuth,
              [enterpriseProviderID]: mergeDeep(withAuth[enterpriseProviderID] ?? database[enterpriseProviderID], {
                source: "custom",
                options: await plugin.auth!.loader!(
                  () => Auth.get(enterpriseProviderID) as any,
                  database[enterpriseProviderID],
                ),
              } as any),
            }
          }
        }
        return withAuth
      })

      return nextAcc
    }, Promise.resolve(providersFromAuth))

    const finalProvidersWithLoaders = await Object.entries(CUSTOM_LOADERS).reduce(
      async (accPromise, [providerID, fn]) => {
        const acc = await accPromise
        if (disabled.has(providerID)) return acc
        const data = database[providerID]
        if (!data) {
          log.error("Provider does not exist in model list " + providerID)
          return acc
        }
        const result = await (fn as any)(data)
        if (result && (result.autoload || acc[providerID])) {
          return {
            ...acc,
            [providerID]: mergeDeep(acc[providerID] ?? database[providerID], {
              ...(acc[providerID] ? {} : { source: "custom" }),
              options: result.options,
            } as any),
          }
        }
        return acc
      },
      Promise.resolve(providersFromPlugins),
    )

    // Re-apply config to ensure it takes precedence
    const finalProviders = Object.entries((config.provider ?? {}) as Record<string, any>).reduce((acc: Record<string, Info>, [providerID, provider]: [string, any]) => {
      return {
        ...acc,
        [providerID]: mergeDeep(acc[providerID] ?? database[providerID], {
          source: "config",
          ...(provider.env ? { env: provider.env } : {}),
          ...(provider.name ? { name: provider.name } : {}),
          ...(provider.options ? { options: provider.options } : {}),
        } as any),
      }
    }, finalProvidersWithLoaders)

    modelLoaders = await Object.entries(CUSTOM_LOADERS).reduce(async (accPromise, [providerID, fn]) => {
      const acc = await accPromise
      if (disabled.has(providerID)) return acc
      const data = database[providerID]
      if (!data) return acc
      const result = await (fn as any)(data)
      if (result?.getModel && (result.autoload || (finalProviders as any)[providerID])) {
        return { ...acc, [providerID]: result.getModel }
      }
      return acc
    }, Promise.resolve({} as Record<string, CustomModelLoader>))

    // 3. Final filtering and model processing
    const filteredProviders = Object.fromEntries(
      (Object.entries(finalProviders) as any)
        .filter((entry: any) => isProviderAllowed(entry[0]))
        .map((entry: any) => {
          const [providerID, provider] = entry
          const configProvider = config.provider?.[providerID]
          const models = Object.fromEntries(
            Object.entries((provider.models ?? {}) as any).filter((mEntry: any) => {
              const [modelID, model] = mEntry
              model.api.id = model.api.id ?? model.id ?? modelID
              if (modelID === "gpt-5-chat-latest" || (providerID === "openrouter" && modelID === "openai/gpt-5-chat")) {
                return false
              }
              if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) {
                return false
              }
              if (model.status === "deprecated") {
                return false
              }
              if (
                (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
                (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
              ) {
                return false
              }

              // Filter out disabled variants from config
              const configVariants = (configProvider?.models as any)?.[modelID]?.variants
              if (configVariants && model.variants) {
                const merged = mergeDeep(model.variants, configVariants)
                model.variants = mapValues(
                  pickBy(merged as any, (v: any) => !v.disabled),
                  (v) => omit(v as any, ["disabled"]),
                )
              }

              return true
            }),
          )
          return [providerID, { ...provider, models }]
        })
        .filter((entry: any) => Object.keys(entry[1].models ?? {}).length > 0),
    )

    return {
      models: languages,
      providers: filteredProviders,
      sdk,
      modelLoaders,
    }
  })

  export async function list() {
    return state().then((state) => state.providers)
  }

  async function getSDK(model: Model) {
    try {
      using _ = log.time("getSDK", {
        providerID: model.providerID,
      })
      const s = await state()
      const provider = s.providers[model.providerID]
      const options = { ...provider.options }

      if (model.providerID === "google-vertex" && !model.api.npm.includes("@ai-sdk/openai-compatible")) {
        delete options.fetch
      }

      if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
        options["includeUsage"] = true
      }

      const baseURL = loadBaseURL(model, options)
      if (baseURL !== undefined) options["baseURL"] = baseURL
      if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key
      if (model.headers)
        options["headers"] = {
          ...options["headers"],
          ...model.headers,
        }

      const key = Hash.fast(JSON.stringify({ providerID: model.providerID, npm: model.api.npm, options }))
      const existing = s.sdk.get(key)
      if (existing) return existing

      const customFetch = options["fetch"]

      options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
        // Preserve custom fetch if it exists, wrap it with timeout logic
        const fetchFn = customFetch ?? fetch
        const opts = init ?? {}

        if (options["timeout"] !== undefined && options["timeout"] !== null) {
          const signals: AbortSignal[] = []
          if (opts.signal) signals.push(opts.signal)
          if (options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]))

          const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

          opts.signal = combined
        }

        // Strip openai itemId metadata following what codex does
        // Codex uses #[serde(skip_serializing)] on id fields for all item types:
        // Message, Reasoning, FunctionCall, LocalShellCall, CustomToolCall, WebSearchCall
        // IDs are only re-attached for Azure with store=true
        const stripIds = options["stripIds"] !== false
        if (
          stripIds &&
          model.api.npm === "@ai-sdk/openai" &&
          opts.body &&
          opts.method === "POST" &&
          (opts.body as string).includes('"id"')
        ) {
          const body = JSON.parse(opts.body as string)
          const isAzure = model.providerID.includes("azure") || model.api.npm.includes("azure")
          const keepIds = isAzure && body.store === true
          if (!keepIds && Array.isArray(body.input)) {
            const input = body.input.map((item: any) => {
              if (item && typeof item === "object" && "id" in item) {
                const { id, ...rest } = item
                return rest
              }
              return item
            })
            const changed = input.some((item: any, index: number) => item !== body.input[index])
            if (changed) {
              opts.body = JSON.stringify({ ...body, input })
            }
          }
        }

        return fetchFn(input, {
          ...opts,
          // @ts-ignore see here: https://github.com/oven-sh/bun/issues/16682
          timeout: false,
        })
      }

      const bundledFn = BUNDLED_PROVIDERS[model.api.npm]
      if (bundledFn) {
        log.info("using bundled provider", { providerID: model.providerID, pkg: model.api.npm })
        const loaded = bundledFn({
          name: model.providerID,
          ...options,
        })
        s.sdk.set(key, loaded)
        return loaded as SDK
      }

      const installedPath = iife(async () => {
        if (!model.api.npm.startsWith("file://")) {
          return await BunProc.install(model.api.npm, "latest")
        }
        log.info("loading local provider", { pkg: model.api.npm })
        return model.api.npm
      })

      const mod = await import(await installedPath)

      const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
      const loaded = fn({
        name: model.providerID,
        ...options,
      })
      s.sdk.set(key, loaded)
      return loaded as SDK
    } catch (e) {
      throw new InitError({ providerID: model.providerID }, { cause: e })
    }
  }

  export async function getProvider(providerID: string) {
    return state().then((s) => s.providers[providerID])
  }

  export async function getModel(providerID: string, modelID: string) {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) {
      const availableProviders = Object.keys(s.providers)
      const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }

    const info = provider.models[modelID]
    if (!info) {
      const availableModels = Object.keys(provider.models)
      const matches = fuzzysort.go(modelID, availableModels, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    return info
  }

  export async function getLanguage(model: Model): Promise<LanguageModelV2> {
    const s = await state()
    const key = `${model.providerID}/${model.id}`
    if (s.models.has(key)) return s.models.get(key)!

    const provider = s.providers[model.providerID]
    const sdk = await getSDK(model)

    try {
      const loader = s.modelLoaders[model.providerID]
      const language = loader ? await loader(sdk, model, provider.options) : sdk.languageModel(model.api.id)
      s.models.set(key, language)
      return language
    } catch (e) {
      if (e instanceof NoSuchModelError)
        throw new ModelNotFoundError(
          {
            modelID: model.id,
            providerID: model.providerID,
          },
          { cause: e },
        )
      throw e
    }
  }

  export async function closest(providerID: string, query: string[]) {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) return undefined

    const match = query
      .map((item) => {
        const modelID = Object.keys(provider.models).find((id) => id.includes(item))
        return modelID ? { providerID, modelID } : undefined
      })
      .find(Boolean)

    return match
  }

  export async function getSmallModel(providerID: string) {
    const cfg = await Config.get()

    if (cfg.small_model) {
      const parsed = parseModel(cfg.small_model)
      return getModel(parsed.providerID, parsed.modelID)
    }

    const provider = await state().then((state) => state.providers[providerID])
    if (!provider) {
      // Check if opencode provider is available before using it
      const opencodeProvider = await state().then((state) => state.providers["opencode"])
      if (opencodeProvider && opencodeProvider.models["gpt-5-nano"]) {
        return getModel("opencode", "gpt-5-nano")
      }
      return undefined
    }

    const priority = iife(() => {
      if (providerID.startsWith("opencode")) return ["gpt-5-nano"]
      if (providerID.startsWith("github-copilot")) {
        return ["gpt-5-mini", "claude-haiku-4.5", "claude-haiku-4-5", "3-5-haiku", "3.5-haiku", "gemini-3-flash", "gemini-2.5-flash"]
      }
      return [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
    })
    for (const item of priority) {
      if (providerID === "amazon-bedrock") {
        const crossRegionPrefixes = ["global.", "us.", "eu."]
        const candidates = Object.keys(provider.models).filter((m) => m.includes(item))

        // Model selection priority:
        // 1. global. prefix (works everywhere)
        // 2. User's region prefix (us., eu.)
        // 3. Unprefixed model
        const globalMatch = candidates.find((m) => m.startsWith("global."))
        if (globalMatch) return getModel(providerID, globalMatch)

        const region = provider.options?.region
        if (region) {
          const regionPrefix = region.split("-")[0]
          if (regionPrefix === "us" || regionPrefix === "eu") {
            const regionalMatch = candidates.find((m) => m.startsWith(`${regionPrefix}.`))
            if (regionalMatch) return getModel(providerID, regionalMatch)
          }
        }

        const unprefixed = candidates.find((m) => !crossRegionPrefixes.some((p) => m.startsWith(p)))
        if (unprefixed) return getModel(providerID, unprefixed)
      } else {
        for (const model of Object.keys(provider.models)) {
          if (model.includes(item)) return getModel(providerID, model)
        }
      }
    }

    // Check if opencode provider is available before using it
    const opencodeProvider = await state().then((state) => state.providers["opencode"])
    if (opencodeProvider && opencodeProvider.models["gpt-5-nano"]) {
      return getModel("opencode", "gpt-5-nano")
    }

    return undefined
  }

  const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
  export function sort(models: Model[]) {
    return sortBy(
      models,
      [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
      [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
      [(model) => model.id, "desc"],
    )
  }

  export async function defaultModel() {
    const cfg = await Config.get()
    if (cfg.model) return parseModel(cfg.model)

    const providers = await list()
    const recent = (await Filesystem.readJson<{ recent?: { providerID: string; modelID: string }[] }>(
      path.join(Global.Path.state, "model.json"),
    )
      .then((x) => (Array.isArray(x.recent) ? x.recent : []))
      .catch(() => [])) as { providerID: string; modelID: string }[]
    for (const entry of recent) {
      const provider = providers[entry.providerID]
      if (!provider) continue
      if (!provider.models[entry.modelID]) continue
      return { providerID: entry.providerID, modelID: entry.modelID }
    }

    const provider = Object.values(providers).find((p) => !cfg.provider || Object.keys(cfg.provider).includes(p.id))
    if (!provider) throw new Error("no providers found")
    const [model] = (Object.values(provider.models) as Model[]).sort(() => Math.random() - 0.5)
    if (!model) throw new Error("no models found")
    return {
      providerID: provider.id,
      modelID: model.id,
    }
  }

  export function parseModel(model: string) {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: providerID,
      modelID: rest.join("/"),
    }
  }

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: z.string(),
      modelID: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: z.string(),
    }),
  )

  export function resolveModelBaseURL(model: Model, options: Record<string, any>): string {
    const template = model.api?.url ?? ""
    if (!template) return ""
    const matches = [...template.matchAll(/{{([^}]+)}}/g)]
    if (matches.length === 0) return template
    return matches.reduce((url, match) => {
      const keys = match[1].split("|").map((item) => item.trim())
      const resolved = keys
        .map((key) => Env.get(key) ?? options[key])
        .find((value) => value !== undefined && value !== null && value !== "")
      if (resolved === undefined || resolved === null || resolved === "") return url
      return url.replaceAll(match[0], String(resolved))
    }, template)
  }
}
