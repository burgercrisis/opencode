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

import { test, expect, beforeEach, afterEach } from "bun:test"
import { Skill } from "../../src/skill"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

async function createGlobalSkill(homeDir: string) {
  const skillDir = path.join(homeDir, ".claude", "skills", "global-test-skill")
  await fs.mkdir(skillDir, { recursive: true })
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: global-test-skill
description: A global skill from ~/.claude/skills for testing.
---

# Global Test Skill

This skill is loaded from the global home directory.
`,
  )
}

bulletproofTest("discovers skills from .opencode/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "test-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: test-skill
description: A test skill for verification.
---

# Test Skill

Instructions here.
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        const testSkill = skills.find((s) => s.name === "test-skill")
        expect(testSkill).toBeDefined()
        expect(testSkill!.description).toBe("A test skill for verification.")
        expect(testSkill!.location).toContain("skill/test-skill/SKILL.md")
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("returns skill directories from Skill.dirs", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "dir-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: dir-skill
description: Skill for dirs test.
---

# Dir Skill
`,
      )
    },
  })

  const home = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const dirs = await Skill.dirs()
        const skillDir = path.join(tmp.path, ".opencode", "skill", "dir-skill")
        expect(dirs).toContain(skillDir)
        expect(dirs.length).toBe(1)
      },
    })
  } finally {
    if (home === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = home
  }
})

bulletproofTest("discovers multiple skills from .opencode/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir1 = path.join(dir, ".opencode", "skill", "skill-one")
      const skillDir2 = path.join(dir, ".opencode", "skill", "skill-two")
      await Bun.write(
        path.join(skillDir1, "SKILL.md"),
        `---
name: skill-one
description: First test skill.
---

# Skill One
`,
      )
      await Bun.write(
        path.join(skillDir2, "SKILL.md"),
        `---
name: skill-two
description: Second test skill.
---

# Skill Two
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(2)
        expect(skills.find((s) => s.name === "skill-one")).toBeDefined()
        expect(skills.find((s) => s.name === "skill-two")).toBeDefined()
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("skips skills with missing frontmatter", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "no-frontmatter")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `# No Frontmatter

Just some content without YAML frontmatter.
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills).toEqual([])
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("discovers skills from .claude/skills/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "claude-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        const claudeSkill = skills.find((s) => s.name === "claude-skill")
        expect(claudeSkill).toBeDefined()
        expect(claudeSkill!.location).toContain(".claude/skills/claude-skill/SKILL.md")
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("discovers global skills from ~/.claude/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await createGlobalSkill(tmp.path)
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        expect(skills[0].name).toBe("global-test-skill")
        expect(skills[0].description).toBe("A global skill from ~/.claude/skills for testing.")
        expect(skills[0].location).toContain(path.join(".claude", "skills", "global-test-skill", "SKILL.md").replace(/\\/g, "/"))
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("returns empty array when no skills exist", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills).toEqual([])
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("discovers skills from .agents/skills/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        const agentSkill = skills.find((s) => s.name === "agent-skill")
        expect(agentSkill).toBeDefined()
        expect(agentSkill!.location).toContain(path.join(".agents", "skills", "agent-skill", "SKILL.md").replace(/\\/g, "/"))
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("discovers global skills from ~/.agents/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    const skillDir = path.join(tmp.path, ".agents", "skills", "global-agent-skill")
    await fs.mkdir(skillDir, { recursive: true })
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `---
name: global-agent-skill
description: A global skill from ~/.agents/skills for testing.
---

# Global Agent Skill

This skill is loaded from the global home directory.
`,
    )

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(1)
        expect(skills[0].name).toBe("global-agent-skill")
        expect(skills[0].description).toBe("A global skill from ~/.agents/skills for testing.")
        expect(skills[0].location).toContain(path.join(".agents", "skills", "global-agent-skill", "SKILL.md").replace(/\\/g, "/"))
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("discovers skills from both .claude/skills/ and .agents/skills/", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const claudeDir = path.join(dir, ".claude", "skills", "claude-skill")
      const agentDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(claudeDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
      await Bun.write(
        path.join(agentDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        expect(skills.length).toBe(2)
        expect(skills.find((s) => s.name === "claude-skill")).toBeDefined()
        expect(skills.find((s) => s.name === "agent-skill")).toBeDefined()
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})

bulletproofTest("properly resolves directories that skills live in", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const opencodeSkillDir = path.join(dir, ".opencode", "skill", "agent-skill")
      const opencodeSkillsDir = path.join(dir, ".opencode", "skills", "agent-skill")
      const claudeDir = path.join(dir, ".claude", "skills", "claude-skill")
      const agentDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(claudeDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
      await Bun.write(
        path.join(agentDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
      await Bun.write(
        path.join(opencodeSkillDir, "SKILL.md"),
        `---
name: opencode-skill
description: A skill in the .opencode/skill directory.
---

# OpenCode Skill
`,
      )
      await Bun.write(
        path.join(opencodeSkillsDir, "SKILL.md"),
        `---
name: opencode-skill
description: A skill in the .opencode/skills directory.
---

# OpenCode Skill
`,
      )
    },
  })

  const originalHome = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path
  await Global.initialize()

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const dirs = await Skill.dirs()
        expect(dirs.length).toBe(4)
      },
    })
  } finally {
    if (originalHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = originalHome
  }
})
