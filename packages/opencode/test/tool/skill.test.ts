import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { SkillTool } from "../../src/tool/skill"
import { Skill } from "../../src/skill"
import { PermissionNext } from "../../src/permission/next"
import { Ripgrep } from "../../src/file/ripgrep"
import path from "path"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("SkillTool", () => {
  let mocks: {
    skillAll: any
    skillGet: any
    permissionEvaluate: any
    ripgrepFiles: any
  }

  const ctx = {
    agent: {
      permission: [],
    },
    ask: mock(),
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    ;(ctx.ask as any).mockClear()
    
    mocks = {
      skillAll: vi.spyOn(Skill, "all"),
      skillGet: vi.spyOn(Skill, "get"),
      permissionEvaluate: vi.spyOn(PermissionNext, "evaluate"),
      ripgrepFiles: vi.spyOn(Ripgrep, "files"),
    }

    mocks.skillAll.mockResolvedValue([
      {
        name: "test-skill",
        description: "A test skill",
        location: "/path/to/skill/SKILL.md",
        content: "Skill content",
      },
    ] as any)
    mocks.skillGet.mockResolvedValue({
      name: "test-skill",
      description: "A test skill",
      location: "/path/to/skill/SKILL.md",
      content: "Skill content",
    } as any)
    mocks.permissionEvaluate.mockReturnValue({ action: "allow" } as any)
    mocks.ripgrepFiles.mockImplementation(async function* () {
      yield "file1.txt"
      yield "file2.txt"
      yield "SKILL.md" // Should be skipped
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("initializes with available skills", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("test-skill")
        expect(tool.description).toContain("A test skill")
        expect(tool.description).toContain("file:///path/to/skill/SKILL.md")
      },
    })
  })

  it("initializes with no skills if none available", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.skillAll.mockResolvedValue([])
        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("No skills are currently available")
      },
    })
  })

  it("filters skills based on permissions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.permissionEvaluate.mockImplementation(((type: string, name: string) => {
          if (name === "denied-skill") return { action: "deny" }
          return { action: "allow" }
        }) as any)
        mocks.skillAll.mockResolvedValue([
          { name: "allowed-skill", description: "Allowed", location: "/a/SKILL.md" },
          { name: "denied-skill", description: "Denied", location: "/b/SKILL.md" },
        ] as any)

        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("allowed-skill")
        expect(tool.description).not.toContain("denied-skill")
      },
    })
  })

  it("executes and loads a skill", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        const params = { name: "test-skill" }
        const result = await tool.execute(params, ctx as any)

        expect(ctx.ask).toHaveBeenCalledWith({
          permission: "skill",
          patterns: ["test-skill"],
          always: ["test-skill"],
          metadata: {},
        })

        expect(result.title).toBe("Loaded skill: test-skill")
        expect(result.output).toContain("Skill content")
        expect(result.output).toContain("<skill_files>")
        expect(result.output).toContain("file1.txt")
        expect(result.output).toContain("file2.txt")
        expect(result.output).not.toContain("SKILL.md")
        expect(result.metadata.name).toBe("test-skill")
      },
    })
  })

  it("throws error if skill not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        mocks.skillGet.mockResolvedValue(null)
        mocks.skillAll.mockResolvedValue([
          { name: "other-skill" },
        ] as any)

        expect(tool.execute({ name: "missing-skill" }, ctx as any)).rejects.toThrow(
          'Skill "missing-skill" not found. Available skills: other-skill'
        )
      },
    })
  })

  it("respects the sampling limit for skill files", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        mocks.ripgrepFiles.mockImplementation(async function* () {
          for (let i = 0; i < 15; i++) {
            yield `file${i}.txt`
          }
        } as any)

        const tool = await SkillTool.init(ctx as any)
        const result = await tool.execute({ name: "test-skill" }, ctx as any)

        // limit is 10
        const matches = result.output.match(/<file>/g)
        expect(matches?.length).toBe(10)
      },
    })
  })
})
