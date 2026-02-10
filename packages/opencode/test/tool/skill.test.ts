import { expect, it, describe, mock, beforeEach } from "bun:test"
import { SkillTool } from "../../src/tool/skill"
import { Skill } from "../../src/skill"
import { PermissionNext } from "../../src/permission/next"
import { Ripgrep } from "../../src/file/ripgrep"
import path from "path"

// Mock dependencies
mock.module("../../src/skill", () => ({
  Skill: {
    all: mock(),
    get: mock(),
  },
}))

mock.module("../../src/permission/next", () => ({
  PermissionNext: {
    evaluate: mock(),
  },
}))

mock.module("../../src/file/ripgrep", () => ({
  Ripgrep: {
    files: mock(),
  },
}))

describe("SkillTool", () => {
  const ctx = {
    agent: {
      permission: [],
    },
    ask: mock(),
    abort: new AbortController().signal,
  }

  beforeEach(() => {
    mock.restore()
    ;(ctx.ask as any).mockClear()
    ;(Skill.all as any).mockResolvedValue([
      {
        name: "test-skill",
        description: "A test skill",
        location: "/path/to/skill/SKILL.md",
        content: "Skill content",
      },
    ])
    ;(Skill.get as any).mockResolvedValue({
      name: "test-skill",
      description: "A test skill",
      location: "/path/to/skill/SKILL.md",
      content: "Skill content",
    })
    ;(PermissionNext.evaluate as any).mockReturnValue({ action: "allow" })
    ;(Ripgrep.files as any).mockImplementation(async function* () {
      yield "file1.txt"
      yield "file2.txt"
      yield "SKILL.md" // Should be skipped
    })
  })

  it("initializes with available skills", async () => {
    const tool = await SkillTool.init(ctx as any)
    expect(tool.description).toContain("test-skill")
    expect(tool.description).toContain("A test skill")
    expect(tool.description).toContain("file:///path/to/skill/SKILL.md")
  })

  it("initializes with no skills if none available", async () => {
    ;(Skill.all as any).mockResolvedValue([])
    const tool = await SkillTool.init(ctx as any)
    expect(tool.description).toContain("No skills are currently available")
  })

  it("filters skills based on permissions", async () => {
    ;(PermissionNext.evaluate as any).mockImplementation((type: string, name: string) => {
      if (name === "denied-skill") return { action: "deny" }
      return { action: "allow" }
    })
    ;(Skill.all as any).mockResolvedValue([
      { name: "allowed-skill", description: "Allowed", location: "/a/SKILL.md" },
      { name: "denied-skill", description: "Denied", location: "/b/SKILL.md" },
    ])

    const tool = await SkillTool.init(ctx as any)
    expect(tool.description).toContain("allowed-skill")
    expect(tool.description).not.toContain("denied-skill")
  })

  it("executes and loads a skill", async () => {
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
    expect(result.metadata.dir).toBe(path.dirname("/path/to/skill/SKILL.md"))
  })

  it("throws error if skill not found", async () => {
    const tool = await SkillTool.init(ctx as any)
    ;(Skill.get as any).mockResolvedValue(null)
    ;(Skill.all as any).mockResolvedValue([{ name: "other-skill" }])

    const params = { name: "missing-skill" }
    expect(tool.execute(params, ctx as any)).rejects.toThrow(
      'Skill "missing-skill" not found. Available skills: other-skill'
    )
  })

  it("respects the sampling limit for skill files", async () => {
    ;(Ripgrep.files as any).mockImplementation(async function* () {
      for (let i = 0; i < 15; i++) {
        yield `file${i}.txt`
      }
    })

    const tool = await SkillTool.init(ctx as any)
    const result = await tool.execute({ name: "test-skill" }, ctx as any)
    
    const fileCount = (result.output.match(/<file>/g) || []).length
    expect(fileCount).toBe(10)
  })
})
