import { expect, it, describe, mock, beforeEach, afterEach, vi } from "bun:test"
import { SkillTool } from "../../src/tool/skill"
import { Skill } from "../../src/skill"
import { PermissionNext } from "../../src/permission/next"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import { pathToFileURL } from "url"

describe("SkillTool", () => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("initializes with available skills", async () => {
    await using tmp = await tmpdir()
    // Create a real skill file
    const skillDir = path.join(tmp.path, ".opencode", "skill", "test-skill")
    await Bun.write(path.join(skillDir, "SKILL.md"), `---
name: test-skill
description: A test skill
---
Skill content`)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("test-skill")
        expect(tool.description).toContain("A test skill")
        expect(tool.description).toContain(encodeURIComponent("SKILL.md"))
      },
    })
  })

  it("initializes with no skills if none available", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("No skills are currently available")
      },
    })
  })

  it("filters skills based on permissions", async () => {
    await using tmp = await tmpdir()
    
    // Create skill files
    const skillDirA = path.join(tmp.path, ".opencode", "skill", "allowed-skill")
    await Bun.write(path.join(skillDirA, "SKILL.md"), `---
name: allowed-skill
description: Allowed skill
---
Content`)
    
    const skillDirB = path.join(tmp.path, ".opencode", "skill", "denied-skill")
    await Bun.write(path.join(skillDirB, "SKILL.md"), `---
name: denied-skill
description: Denied skill
---
Content`)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Mock permission to deny denied-skill
        vi.spyOn(PermissionNext, "evaluate").mockImplementation(((type: string, name: string) => {
          if (name === "denied-skill") return { action: "deny" }
          return { action: "allow" }
        }) as any)

        const tool = await SkillTool.init(ctx as any)
        expect(tool.description).toContain("allowed-skill")
        expect(tool.description).not.toContain("denied-skill")
      },
    })
  })

  it("executes and loads a skill", async () => {
    await using tmp = await tmpdir()
    
    // Create a skill with files
    const skillDir = path.join(tmp.path, ".opencode", "skill", "test-skill")
    await Bun.write(path.join(skillDir, "SKILL.md"), `---
name: test-skill
description: A test skill
---
Skill content`)
    await Bun.write(path.join(skillDir, "file1.txt"), "File 1 content")
    await Bun.write(path.join(skillDir, "file2.txt"), "File 2 content")

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
    
    // Create a different skill
    const skillDir = path.join(tmp.path, ".opencode", "skill", "other-skill")
    await Bun.write(path.join(skillDir, "SKILL.md"), `---
name: other-skill
description: Another skill
---
Content`)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)

        expect(tool.execute({ name: "missing-skill" }, ctx as any)).rejects.toThrow(
          'Skill "missing-skill" not found. Available skills: other-skill'
        )
      },
    })
  })

  it("respects the sampling limit for skill files", async () => {
    await using tmp = await tmpdir()
    
    // Create a skill with many files
    const skillDir = path.join(tmp.path, ".opencode", "skill", "test-skill")
    await Bun.write(path.join(skillDir, "SKILL.md"), `---
name: test-skill
description: A test skill
---
Skill content`)
    
    // Create 15 files (limit is 10)
    for (let i = 0; i < 15; i++) {
      await Bun.write(path.join(skillDir, `file${i}.txt`), `File ${i} content`)
    }

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SkillTool.init(ctx as any)
        const result = await tool.execute({ name: "test-skill" }, ctx as any)

        // limit is 10
        const matches = result.output.match(/<file>/g)
        expect(matches?.length).toBe(10)
      },
    })
  })
})
