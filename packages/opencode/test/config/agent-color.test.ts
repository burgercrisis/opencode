import { test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Config } from "../../src/config/config"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Color } from "../../src/util/color"

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

test("agent color parsed from project config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            build: { color: "#FFA500" },
            plan: { color: "primary" },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const cfg = await Config.get()
      expect(cfg.agent?.["build"]?.color).toBe("#FFA500")
      expect(cfg.agent?.["plan"]?.color).toBe("primary")
    },
  })
})

test("Agent.get includes color from config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            plan: { color: "#A855F7" },
            build: { color: "accent" },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const plan = await AgentSvc.get("plan")
      expect(plan?.color).toBe("#A855F7")
      const build = await AgentSvc.get("build")
      expect(build?.color).toBe("accent")
    },
  })
})

test("Color.hexToAnsiBold converts valid hex to ANSI", () => {
  const result = Color.hexToAnsiBold("#FFA500")
  expect(result).toBe("\x1b[38;2;255;165;0m\x1b[1m")
})

test("Color.hexToAnsiBold returns undefined for invalid hex", () => {
  expect(Color.hexToAnsiBold(undefined)).toBeUndefined()
  expect(Color.hexToAnsiBold("")).toBeUndefined()
  expect(Color.hexToAnsiBold("#FFF")).toBeUndefined()
  expect(Color.hexToAnsiBold("FFA500")).toBeUndefined()
  expect(Color.hexToAnsiBold("#GGGGGG")).toBeUndefined()
})
