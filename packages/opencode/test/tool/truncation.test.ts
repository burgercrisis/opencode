import { expect, it, describe, mock, beforeEach, afterEach, spyOn } from "bun:test"
import fs from "fs/promises"

const unlinkSpy = spyOn(fs, "unlink").mockResolvedValue(undefined)
const writeFileSpy = spyOn(fs, "writeFile").mockResolvedValue(undefined)
const mkdirSpy = spyOn(fs, "mkdir").mockResolvedValue(undefined)

// Also spy on named exports if they exist
try {
  const fsp = require("fs/promises")
  if (fsp.unlink && fsp.unlink !== fs.unlink) spyOn(fsp, "unlink").mockResolvedValue(undefined)
} catch {}

import { Scheduler } from "../../src/scheduler"
import { Identifier } from "../../src/id/id"
import { PermissionNext } from "../../src/permission/next"
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
    create: mock().mockReturnValue("tool_mock"),
    ascending: mock().mockReturnValue("tool_new"),
    timestamp: mock().mockImplementation((id: string) => {
      if (id === "tool_old") return 500
      if (id === "tool_recent") return 1500
      return 1000
    }),
  }
}))

mock.module("../../src/permission/next", () => ({
  PermissionNext: {
    evaluate: mock().mockReturnValue({ action: "allow" })
  }
}))

import { Truncate } from "../../src/tool/truncation"

describe("Truncate", () => {
  beforeEach(() => {
    unlinkSpy.mockClear()
    writeFileSpy.mockClear()
    mkdirSpy.mockClear()
    spyOn(Bun, "write").mockResolvedValue(0 as any)
    spyOn(Bun, "file").mockReturnValue({ path: "some-path" } as any)
    spyOn(Bun, "Glob").mockImplementation(() => {
      const scanMock = mock().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield "tool_old"
          yield "tool_recent"
        }
      })
      return { scan: scanMock } as any
    })
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

      expect(unlinkSpy).toHaveBeenCalled()
      const calls = unlinkSpy.mock.calls
      const unlinkedPaths = calls.map((c: any) => c[0])
      expect(unlinkedPaths).toContain(path.join(Truncate.DIR, "tool_old"))
      expect(unlinkedPaths).not.toContain(path.join(Truncate.DIR, "tool_recent"))
    })

    it("handles glob errors gracefully", async () => {
      ;(Bun.Glob as any).mockImplementation(() => ({
        scan: mock().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw new Error("glob failed")
          }
        })
      }))
      
      // Should not throw
      await Truncate.cleanup()
    })
  })

  describe("output", () => {
    it("returns original text if below limits", async () => {
      const text = "small output"
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    it("truncates if lines exceed limit", async () => {
      const text = "line1\nline2\nline3\nline4\nline5"
      const result = await Truncate.output(text, { maxLines: 2 })
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("3 lines truncated")
      expect(result.content).toContain("line1\nline2")
      expect(Bun.write).toHaveBeenCalled()
    })

    it("truncates if bytes exceed limit", async () => {
      const text = "a".repeat(100)
      // Set maxBytes small enough to force truncation
      const result = await Truncate.output(text, { maxBytes: 50 })
      expect(result.truncated).toBe(true)
      // Verify content is truncated but exact byte count message may vary due to path length in mock
      expect(result.content).toContain("bytes truncated")
      expect(Bun.write).toHaveBeenCalled()
    })

    it("handles tail truncation", async () => {
      const text = "line1\nline2\nline3\nline4\nline5"
      const result = await Truncate.output(text, { maxLines: 2, direction: "tail" })
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("line4\nline5")
      expect(result.content.startsWith("...3 lines truncated")).toBe(true)
    })

    it("uses Task tool hint if agent has permission", async () => {
      ;(PermissionNext.evaluate as any).mockReturnValue({ action: "allow" })
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 1 }, { permission: {} } as any)
      expect(result.content).toContain("Use the Task tool")
    })

    it("uses default hint if agent doesn't have Task tool permission", async () => {
      ;(PermissionNext.evaluate as any).mockReturnValue({ action: "deny" })
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 1 }, { permission: {} } as any)
      expect(result.content).toContain("Use Grep to search")
    })
  })
})
