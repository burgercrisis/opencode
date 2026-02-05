import z from "zod"
import os from "os"
import fuzzysort from "fuzzysort"
import { Config } from "../config/config"
import { mapValues, mergeDeep, omit, pickBy, sortBy, unique } from "remeda"
import { NoSuchModelError, type Provider as SDK } from "ai"
import { Log } from "../util/log"
import { BunProc } from "../bun"
import { Plugin } from "../plugin"
import { ModelsDev } from "./models"
import { NamedError } from "@opencode-ai/util/error"
import { Auth } from "../auth"
import { Env } from "../env"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { iife } from "@/util/iife"
import { ProviderTransform } from "./transform"
import type { AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
import type { LanguageModelV2 } from "@openrouter/ai-sdk-provider"

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

  // Bundled providers are loaded dynamically to improve cold-start performance
  const BUNDLED_PROVIDERS: Record<string, (options: any) => Promise<SDK>> = {
    "@ai-sdk/amazon-bedrock": async (options) => {
      const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")
      return createAmazonBedrock(options)
    },
    "@ai-sdk/anthropic": async (options) => {
      const { createAnthropic } = await import("@ai-sdk/anthropic")
      return createAnthropic(options)
    },
    "@ai-sdk/azure": async (options) => {
      const { createAzure } = await import("@ai-sdk/azure")
      return createAzure(options)
    },
    "@ai-sdk/google": async (options) => {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
      return createGoogleGenerativeAI(options)
    },
    "@ai-sdk/google-vertex": async (options) => {
      const { createVertex } = await import("@ai-sdk/google-vertex")
      return createVertex(options)
    },
    "@ai-sdk/google-vertex/anthropic": async (options) => {
      const { createVertexAnthropic } = await import("@ai-sdk/google-vertex/anthropic")
      return createVertexAnthropic(options)
    },
    "@ai-sdk/openai": async (options) => {
      const { createOpenAI } = await import("@ai-sdk/openai")
      return createOpenAI(options)
    },
    "@ai-sdk/openai-compatible": async (options) => {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible")
      return createOpenAICompatible(options)
    },
    "@openrouter/ai-sdk-provider": async (options) => {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")
      return createOpenRouter(options)
    },
    "@ai-sdk/xai": async (options) => {
      const { createXai } = await import("@ai-sdk/xai")
      return createXai(options)
    },
    "@ai-sdk/mistral": async (options) => {
      const { createMistral } = await import("@ai-sdk/mistral")
      return createMistral(options)
    },
    "@ai-sdk/groq": async (options) => {
      const { createGroq } = await import("@ai-sdk/groq")
      return createGroq(options)
    },
    "@ai-sdk/deepinfra": async (options) => {
      const { createDeepInfra } = await import("@ai-sdk/deepinfra")
      return createDeepInfra(options)
    },
    "@ai-sdk/cerebras": async (options) => {
      const { createCerebras } = await import("@ai-sdk/cerebras")
      return createCerebras(options)
    },
    "@ai-sdk/cohere": async (options) => {
      const { createCohere } = await import("@ai-sdk/cohere")
      return createCohere(options)
    },
    "@ai-sdk/gateway": async (options) => {
      const { createGateway } = await import("@ai-sdk/gateway")
      return createGateway(options)
    },
    "@ai-sdk/togetherai": async (options) => {
      const { createTogetherAI } = await import("@ai-sdk/togetherai")
      return createTogetherAI(options)
    },
    "@ai-sdk/perplexity": async (options) => {
      const { createPerplexity } = await import("@ai-sdk/perplexity")
      return createPerplexity(options)
    },
    "@ai-sdk/vercel": async (options) => {
      const { createVercel } = await import("@ai-sdk/vercel")
      return createVercel(options)
    },
    "@gitlab/gitlab-ai-provider": async (options) => {
      const { createGitLab } = await import("@gitlab/gitlab-ai-provider")
      return createGitLab(options)
    },
    "@ai-sdk/github-copilot": async (options) => {
      const { createOpenaiCompatible } = await import("./sdk/copilot")
      return (createOpenaiCompatible as any)(options)
    },
  }

  type CustomModelLoader = (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
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

      const models = hasKey ? input.models : pickBy(input.models, (m) => m.cost.input === 0)

      return {
        autoload: Object.keys(models).length > 0,
        options: hasKey ? {} : { apiKey: "public" },
      }
    },
    openai: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          return sdk.responses(modelID)
        },
        options: {},
      }
    },
    "github-copilot": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID)
          return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
        },
        options: {},
      }
    },
    "github-copilot-enterprise": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID)
          return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
        },
        options: {},
      }
    },
    azure: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(modelID)
          }
          return sdk.responses(modelID)
        },
        options: {},
      }
    },
    "azure-cognitive-services": async () => {
      const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(modelID)
          }
          return sdk.responses(modelID)
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

      if (!profile && !awsAccessKeyId && !awsBearerToken && !awsWebIdentityTokenFile) return { autoload: false }

      const providerOptions: AmazonBedrockProviderSettings = {
        region: defaultRegion,
      }

      // Only use credential chain if no bearer token exists
      // Bearer token takes precedence over credential chain (profiles, access keys, IAM roles, web identity tokens)
      if (!awsBearerToken) {
        const { fromNodeProviderChain } = await import(await BunProc.install("@aws-sdk/credential-providers"))

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
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
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
              if (isAustraliaRegion && modelID.includes("claude")) {
                return { regionPrefix: "au", modelID: `au.${modelID}` }
              }
              if (isTokyoRegion && modelID.includes("claude")) {
                const isHaiku = modelID.includes("haiku")
                const isSonnet = modelID.includes("sonnet")
                if (isHaiku || isSonnet) {
                  return { regionPrefix: "jp", modelID: `jp.${modelID}` }
                }
              }
              const modelRequiresPrefix = [
                "nova-micro",
                "nova-lite",
                "nova-pro",
                "claude",
                "llama3",
              ].some((m) => modelID.includes(m))
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
    "google-vertex": async () => {
      const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
      const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-east5"
      const autoload = Boolean(project)
      if (!autoload) return { autoload: false }
      return {
        autoload: true,
        options: {
          project,
          location,
        },
        async getModel(sdk: any, modelID: string) {
          const id = String(modelID).trim()
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
        async getModel(sdk: any, modelID: string) {
          const id = String(modelID).trim()
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
        async getModel(sdk: any, modelID: string) {
          return sdk(modelID)
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

      return {
        autoload: !!apiKey,
        options: {
          instanceUrl,
          apiKey,
          featureFlags: {
            duo_agent_platform_agentic_chat: true,
            duo_agent_platform: true,
            ...(providerConfig?.options?.featureFlags || {}),
          },
        },
        async getModel(sdk: any, modelID: string) {
          return sdk.agenticChat(modelID, {
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
        async getModel(sdk: any, modelID: string) {
          return sdk.languageModel(modelID)
        },
      }
    },
    "cloudflare-ai-gateway": async (input) => {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      const gateway = Env.get("CLOUDFLARE_GATEWAY_ID")

      if (!accountId || !gateway) return { autoload: false }

      // Get API token from env or auth prompt
      const apiToken = await (async () => {
        const envToken = Env.get("CLOUDFLARE_API_TOKEN")
        if (envToken) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })()

      return {
        autoload: true,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          return sdk.languageModel(modelID)
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
  }

  function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model, modelID: string): Model {
    const m: Model = {
      id: modelID,
      providerID: provider.id,
      name: model.name ?? modelID,
      family: model.family,
      api: {
        id: model.id ?? modelID,
        url: provider.api ?? "",
        npm: iife(() => {
          if (provider.id.startsWith("github-copilot")) return "@ai-sdk/github-copilot"
          return model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible"
        }),
      },
      status: (model.status as any) ?? "active",
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
        context: model.limit?.context ?? 0,
        input: model.limit?.input ?? 0,
        output: model.limit?.output ?? 0,
      },
      capabilities: {
        temperature: model.temperature ?? false,
        reasoning: model.reasoning ?? false,
        attachment: model.attachment ?? false,
        toolcall: model.tool_call ?? true,
        input: {
          text: model.modalities?.input?.includes("text") ?? true,
          audio: model.modalities?.input?.includes("audio") ?? false,
          image: model.modalities?.input?.includes("image") ?? false,
          video: model.modalities?.input?.includes("video") ?? false,
          pdf: model.modalities?.input?.includes("pdf") ?? false,
        },
        output: {
          text: model.modalities?.output?.includes("text") ?? true,
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

    const generated = ProviderTransform.variants(m)
    const custom = model.variants ?? {}

    // 1. Merge generated and custom variants
    // Custom variants override generated ones if keys match
    const merged = mergeDeep(generated, custom)

    // 2. Filter out disabled variants and strip the 'disabled' key
    m.variants = mapValues(
      pickBy(merged, (v) => v.disabled !== true),
      (v) => omit(v, ["disabled"]),
    )

    return m
  }

  export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
    return {
      id: provider.id,
      source: "api",
      name: provider.name,
      env: provider.env ?? [],
      options: {},
      models: mapValues(provider.models, (model, id) => fromModelsDevModel(provider, model, id)),
    }
  }

  export const state = Instance.state(async () => {
    const config = await Config.get()
    const data = await ModelsDev.get()

    const providers: Record<string, Info> = {}
    const modelLoaders: Record<string, CustomModelLoader> = {}

    const allProviderIDs = unique([...Object.keys(data), ...Object.keys(config.provider ?? {})])

    for (const id of allProviderIDs) {
      const provider = data[id] ?? {
        id,
        name: id,
        models: {},
        env: [],
      }

      // Merge user configuration
      const userConfig = config.provider?.[id]
      const mergedProvider = userConfig
        ? {
            ...provider,
            ...userConfig,
            models: mergeDeep(provider.models, userConfig.models ?? {}),
          }
        : provider

      const info = fromModelsDevProvider(mergedProvider)

      if (userConfig) {
        if (userConfig.name) info.name = userConfig.name
        info.options = mergeDeep(info.options, userConfig.options ?? {})
        info.source = "config"
      } else {
        info.source = "api"
      }

      // Filtering logic
      if (config.enabled_providers?.length) {
        if (!config.enabled_providers.includes(id)) continue
      } else if (config.enabled_providers?.length === 0) {
        continue
      }
      if (config.disabled_providers?.includes(id)) continue

      const env = Env.all()
      const matchingEnv = info.env.find((item) => env[item])

      const customLoader = CUSTOM_LOADERS[id]
      if (customLoader) {
        const custom = await customLoader(info)
        if (custom.getModel) modelLoaders[id] = custom.getModel
        info.options = mergeDeep(info.options, custom.options ?? {})

        const isAutoload = custom.autoload || !!matchingEnv
        if (!isAutoload && info.source === "api" && !process.env.OPENCODE_DISABLE_MODELS_FETCH) continue
        if (isAutoload && info.source === "api") info.source = "env"
        if (matchingEnv && info.env.length === 1) info.key = env[matchingEnv]
      } else {
        // Fallback to env var check for generic providers
        if (!matchingEnv && !process.env.OPENCODE_DISABLE_MODELS_FETCH) continue
        if (matchingEnv) {
          if (info.env.length === 1) info.key = env[matchingEnv]
          if (info.source === "api") info.source = "env"
        }
      }

      // Filter models based on whitelist/blacklist
      if (config.provider?.[id]) {
        const { whitelist, blacklist } = config.provider[id]
        if (whitelist?.length) {
          info.models = pickBy(info.models, (m) => whitelist.includes(m.id))
        }
        if (blacklist?.length) {
          info.models = pickBy(info.models, (m) => !blacklist.includes(m.id))
        }
      }

      // Remove provider if no models left and not a custom model loader
      if (Object.keys(info.models).length === 0 && !modelLoaders[id]) continue

      providers[id] = info
    }

    return {
      providers,
      modelLoaders,
      models: new Map<string, LanguageModelV2>(),
    }
  })

  export async function list() {
    return state().then((s) => s.providers)
  }

  export async function get(providerID: string) {
    return state().then((s) => s.providers[providerID])
  }

  export const getProvider = get

  async function getSDK(model: Model): Promise<SDK> {
    const s = await state()
    const provider = s.providers[model.providerID]
    const id = model.api.npm

    // Load bundled provider or fallback to dynamic import
    const loader = BUNDLED_PROVIDERS[id]
    if (loader) {
      return loader({
        ...provider.options,
        ...model.options,
        headers: {
          ...provider.options?.headers,
          ...model.headers,
        },
      })
    }

    throw new ProviderNotFoundError({ provider: id })
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
      const language = s.modelLoaders[model.providerID]
        ? await s.modelLoaders[model.providerID](sdk, model.api.id, provider.options)
        : sdk.languageModel(model.api.id)
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
    for (const item of query) {
      for (const modelID of Object.keys(provider.models)) {
        if (modelID.includes(item))
          return {
            providerID,
            modelID,
          }
      }
    }
  }

  export async function getSmallModel(providerID: string) {
    const cfg = await Config.get()

    if (cfg.small_model) {
      const parsed = parseModel(cfg.small_model)
      return getModel(parsed.providerID, parsed.modelID)
    }

    const provider = await state().then((state) => state.providers[providerID])
    if (provider) {
      let priority = [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
      if (providerID.startsWith("opencode")) {
        priority = ["gpt-5-nano"]
      }
      if (providerID.startsWith("github-copilot")) {
        // prioritize free models for github copilot
        priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
      }
      for (const item of priority) {
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

    const provider = await list()
      .then((val) => Object.values(val))
      .then((x) => x.find((p) => !cfg.provider || Object.keys(cfg.provider).includes(p.id)))
    if (!provider) throw new Error("no providers found")
    const [model] = sort(Object.values(provider.models))
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

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: z.string(),
      modelID: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const ProviderNotFoundError = NamedError.create(
    "ProviderNotFoundError",
    z.object({
      provider: z.string(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: z.string(),
    }),
  )
}
