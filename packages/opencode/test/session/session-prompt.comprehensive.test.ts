import path from "path"
import { describe, expect, test, beforeEach } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import { Identifier } from "../../src/id/id"
import { tmpdir } from "../fixture/fixture"

describe("Session Prompt - Comprehensive Tests", () => {
  beforeEach(() => {
    // Ensure clean state between tests
    // This prevents test interference from rapid start/stop cycles
  })

  describe("Missing File Handling", () => {
    test("does not fail the prompt when a file part is missing", async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const missing = path.join(tmp.path, "does-not-exist.ts")
          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [
              { type: "text", text: "please review @does-not-exist.ts" },
              {
                type: "file",
                mime: "text/plain",
                url: `file://${missing}`,
                filename: "does-not-exist.ts",
              },
            ],
          })

          if (msg.info.role !== "user") throw new Error("expected user message")
          const userInfo = msg.info as MessageV2.User
          const hasFailure = msg.parts.some(
            (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
          )
          expect(hasFailure).toBe(true)

          await Session.remove(session.id)
        },
      })
    })

    test("handles multiple missing files gracefully", async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const missing1 = path.join(tmp.path, "missing1.ts")
          const missing2 = path.join(tmp.path, "missing2.ts")
          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [
              { type: "text", text: "please review these files" },
              {
                type: "file",
                mime: "text/plain",
                url: `file://${missing1}`,
                filename: "missing1.ts",
              },
              {
                type: "file",
                mime: "text/plain",
                url: `file://${missing2}`,
                filename: "missing2.ts",
              },
            ],
          })

          if (msg.info.role !== "user") throw new Error("expected user message")
          const userInfo = msg.info as MessageV2.User
          const failures = msg.parts.filter(
            (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
          )
          expect(failures).toHaveLength(2)

          await Session.remove(session.id)
        },
      })
    })

    test("handles mix of existing and missing files", async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          // Create an existing file
          const existingFile = path.join(tmp.path, "existing.ts")
          await Bun.write(existingFile, "console.log('hello')")

          const missingFile = path.join(tmp.path, "missing.ts")
          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [
              { type: "text", text: "please review these files" },
              {
                type: "file",
                mime: "text/plain",
                url: `file://${existingFile}`,
                filename: "existing.ts",
              },
              {
                type: "file",
                mime: "text/plain",
                url: `file://${missingFile}`,
                filename: "missing.ts",
              },
            ],
          })

          if (msg.info.role !== "user") throw new Error("expected user message")
          const userInfo = msg.info as MessageV2.User
          const failures = msg.parts.filter(
            (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
          )
          expect(failures).toHaveLength(1) // Only the missing file should fail

          await Session.remove(session.id)
        },
      })
    })
  })

  describe("Race Condition Handling", () => {
    test("should handle concurrent cancellation and loop creation safely", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const sessionID = Identifier.create("session", false)

          // Create multiple concurrent operations that will create sessions
          const promises = []

          // Simulate multiple loop calls happening concurrently
          for (let i = 0; i < 5; i++) {
            promises.push(
              SessionPrompt.loop({ sessionID, resume_existing: false }).catch(err => {
                // Expected to fail with "Session cancelled" or "Session not found"
                expect(err.message).toMatch(/Session cancelled|Session not found/)
              })
            )
          }

          // Cancel session while loops are being created
          setTimeout(() => {
            SessionPrompt.cancel(sessionID)
          }, 10)

          // Wait for all operations to complete
          await Promise.allSettled(promises)

          // Verify session is properly cleaned up
          expect(() => SessionPrompt.cancel(sessionID)).not.toThrow()
        },
      })
    })

    test("should prevent adding callbacks to cancelled session", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const sessionID = Identifier.create("session", false)

          // Cancel the session first
          SessionPrompt.cancel(sessionID)

          // Try to create a loop after cancellation
          const loopPromise = SessionPrompt.loop({ sessionID, resume_existing: false })
          
          await expect(loopPromise).rejects.toMatch(/Session cancelled|Session not found/)
        },
      })
    })

    test("should handle rapid start/stop cycles", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const sessionID = Identifier.create("session", false)

          // Rapid start/stop cycles
          for (let i = 0; i < 10; i++) {
            const loopPromise = SessionPrompt.loop({ sessionID, resume_existing: false })
            setTimeout(() => SessionPrompt.cancel(sessionID), 5)
            
            try {
              await loopPromise
            } catch (err) {
              // Expected to fail due to cancellation
              expect(err.message).toMatch(/Session cancelled|Session not found/)
            }
          }
        },
      })
    })
  })

  describe("Agent Variant Handling", () => {
    test("applies agent variant only when using agent model", async () => {
      const prev = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = "test-openai-key"

      try {
        await using tmp = await tmpdir({
          git: true,
          config: {
            agent: {
              build: {
                model: "openai/gpt-5.2",
                variant: "xhigh",
              },
            },
          },
        })

        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const session = await Session.create({})

            const other = await SessionPrompt.prompt({
              sessionID: session.id,
              agent: "build",
              model: { providerID: "opencode", modelID: "kimi-k2.5-free" },
              noReply: true,
              parts: [{ type: "text", text: "hello" }],
            })
            if (other.info.role !== "user") throw new Error("expected user message")
            const otherInfo = other.info as MessageV2.User
            expect(otherInfo.variant).toBeUndefined()

            const match = await SessionPrompt.prompt({
              sessionID: session.id,
              agent: "build",
              noReply: true,
              parts: [{ type: "text", text: "hello again" }],
            })
            if (match.info.role !== "user") throw new Error("expected user message")
            const matchInfo = match.info as MessageV2.User
            expect(matchInfo.model).toEqual({ providerID: "openai", modelID: "gpt-5.2" })
            expect(matchInfo.variant).toBe("xhigh")

            await Session.remove(session.id)
          },
        })
      } finally {
        process.env.OPENAI_API_KEY = prev
      }
    })

    test("handles missing variant configuration", async () => {
      const prev = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = "test-openai-key"

      try {
        await using tmp = await tmpdir({
          git: true,
          config: {
            agent: {
              build: {
                model: "openai/gpt-5.2",
                // No variant specified
              },
            },
          },
        })

        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const session = await Session.create({})

            const msg = await SessionPrompt.prompt({
              sessionID: session.id,
              agent: "build",
              noReply: true,
              parts: [{ type: "text", text: "hello" }],
            })
            if (msg.info.role !== "user") throw new Error("expected user message")
            const userInfo = msg.info as MessageV2.User
            expect(userInfo.model).toEqual({ providerID: "openai", modelID: "gpt-5.2" })
            expect(userInfo.variant).toBeUndefined()

            await Session.remove(session.id)
          },
        })
      } finally {
        process.env.OPENAI_API_KEY = prev
      }
    })

    test("handles custom model without variant", async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
              variant: "xhigh",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            model: { providerID: "custom", modelID: "custom-model" },
            noReply: true,
            parts: [{ type: "text", text: "hello" }],
          })
          if (msg.info.role !== "user") throw new Error("expected user message")
          const userInfo = msg.info as MessageV2.User
          expect(userInfo.model).toEqual({ providerID: "custom", modelID: "custom-model" })
          expect(userInfo.variant).toBeUndefined()

          await Session.remove(session.id)
        },
      })
    })
  })

  describe("Edge Cases", () => {
    test("handles empty parts array", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [],
          })

          expect(msg).toBeDefined()
          expect(msg.parts).toEqual([])

          await Session.remove(session.id)
        },
      })
    })

    test("handles invalid session ID gracefully", async () => {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const invalidSessionID = "invalid-session-id"

          await expect(
            SessionPrompt.prompt({
              sessionID: invalidSessionID,
              agent: "build",
              noReply: true,
              parts: [{ type: "text", text: "hello" }],
            })
          ).rejects.toMatch(/Session not found/)
        },
      })
    })

    test("handles malformed file URLs", async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const msg = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [
              { type: "text", text: "please review this file" },
              {
                type: "file",
                mime: "text/plain",
                url: "invalid-url",
                filename: "test.ts",
              },
            ],
          })

          if (msg.info.role !== "user") throw new Error("expected user message")
          const userInfo = msg.info as MessageV2.User
          const hasFailure = msg.parts.some(
            (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
          )
          expect(hasFailure).toBe(true)

          await Session.remove(session.id)
        },
      })
    })
  })
})
