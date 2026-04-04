import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { LLMConcurrencyMachine } from "../../src/session/llm-concurrency-machine"
import { Global } from "../../src/global"
import { Log } from "../../src/util/log"

Log.init({ print: false })

describe("LLMConcurrencyMachine", () => {
  describe("compile", () => {
    test("compiles wildcard pattern to match all", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      expect(limits).toBeDefined()
      expect(limits!.rules).toHaveLength(1)
      expect(limits!.rules[0].pattern).toBe("*")
      expect(limits!.rules[0].all).toBe(true)
      expect(limits!.rules[0].limit).toBe(10)
      expect(limits!.rules[0].match("anything")).toBe(true)
    })

    test("compiles regex pattern with re: prefix", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "re:^anthropic/.*": 5 },
            },
          },
        },
      } as any)

      expect(limits).toBeDefined()
      expect(limits!.rules).toHaveLength(1)
      expect(limits!.rules[0].pattern).toBe("re:^anthropic/.*")
      expect(limits!.rules[0].all).toBe(false)
      expect(limits!.rules[0].match("anthropic/claude-3")).toBe(true)
      expect(limits!.rules[0].match("openai/gpt-4")).toBe(false)
    })

    test("compiles glob pattern with * wildcard", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "anthropic/*": 5 },
            },
          },
        },
      } as any)

      expect(limits).toBeDefined()
      expect(limits!.rules).toHaveLength(1)
      expect(limits!.rules[0].match("anthropic/claude-3")).toBe(true)
      expect(limits!.rules[0].match("anthropic/claude-3-opus")).toBe(true)
      expect(limits!.rules[0].match("openai/gpt-4")).toBe(false)
    })

    test("compiles glob pattern with ? single char wildcard", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "model-?": 5 },
            },
          },
        },
      } as any)

      expect(limits).toBeDefined()
      expect(limits!.rules[0].match("model-a")).toBe(true)
      expect(limits!.rules[0].match("model-b")).toBe(true)
      expect(limits!.rules[0].match("model-ab")).toBe(false)
    })

    test("escapes special regex characters in glob pattern", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "model.test": 5 },
            },
          },
        },
      } as any)

      expect(limits).toBeDefined()
      expect(limits!.rules[0].match("model.test")).toBe(true)
      expect(limits!.rules[0].match("modelXtest")).toBe(false)
    })

    test("throws on invalid regex pattern", () => {
      expect(() =>
        LLMConcurrencyMachine.limits({
          experimental: {
            llmConcurrency: {
              global: {
                limits: { "re:[invalid": 5 },
              },
            },
          },
        } as any),
      ).toThrow()
    })
  })

  describe("limits", () => {
    test("returns undefined when no llmConcurrency config", () => {
      const result = LLMConcurrencyMachine.limits({} as any)
      expect(result).toBeUndefined()
    })

    test("returns undefined when no global config", () => {
      const result = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {},
        },
      } as any)
      expect(result).toBeUndefined()
    })

    test("returns undefined when no limits defined", () => {
      const result = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {},
          },
        },
      } as any)
      expect(result).toBeUndefined()
    })

    test("returns undefined when limits object is empty", () => {
      const result = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: {},
            },
          },
        },
      } as any)
      expect(result).toBeUndefined()
    })

    test("uses default staleMs when not specified", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      expect(limits!.staleMs).toBe(15 * 60 * 1000)
    })

    test("uses custom staleMs when specified", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
              staleMs: 5000,
            },
          },
        },
      } as any)

      expect(limits!.staleMs).toBe(5000)
    })
  })

  describe("limitMap", () => {
    test("converts rules to map", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10, "anthropic/*": 5 },
            },
          },
        },
      } as any)

      const map = LLMConcurrencyMachine.limitMap(limits!)
      expect(map["*"]).toBe(10)
      expect(map["anthropic/*"]).toBe(5)
    })
  })

  describe("bucketKey", () => {
    test("combines providerID and modelName", () => {
      const key = LLMConcurrencyMachine.bucketKey({
        providerID: "anthropic",
        modelName: "claude-3",
      })
      expect(key).toBe("anthropic/claude-3")
    })
  })

  describe("request", () => {
    test("calculates request snapshot for all rule", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const snapshot = LLMConcurrencyMachine.request(limits!, ["a/b", "c/d"])
      expect(snapshot.total).toBe(2)
      expect(snapshot.counts["*"]).toBe(2)
    })

    test("calculates request snapshot for pattern rules", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "anthropic/*": 5 },
            },
          },
        },
      } as any)

      const snapshot = LLMConcurrencyMachine.request(limits!, [
        "anthropic/claude-3",
        "anthropic/claude-2",
        "openai/gpt-4",
      ])
      expect(snapshot.total).toBe(3)
      expect(snapshot.counts["anthropic/*"]).toBe(2)
    })

    test("handles empty keys array", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const snapshot = LLMConcurrencyMachine.request(limits!, [])
      expect(snapshot.total).toBe(0)
      expect(snapshot.counts["*"]).toBe(0)
    })
  })

  describe("blocked", () => {
    test("returns empty array when under limit", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const current = { total: 5, counts: {} }
      const request = { total: 3, counts: {} }
      const blocked = LLMConcurrencyMachine.blocked(limits!, current, request)
      expect(blocked).toHaveLength(0)
    })

    test("returns pattern when over limit", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const current = { total: 8, counts: {} }
      const request = { total: 5, counts: {} }
      const blocked = LLMConcurrencyMachine.blocked(limits!, current, request)
      expect(blocked).toContain("*")
    })

    test("handles pattern-specific limits", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "anthropic/*": 2 },
            },
          },
        },
      } as any)

      const current = { total: 5, counts: { "anthropic/*": 2 } }
      const request = { total: 1, counts: { "anthropic/*": 1 } }
      const blocked = LLMConcurrencyMachine.blocked(limits!, current, request)
      expect(blocked).toContain("anthropic/*")
    })

    test("allows request at exact limit", () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const current = { total: 5, counts: {} }
      const request = { total: 5, counts: {} }
      const blocked = LLMConcurrencyMachine.blocked(limits!, current, request)
      expect(blocked).toHaveLength(0)
    })
  })

  describe("snapshot and enter", () => {
    let tmpDir: string
    let originalState: string

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(process.cwd(), "llm-concurrency-test-"))
      originalState = Global.Path.state
      ;(Global.Path as any).state = tmpDir
    })

    afterEach(async () => {
      ;(Global.Path as any).state = originalState
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    test("snapshot returns empty when no leases", async () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
            },
          },
        },
      } as any)

      const snapshot = await LLMConcurrencyMachine.snapshot(limits!)
      expect(snapshot.total).toBe(0)
    })

    test("enter returns undefined when no limits", async () => {
      const lease = await LLMConcurrencyMachine.enter({
        limits: undefined,
        providerID: "test",
        modelName: "model",
        sessionID: "session",
      })
      expect(lease).toBeUndefined()
    })

    test("enter creates lease and release removes it", async () => {
      const limits = LLMConcurrencyMachine.limits({
        experimental: {
          llmConcurrency: {
            global: {
              limits: { "*": 10 },
              staleMs: 60000,
            },
          },
        },
      } as any)

      const lease = await LLMConcurrencyMachine.enter({
        limits: limits!,
        providerID: "test",
        modelName: "model",
        sessionID: "session",
      })

      expect(lease).toBeDefined()

      const snapshot1 = await LLMConcurrencyMachine.snapshot(limits!)
      expect(snapshot1.total).toBe(1)

      await lease!.release()

      const snapshot2 = await LLMConcurrencyMachine.snapshot(limits!)
      expect(snapshot2.total).toBe(0)
    })
  })

  describe("init", () => {
    let tmpDir: string
    let originalState: string

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(process.cwd(), "llm-concurrency-init-test-"))
      originalState = Global.Path.state
      ;(Global.Path as any).state = tmpDir
    })

    afterEach(async () => {
      ;(Global.Path as any).state = originalState
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    test("init handles missing leases directory", async () => {
      await expect(LLMConcurrencyMachine.init()).resolves.toBeUndefined()
    })

    test("init handles empty leases directory", async () => {
      await fs.mkdir(path.join(tmpDir, "llm-concurrency", "leases"), { recursive: true })
      await expect(LLMConcurrencyMachine.init()).resolves.toBeUndefined()
    })
  })
})
