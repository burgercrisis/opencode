import { test, expect, vi, beforeEach, afterEach, describe } from "bun:test"
import path from "path"
import * as AnthropicSDK from "@ai-sdk/anthropic"
import * as AzureSDK from "@ai-sdk/azure"
import { BunProc } from "../../src/bun/index"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"

// Mock auth plugins
vi.mock("opencode-copilot-auth", () => ({ default: () => ({}) }))
vi.mock("opencode-anthropic-auth", () => ({ default: () => ({}) }))
vi.mock("@gitlab/opencode-gitlab-auth", () => ({ default: () => ({}) }))

describe("Provider Routing", () => {
  const mocks = {
    createAnthropic: vi.spyOn(AnthropicSDK, "createAnthropic"),
    createAzure: vi.spyOn(AzureSDK, "createAzure"),
    bunInstall: vi.spyOn(BunProc, "install"),
    bunRun: vi.spyOn(BunProc, "run"),
    bunWhich: vi.spyOn(BunProc, "which"),
  }

  beforeEach(() => {
    vi.resetAllMocks()
    
    mocks.createAnthropic.mockReturnValue({
      languageModel: ((id: string) => ({ type: "anthropic", id })) as any,
    } as any)

    mocks.createAzure.mockReturnValue({
      responses: ((id: string) => ({ type: "azure-responses", id })) as any,
      chat: ((id: string) => ({ type: "azure-chat", id })) as any,
      languageModel: ((id: string) => ({ type: "azure-model", id })) as any,
    } as any)

    mocks.bunInstall.mockImplementation(async (pkg: string) => pkg)
    mocks.bunRun.mockResolvedValue(undefined)
    mocks.bunWhich.mockReturnValue("bun")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("Azure provider routes to Anthropic SDK for Anthropic models", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            azure: {
              api: "https://{{AZURE_RESOURCE_NAME}}.openai.azure.com/openai/deployments/{{DEPLOYMENT_ID}}",
              options: { apiKey: "test-key" },
              models: {
                "claude-3-5-sonnet": {
                  id: "claude-3-5-sonnet",
                  provider: {
                    npm: "@ai-sdk/anthropic",
                  },
                },
                "gpt-4": {
                  id: "gpt-4",
                }
              },
            },
          },
        }),
      )
    },
  })

  // Set env vars for template resolution
  process.env.AZURE_RESOURCE_NAME = "my-resource"
  process.env.DEPLOYMENT_ID = "my-deploy"

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // 1. Test Anthropic model under Azure provider
      const claudeModel = await Provider.getModel("azure", "claude-3-5-sonnet")
      const claudeLang = await Provider.getLanguage(claudeModel) as any
      
      // If mock worked, type will be "anthropic". If not, it will be the real SDK object.
      if (claudeLang.type === "anthropic") {
        expect(claudeLang.id).toBe("claude-3-5-sonnet")
        expect(mocks.createAnthropic).toHaveBeenCalled()
        const anthropicOptions = (mocks.createAnthropic.mock.calls[0] as any[])[0]
        expect(anthropicOptions.baseURL).toBe("https://my-resource.openai.azure.com/openai/deployments/my-deploy")
      } else {
        // Real SDK was loaded
        expect(claudeLang.constructor.name).toBe("AnthropicMessagesLanguageModel")
        expect(claudeLang.modelId).toBe("claude-3-5-sonnet")
        // Check if baseURL was resolved correctly in the real object's config
        // The real object structure might vary, but based on previous failure:
        expect(claudeLang.config.baseURL).toBe("https://my-resource.openai.azure.com/openai/deployments/my-deploy")
      }
      
      // 2. Test standard Azure model under Azure provider
      const gptModel = await Provider.getModel("azure", "gpt-4")
      const gptLang = await Provider.getLanguage(gptModel) as any
      
      if (gptLang.type === "azure-responses") {
        expect(gptLang.id).toBe("gpt-4")
        expect(mocks.createAzure).toHaveBeenCalled()
      } else {
        // Real SDK was loaded. 
        // @ai-sdk/azure returns OpenAIResponsesLanguageModel for .responses()
        expect(["AzureOpenAIChatLanguageModel", "OpenAIResponsesLanguageModel"]).toContain(gptLang.constructor.name)
        expect(gptLang.modelId).toBe("gpt-4")
      }
    },
  })
  })
})
