import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { SessionCompaction } from "./compaction"
import { Config } from "../config/config"
import { Session } from "./index"
import { Identifier } from "../id/id"
import { Agent } from "@/agent/agent"
import { Provider } from "../provider/provider"
import { Plugin } from "@/plugin"
import { Bus } from "@/bus"
import { Instance } from "../project/instance"

// Mock dependencies
mock.module("../config/config", () => ({
  Config: {
    get: mock()
  }
}))

mock.module("./index", () => ({
  Session: {
    messages: mock(),
    updateMessage: mock(),
    updatePart: mock()
  }
}))

mock.module("@/agent/agent", () => ({
  Agent: {
    get: mock()
  }
}))

mock.module("../provider/provider", () => ({
  Provider: {
    getModel: mock()
  }
}))

mock.module("@/plugin", () => ({
  Plugin: {
    trigger: mock()
  }
}))

mock.module("@/bus", () => ({
  Bus: {
    publish: mock()
  }
}))

mock.module("../project/instance", () => ({
  Instance: {
    directory: "/test/directory",
    worktree: "/test/worktree",
    disposeAll: mock().mockResolvedValue(undefined),
    resetForTest: mock().mockResolvedValue(undefined)
  }
}))

describe("SessionCompaction", () => {
  beforeEach(() => {
    // Reset mocks between tests
    Config.get.mockClear()
    Session.messages.mockClear()
    Session.updateMessage.mockClear()
    Session.updatePart.mockClear()
    Agent.get.mockClear()
    Provider.getModel.mockClear()
    Plugin.trigger.mockClear()
    Bus.publish.mockClear()
  })

  afterEach(() => {
    // Bun handles cleanup automatically
  })

  describe("isOverflow", () => {
    test("returns false when auto compaction is disabled", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: false }
      } as any)

      const input = {
        tokens: {
          input: 150000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 128000,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(false)
    })

    test("returns true when model context limit is 0 (uses fallback)", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      const input = {
        tokens: {
          input: 150000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 0,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(true)
    })

    test("returns true when usage exceeds limit", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      const input = {
        tokens: {
          input: 100000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 50000,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(true)
    })

    test("returns false when usage is within limit", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      const input = {
        tokens: {
          input: 10000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 50000,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(false)
    })

    test("uses total tokens when available", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      const input = {
        tokens: {
          total: 60000,
          input: 10000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 50000,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(true)
    })

    test("respects custom reserved tokens", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { 
          auto: true,
          reserved: 5000
        }
      } as any)

      const input = {
        tokens: {
          input: 45000,
          output: 1000,
          cache: { read: 0, write: 0 }
        },
        model: {
          id: "test-model",
          limit: {
            context: 50000,
            output: 4096
          }
        }
      }

      const result = await SessionCompaction.isOverflow(input)
      expect(result).toBe(true)
    })
  })

  describe("prune", () => {
    test("returns early when prune is disabled", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { prune: false }
      } as any)

      await SessionCompaction.prune({ sessionID: "ses-test" })
      
      expect(Session.messages).not.toHaveBeenCalled()
    })

    test("processes messages and finds tool calls to prune", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { prune: true }
      } as any)

      // The prune logic goes backwards through messages
      // It only processes parts when turns >= 2 (turns increments on user messages)
      // So we need tool calls BEFORE at least 2 user messages (going backwards)
      // Structure: [user, assistant with tools, user, assistant] - going backwards, turns becomes 2 at the last user
      const mockMessages = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "read",
              state: {
                status: "completed",
                time: {},
                output: "a".repeat(100000)
              }
            },
            {
              type: "tool",
              tool: "edit",
              state: {
                status: "completed",
                time: {},
                output: "b".repeat(100000)
              }
            }
          ]
        },
        {
          info: { role: "user" },
          parts: []
        },
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "bash",
              state: {
                status: "completed",
                time: {},
                output: "c".repeat(100000)
              }
            }
          ]
        },
        {
          info: { role: "user" },
          parts: []
        }
      ]

      spyOn(Session, "messages").mockResolvedValue(mockMessages)
      spyOn(Session, "updatePart").mockResolvedValue(undefined)

      await SessionCompaction.prune({ sessionID: "ses-test" })

      expect(Session.messages).toHaveBeenCalledWith({ sessionID: "ses-test" })
      expect(Session.updatePart).toHaveBeenCalled()
    })

    test("skips protected tools", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { prune: true }
      } as any)

      const mockMessages = [
        {
          info: { role: "user" },
          parts: []
        },
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "skill", // Protected tool
              state: {
                status: "completed",
                time: {},
                output: "a".repeat(50000)
              }
            }
          ]
        },
        {
          info: { role: "user" },
          parts: []
        }
      ]

      spyOn(Session, "messages").mockResolvedValue(mockMessages)

      await SessionCompaction.prune({ sessionID: "ses-test" })

      expect(Session.updatePart).not.toHaveBeenCalled()
    })

    test("stops at summary message", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { prune: true }
      } as any)

      const mockMessages = [
        {
          info: { role: "user" },
          parts: []
        },
        {
          info: { role: "assistant", summary: "Summary here" },
          parts: [
            {
              type: "tool",
              tool: "edit",
              state: {
                status: "completed",
                time: {},
                output: "a".repeat(50000)
              }
            }
          ]
        }
      ]

      spyOn(Session, "messages").mockResolvedValue(mockMessages)

      await SessionCompaction.prune({ sessionID: "ses-test" })

      expect(Session.updatePart).not.toHaveBeenCalled()
    })
  })

  describe("process", () => {
    const mockAbortSignal = new AbortController().signal

    test("processes compaction with default prompt", async () => {
      // Setup mocks
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      spyOn(Agent, "get").mockResolvedValue({
        model: {
          providerID: "test-provider",
          modelID: "test-model"
        }
      } as any)

      const mockModel = {
        id: "test-model-id",
        providerID: "test-provider",
        api: {
          id: "test-model-id",
          npm: "@ai-sdk/openai"
        },
        limit: {
          context: 128000,
          output: 4096
        }
      }

      spyOn(Provider, "getModel").mockResolvedValue(mockModel as any)

      spyOn(Plugin, "trigger").mockResolvedValue({
        context: [],
        prompt: undefined
      })

      const mockMessage = {
        id: "test-message-id",
        info: {
          id: "test-message-id",
          role: "user" as const,
          model: {
            providerID: "test-provider",
            modelID: "test-model"
          },
          variant: "test-variant"
        },
        parts: []
      }

      const mockAssistantMessage = {
        id: "assistant-message-id",
        info: {
          role: "assistant" as const,
          mode: "compaction" as const,
          agent: "compaction",
          summary: true
        },
        parts: []
      }

      const mockProcessor = {
        process: mock().mockResolvedValue("continue"),
        message: { error: undefined }
      }

      spyOn(Session, "updateMessage")
        .mockResolvedValueOnce(mockMessage)
        .mockResolvedValueOnce(mockAssistantMessage)

      spyOn(Session, "messages").mockResolvedValue([mockMessage])

      const { SessionProcessor } = await import("./processor")
      spyOn(SessionProcessor, "create").mockReturnValue(mockProcessor as any)

      const result = await SessionCompaction.process({
        parentID: "test-message-id",
        messages: [mockMessage],
        sessionID: "ses-test",
        abort: mockAbortSignal,
        auto: true
      })

      expect(result).toBe("continue")
      expect(Bus.publish).toHaveBeenCalledWith(
        SessionCompaction.Event.Compacted,
        { sessionID: "ses-test" }
      )
    })

    test("uses plugin-provided prompt when available", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      spyOn(Agent, "get").mockResolvedValue({
        model: {
          providerID: "test-provider",
          modelID: "test-model"
        }
      } as any)

      const mockModel = {
        id: "test-model-id",
        providerID: "test-provider",
        api: {
          id: "test-model-id",
          npm: "@ai-sdk/openai"
        },
        limit: {
          context: 128000,
          output: 4096
        }
      }

      spyOn(Provider, "getModel").mockResolvedValue(mockModel as any)

      spyOn(Plugin, "trigger").mockResolvedValue({
        context: ["Additional context"],
        prompt: "Custom prompt"
      })

      const mockMessage = {
        id: "test-message-id",
        info: {
          id: "test-message-id",
          role: "user" as const,
          model: {
            providerID: "test-provider",
            modelID: "test-model"
          },
          variant: "test-variant"
        },
        parts: []
      }

      const mockAssistantMessage = {
        id: "assistant-message-id",
        info: {
          role: "assistant" as const,
          mode: "compaction" as const,
          agent: "compaction",
          summary: true
        },
        parts: []
      }

      const mockProcessor = {
        process: mock().mockResolvedValue("continue"),
        message: { error: undefined }
      }

      spyOn(Session, "updateMessage")
        .mockResolvedValueOnce(mockMessage)
        .mockResolvedValueOnce(mockAssistantMessage)

      spyOn(Session, "messages").mockResolvedValue([mockMessage])

      const { SessionProcessor } = await import("./processor")
      spyOn(SessionProcessor, "create").mockReturnValue(mockProcessor as any)

      await SessionCompaction.process({
        parentID: "test-message-id",
        messages: [mockMessage],
        sessionID: "ses-test",
        abort: mockAbortSignal,
        auto: true
      })

      expect(mockProcessor.process).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.arrayContaining([
                expect.objectContaining({
                  text: "Custom prompt"
                })
              ])
            })
          ])
        })
      )
    })

    test("returns stop when processor has error", async () => {
      spyOn(Config, "get").mockResolvedValue({
        compaction: { auto: true }
      } as any)

      spyOn(Agent, "get").mockResolvedValue({
        model: {
          providerID: "test-provider",
          modelID: "test-model"
        }
      } as any)

      const mockModel = {
        id: "test-model-id",
        providerID: "test-provider",
        api: {
          id: "test-model-id",
          npm: "@ai-sdk/openai"
        },
        limit: {
          context: 128000,
          output: 4096
        }
      }

      spyOn(Provider, "getModel").mockResolvedValue(mockModel as any)

      spyOn(Plugin, "trigger").mockResolvedValue({
        context: [],
        prompt: undefined
      })

      const mockMessage = {
        id: "test-message-id",
        info: {
          id: "test-message-id",
          role: "user" as const,
          model: {
            providerID: "test-provider",
            modelID: "test-model"
          },
          variant: "test-variant"
        },
        parts: []
      }

      const mockAssistantMessage = {
        id: "assistant-message-id",
        info: {
          role: "assistant" as const,
          mode: "compaction" as const,
          agent: "compaction",
          summary: true
        },
        parts: []
      }

      const mockProcessor = {
        process: mock().mockResolvedValue("continue"),
        message: { error: "Something went wrong" }
      }

      spyOn(Session, "updateMessage")
        .mockResolvedValueOnce(mockMessage)
        .mockResolvedValueOnce(mockAssistantMessage)

      spyOn(Session, "messages").mockResolvedValue([mockMessage])

      const { SessionProcessor } = await import("./processor")
      spyOn(SessionProcessor, "create").mockReturnValue(mockProcessor as any)

      const result = await SessionCompaction.process({
        parentID: "test-message-id",
        messages: [mockMessage],
        sessionID: "ses-test",
        abort: mockAbortSignal,
        auto: true
      })

      expect(result).toBe("stop")
    })
  })

  describe("create", () => {
    test("creates compaction message and part", async () => {
      const mockMessage = {
        id: "msg-test-id"
      }

      spyOn(Session, "updateMessage").mockResolvedValue(mockMessage)
      spyOn(Session, "updatePart").mockResolvedValue(undefined)
      spyOn(Identifier, "ascending")
        .mockReturnValueOnce("msg-test-id")
        .mockReturnValueOnce("part-test-id")

      await SessionCompaction.create({
        sessionID: "ses-test",
        agent: "test-agent",
        model: {
          providerID: "test-provider",
          modelID: "test-model"
        },
        auto: true
      })

      expect(Session.updateMessage).toHaveBeenCalled()
      expect(Session.updatePart).toHaveBeenCalled()
    })
  })

  describe("constants", () => {
    test("exports expected constants", () => {
      expect(SessionCompaction.PRUNE_MINIMUM).toBe(20000)
      expect(SessionCompaction.PRUNE_PROTECT).toBe(40000)
    })
  })
})
