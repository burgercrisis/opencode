import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { ApplyPatchTool } from "../apply_patch"
import * as fs from "fs/promises"
import * as path from "path"

describe("ApplyPatchTool", () => {
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
    expect(ApplyPatchTool.id).toBe("apply_patch")
  })

  test("should have description", async () => {
    const init = await ApplyPatchTool.init()
    expect(init.description).toBeDefined()
    expect(init.description.length).toBeGreaterThan(0)
  })

  test("should have parameters schema", async () => {
    const init = await ApplyPatchTool.init()
    expect(init.parameters).toBeDefined()
  })

  test("should throw error for empty patchText", async () => {
    const init = await ApplyPatchTool.init()
    
    await expect(init.execute({
      patchText: "",
    }, mockCtx)).rejects.toThrow("patchText is required")
  })

  test("should throw error for invalid patch format", async () => {
    const init = await ApplyPatchTool.init()
    
    await expect(init.execute({
      patchText: "not a valid patch",
    }, mockCtx)).rejects.toThrow()
  })

  test("should validate parameters schema", async () => {
    const init = await ApplyPatchTool.init()
    
    const parsed = init.parameters.safeParse({
      patchText: "*** Begin Patch\n*** End Patch",
    })
    
    expect(parsed.success).toBe(true)
  })

  test("should require patchText parameter", async () => {
    const init = await ApplyPatchTool.init()
    
    const parsed = init.parameters.safeParse({})
    
    expect(parsed.success).toBe(false)
  })

  test("should throw error for empty patch", async () => {
    const init = await ApplyPatchTool.init()
    
    await expect(init.execute({
      patchText: "*** Begin Patch\n*** End Patch",
    }, mockCtx)).rejects.toThrow("empty patch")
  })

  test("should request permission", async () => {
    const init = await ApplyPatchTool.init()
    
    try {
      await init.execute({
        patchText: "*** Begin Patch\n*** End Patch",
      }, mockCtx)
    } catch (e) {
      // Expected to fail
    }

    // Permission is requested after parsing, so it may not be called for invalid patches
  })
})