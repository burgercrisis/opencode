import { describe, test, expect, mock } from "bun:test"
import { SkillTool } from "../skill"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"

describe("SkillTool", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should define tool with correct id", () => {
    expect(SkillTool.id).toBe("skill")
  })

  test("should have description", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await SkillTool.init()
        expect(init.description).toBeDefined()
        expect(init.description.length).toBeGreaterThan(0)
      },
    })
  })

  test("should have parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await SkillTool.init()
        expect(init.parameters).toBeDefined()
      },
    })
  })

  test("should validate parameters schema", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await SkillTool.init()
        
        const parsed = init.parameters.safeParse({
          name: "test-skill",
        })
        
        expect(parsed.success).toBe(true)
      },
    })
  })

  test("should require name parameter", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const init = await SkillTool.init()
        
        const parsed = init.parameters.safeParse({})
        
        expect(parsed.success).toBe(false)
      },
    })
  })
})