import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { PlanExitTool, PlanEnterTool } from "../plan"

describe("PlanExitTool", () => {
  test("should define tool with correct id", () => {
    expect(PlanExitTool.id).toBe("plan_exit")
  })

  test("should have description", async () => {
    const init = await PlanExitTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await PlanExitTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should accept empty parameters", async () => {
    const init = await PlanExitTool.init()
    const parsed = init.parameters.safeParse({})
    expect(parsed.success).toBe(true)
  })
})

describe("PlanEnterTool", () => {
  test("should define tool with correct id", () => {
    expect(PlanEnterTool.id).toBe("plan_enter")
  })

  test("should have description", async () => {
    const init = await PlanEnterTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await PlanEnterTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should accept empty parameters", async () => {
    const init = await PlanEnterTool.init()
    const parsed = init.parameters.safeParse({})
    expect(parsed.success).toBe(true)
  })
})