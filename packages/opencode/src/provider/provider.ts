import z from "zod"
import os from "os"
import fuzzysort from "fuzzysort"
import { Config } from "../config/config"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
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
      const { createOpenaiCompatible } = await import("./sdk/openai-compatible/src")
      return (createOpenaiCompatible as any)(options)
    },
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

      const models = hasKey ? input.models : pickBy(input.models, (m) => m.cost.input === 0)

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
  }

  export async function load(
    id: string,
    model: Model,
    options?: Record<string, any>,
  ): Promise<SDK> {
    const provider = await Auth.get(id)

    // Load bundled provider or fallback to dynamic import
    const loader = BUNDLED_PROVIDERS[id]
    if (loader) {
      const customLoader = CUSTOM_LOADERS[id]
      const customConfig = customLoader ? await customLoader(provider) : { autoload: false, options: {} }
      
      const providerOptions = {
        ...customConfig.options,
        ...options,
        ...provider.options,
      }

      const sdk = await loader(providerOptions)
      
      // If the custom loader has a specific getModel implementation, use it
      if (customConfig.getModel) {
        return {
          ...sdk,
          languageModel: (modelID: string) => customConfig.getModel!(sdk, model, options),
          // We map all SDK methods to use the custom getModel to ensure consistent behavior
          chat: (modelID: string) => customConfig.getModel!(sdk, model, options),
          completion: (modelID: string) => customConfig.getModel!(sdk, model, options),
        } as any
      }
      
      return sdk
    }

    // Fallback to Vercel AI SDK registry loading
    throw new NamedError.ProviderNotFound({ provider: id })
  }

  // Schema for provider configuration
  export const Info = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(["api", "oauth", "wellknown"]),
    key: z.string().optional(),
    token: z.string().optional(),
    options: z.record(z.string(), z.any()).optional(),
    models: z.record(z.string(), ModelsDev).optional(),
    env: z.array(z.string()).default([]),
  })
  export type Info = z.infer<typeof Info>

  export const Model = z.object({
    api: z.object({
      id: z.string(),
      npm: z.string().optional(),
    }),
    cost: z.object({
      input: z.number(),
      output: z.number(),
    }),
  })
  export type Model = z.infer<typeof Model>
}
