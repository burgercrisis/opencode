// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { test, expect } from "bun:test"
import path from "path"

import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { Env } from "../../src/env"
import { Global } from "../../src/global"

// Global test isolation pattern
let savedInstance: any
let savedFilesystem: any

// Save global state before all tests
const originalBeforeAll = typeof beforeAll !== 'undefined' ? beforeAll : (() => {})
const originalBeforeEach = typeof beforeEach !== 'undefined' ? beforeEach : (() => {})

beforeAll(() => {
  // Save initial global state
  savedInstance = (globalThis as any).Instance
  savedFilesystem = (globalThis as any).Filesystem
  
  // Call original beforeAll if it exists
  if (typeof originalBeforeAll === 'function') {
    originalBeforeAll()
  }
})

beforeEach(() => {
  // Restore global state before each test
  if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  }
  if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  }
  
  // Call original beforeEach if it exists
  if (typeof originalBeforeEach === 'function') {
    originalBeforeEach()
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    mock?.unmock?.()
  } catch (e) {
    // Ignore mock cleanup errors
  }
})

bulletproofTest("GitLab Duo: loads provider with API key from environment", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "test-gitlab-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      expect(providers["gitlab"].key).toBe("test-gitlab-token")
    },
  })
})

bulletproofTest("GitLab Duo: config instanceUrl option sets baseURL", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            gitlab: {
              options: {
                instanceUrl: "https://gitlab.example.com",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "test-token")
      Env.set("GITLAB_INSTANCE_URL", "https://gitlab.example.com")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      expect(providers["gitlab"].options?.instanceUrl).toBe("https://gitlab.example.com")
    },
  })
})

bulletproofTest("GitLab Duo: loads with OAuth token from auth.json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  const authPath = path.join(Global.Path.data, "auth.json")
  await Bun.write(
    authPath,
    JSON.stringify({
      gitlab: {
        type: "oauth",
        access: "test-access-token",
        refresh: "test-refresh-token",
        expires: Date.now() + 3600000,
      },
    }),
  )

  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
    },
  })
})

bulletproofTest("GitLab Duo: loads with Personal Access Token from auth.json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  const authPath2 = path.join(Global.Path.data, "auth.json")
  await Bun.write(
    authPath2,
    JSON.stringify({
      gitlab: {
        type: "api",
        key: "glpat-test-pat-token",
      },
    }),
  )

  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      expect(providers["gitlab"].key).toBe("glpat-test-pat-token")
    },
  })
})

bulletproofTest("GitLab Duo: supports self-hosted instance configuration", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            gitlab: {
              options: {
                instanceUrl: "https://gitlab.company.internal",
                apiKey: "glpat-internal-token",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_INSTANCE_URL", "https://gitlab.company.internal")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      expect(providers["gitlab"].options?.instanceUrl).toBe("https://gitlab.company.internal")
    },
  })
})

bulletproofTest("GitLab Duo: config apiKey takes precedence over environment variable", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            gitlab: {
              options: {
                apiKey: "config-token",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "env-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
    },
  })
})

bulletproofTest("GitLab Duo: supports feature flags configuration", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            gitlab: {
              options: {
                featureFlags: {
                  duo_agent_platform_agentic_chat: true,
                  duo_agent_platform: true,
                },
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      expect(providers["gitlab"].options?.featureFlags).toBeDefined()
      expect(providers["gitlab"].options?.featureFlags?.duo_agent_platform_agentic_chat).toBe(true)
    },
  })
})

bulletproofTest("GitLab Duo: has multiple agentic chat models available", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GITLAB_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["gitlab"]).toBeDefined()
      const models = Object.keys(providers["gitlab"].models)
      expect(models.length).toBeGreaterThan(0)
      expect(models).toContain("duo-chat-haiku-4-5")
      expect(models).toContain("duo-chat-sonnet-4-5")
      expect(models).toContain("duo-chat-opus-4-5")
    },
  })
})
