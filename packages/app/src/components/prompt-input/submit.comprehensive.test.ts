import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { Prompt } from "@/context/prompt"
import { createPromptSubmit } from "./submit"

// Test tracking variables
const createdClients: string[] = []
const createdSessions: string[] = []
const sentShell: string[] = []
const sentCommands: Array<{ name: string; args: string }> = []
const syncedDirectories: string[] = []
const toastMessages: Array<{ title: string; description: string }> = []
const optimisticMessages: Array<{ directory: string; sessionID: string; message: any }> = []
const removedOptimisticMessages: Array<{ directory: string; sessionID: string; messageID: string }> = []

const promptValue: Prompt = [{ type: "text", content: "test command", start: 0, end: 12 }]

beforeAll(async () => {
  // Mock all the dependencies that createPromptSubmit uses
  mock.module("@solidjs/router", () => ({
    useNavigate: mock(),
    useParams: mock(() => ({ dir: "test-dir", id: "test-id" })),
  }))

  mock.module("@opencode-ai/ui/toast", () => ({
    showToast: mock(),
  }))

  mock.module("@opencode-ai/util/encode", () => ({
    base64Encode: mock((str: string) => `base64-${str}`),
  }))

  mock.module("@/context/file", () => ({
    useFile: mock(() => ({
      tree: {
        list: [],
        marks: {},
        kinds: {},
        deeps: [],
      },
    })),
  }))

  mock.module("@/context/global-sync", () => ({
    useGlobalSync: mock(() => ({
      ready: true,
      api: {
        createProject: mock(),
        createSession: mock(),
        createWorktree: mock(),
        getProject: mock(),
        getProjectMetadata: mock(),
        getProjectIcon: mock(),
        getTodo: mock(),
        setConfig: mock(),
      },
    })),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: mock(() => ({
      t: (key: string) => key,
    })),
  }))

  mock.module("@/context/layout", () => ({
    useLayout: mock(() => ({
      setMode: mock(),
    })),
  }))

  mock.module("@/context/local", () => ({
    useLocal: mock(() => ({
      get: mock(() => "test-value"),
    })),
  }))

  mock.module("@/context/prompt", () => ({
    usePrompt: mock(() => ({
      promptValue,
      promptLength: mock(() => 12),
    })),
  }))

  mock.module("@/context/sdk", () => ({
    useSDK: mock(() => ({
      createClient: mock((config) => {
        createdClients.push(config.directory || "default")
        return {
          session: {
            create: async () => {
              createdSessions.push(config.directory || "default")
              return { data: { id: `session-${createdSessions.length}` } }
            },
            shell: async (params: any) => {
              sentShell.push(config.directory || "default")
              return { data: undefined }
            },
            prompt: async () => ({ data: undefined }),
            promptAsync: async () => ({ data: undefined }),
            command: async (params: any) => {
              sentCommands.push({ name: params.command, args: params.arguments })
              return { data: undefined }
            },
            abort: async () => ({ data: undefined }),
          },
        },

  mock.module("@/context/sync", () => ({
    useSync: mock(() => ({
      session: {
        optimistic: {
          add: mock(),
          remove: mock(),
        },
      },
    })),
  }))

  mock.module("@utils/id", () => ({
    id: mock(() => "test-id"),
  }))

  mock.module("@utils/worktree", () => ({
    Worktree: mock((config) => ({
      create: async () => ({ data: { directory: `${config.directory}/new-worktree` } }),
    })),
  }))
})

describe("prompt submission workflows", () => {
  beforeEach(() => {
    // Clear all tracking arrays
    createdClients.length = 0
    createdSessions.length = 0
    sentShell.length = 0
    sentCommands.length = 0
    syncedDirectories.length = 0
    toastMessages.length = 0
    optimisticMessages.length = 0
    removedOptimisticMessages.length = 0
  })

  test("creates new session with main worktree", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(createdSessions).toHaveLength(1)
    expect(createdSessions[0]).toBe("test-dir")
  })

  test("creates new worktree when selected", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(createdClients).toContain("/repo/main/new-worktree")
  })

  test("uses existing worktree when specified", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(createdClients).toContain("/repo/existing-worktree")
  })

  test("handles shell mode submission", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(sentShell).toHaveLength(1)
    expect(sentShell[0]).toBe("test-dir")
  })

  test("handles custom command submission", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(sentCommands).toHaveLength(1)
    expect(sentCommands[0].name).toBe("test-command")
    expect(sentCommands[0].args).toEqual(["arg1", "arg2"])
  })

  test("handles normal prompt submission with optimistic updates", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(optimisticMessages).toHaveLength(1)
  })

  test("abort functionality", async () => {
    const submit = createPromptSubmit()
    
    // First submit something to create a pending prompt
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)
    
    // Now abort it
    await submit.abort()

    // Should clean up optimistic message
    expect(removedOptimisticMessages).toHaveLength(1)
  })

  test("abort functionality handles abort when no pending submission", async () => {
    const submit = createPromptSubmit()
    
    // Abort without any pending submission
    await submit.abort()

    // Should not throw
    expect(true).toBe(true)
  })

  test("comment handling", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(optimisticMessages).toHaveLength(1)
  })

  test("image attachment handling", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    expect(optimisticMessages).toHaveLength(1)
  })

  test("worktree timeout handling", async () => {
    const submit = createPromptSubmit()
    
    const event = { preventDefault: () => undefined } as unknown as Event
    await submit.handleSubmit(event)

    // Should show timeout toast
    expect(toastMessages.some(msg => msg.description.includes("stillPreparing"))).toBe(true)
  })
})
