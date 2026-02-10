import { expect, it, describe, mock, beforeEach, afterEach } from "bun:test"
import { Truncate } from "../../src/tool/truncation"
import { Scheduler } from "../../src/scheduler"
import { Identifier } from "../../src/id/id"
import { PermissionNext } from "../../src/permission/next"
import fs from "fs/promises"
import path from "path"

// Mock dependencies
mock.module("../../src/global", () => ({
  Global: {
    Path: {
      data: "/test-data"
    }
  }
}))

mock.module("../../src/scheduler", () => ({
  Scheduler: {
    register: mock()
  }
}))

mock.module("../../src/id/id", () => ({
  Identifier: {
    create: mock(),
    timestamp: mock(),
    ascending: mock().mockReturnValue("tool_new"),
  }
}))

mock.module("../../src/permission/next", () => ({
  PermissionNext: {
    evaluate: mock()
  }
}))

mock.module("fs/promises", () => ({
  default: {
    ...require("fs/promises"),
    unlink: mock().mockResolvedValue(undefined)
  }
}))

describe("Truncate", () => {
  const originalBun = Bun
  const originalBuffer = Buffer

  beforeEach(() => {
    mock.spyOn(Bun, "write").mockResolvedValue(0 as any)
    mock.spyOn(Bun, "file").mockReturnValue({ path: "some-path" } as any)
    // For Bun.Glob, we might need a different approach since it's a constructor
  })

  afterEach(() => {
    mock.restore()
  })

  describe("init", () => {
    it("registers a cleanup task", () => {
      Truncate.init()
      expect(Scheduler.register).toHaveBeenCalledWith(expect.objectContaining({
        id: "tool.truncation.cleanup"
      }))
    })
  })

  describe("cleanup", () => {
    it("deletes old tool output files", async () => {
      const cutoff = 1000
      const oldTime = 500
      const recentTime = 1500

      ;(Identifier.create as any).mockReturnValue("tool_mock")
      ;(Identifier.timestamp as any).mockImplementation((id: string) => {
        if (id === "tool_mock") return cutoff
        if (id === "tool_old") return oldTime
        if (id === "tool_recent") return recentTime
        return 0
      })

      await Truncate.cleanup()

      expect(fs.unlink).toHaveBeenCalledTimes(1)
      expect(fs.unlink).toHaveBeenCalledWith(path.join("/test-data/tool-output", "tool_old"))
    })

    it("handles glob errors gracefully", async () => {
      const globInstance = new Bun.Glob("tool_*")
      ;(globInstance.scan as any).mockRejectedValue(new Error("glob failed"))
      
      // Should not throw
      await Truncate.cleanup()
    })
  })

  describe("output", () => {
    it("returns content as-is if below limits", async () => {
      const text = "small content"
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    it("truncates by lines (head)", async () => {
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 2, direction: "head" })
      
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("line1\nline2")
      expect(result.content).toContain("1 lines truncated")
      expect(Bun.write).toHaveBeenCalled()
    })

    it("truncates by lines (tail)", async () => {
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 2, direction: "tail" })
      
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("line2\nline3")
      expect(result.content).toContain("1 lines truncated")
    })

    it("truncates by bytes", async () => {
      const text = "a\nb\nc" // 5 bytes with newlines
      const result = await Truncate.output(text, { maxBytes: 3, direction: "head" })
      
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("a\nb")
      expect(result.content).toContain("bytes truncated")
    })

    it("includes task tool hint if agent has permission", async () => {
      ;(PermissionNext.evaluate as any).mockReturnValue({ action: "allow" })
      const text = "line1\nline2"
      const agent = { permission: "some-perm" } as any
      const result = await Truncate.output(text, { maxLines: 1 }, agent)
      
      expect(result.content).toContain("Use the Task tool")
    })

    it("includes default hint if agent does not have task permission", async () => {
      ;(PermissionNext.evaluate as any).mockReturnValue({ action: "deny" })
      const text = "line1\nline2"
      const agent = { permission: "some-perm" } as any
      const result = await Truncate.output(text, { maxLines: 1 }, agent)
      
      expect(result.content).toContain("Use Grep to search")
    })

    it("includes default hint if no agent provided", async () => {
      const text = "line1\nline2"
      const result = await Truncate.output(text, { maxLines: 1 })
      
      expect(result.content).toContain("Use Grep to search")
    })
  })
})
