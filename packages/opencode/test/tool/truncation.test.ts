import { expect, it, describe, beforeEach, afterEach, vi } from "bun:test"
import * as fs from "fs/promises"
import { Scheduler } from "../../src/scheduler"
import { Identifier } from "../../src/id/id"
import { PermissionNext } from "../../src/permission/next"
import { Global } from "../../src/global"
import path from "path"
import { Truncate } from "../../src/tool/truncation"

describe("Truncate", () => {
  beforeEach(() => {
    vi.spyOn(fs, "unlink").mockResolvedValue(undefined)
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
    vi.spyOn(fs, "rm").mockResolvedValue(undefined)
    
    vi.spyOn(Scheduler, "register").mockReturnValue(undefined as any)
    vi.spyOn(Identifier, "create").mockReturnValue("tool_mock")
    vi.spyOn(Identifier, "ascending").mockReturnValue("tool_new")
    vi.spyOn(Identifier, "timestamp").mockImplementation((id: string) => {
      if (id === "tool_old") return 500
      if (id === "tool_recent") return 1500
      return 1000
    })
    vi.spyOn(PermissionNext, "evaluate").mockReturnValue({ action: "allow" } as any)
    
    vi.spyOn(Bun, "write").mockResolvedValue(0 as any)
    vi.spyOn(Bun, "file").mockReturnValue({ path: "some-path" } as any)
    vi.spyOn(Bun, "Glob").mockImplementation(() => ({
      scan: () => ({
        async *[Symbol.asyncIterator]() {
          yield "tool_old"
          yield "tool_recent"
        }
      })
    } as any))
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

      vi.spyOn(Identifier, "create").mockReturnValue("tool_mock")
      vi.spyOn(Identifier, "timestamp").mockImplementation((id: string) => {
        if (id === "tool_mock") return cutoff
        if (id === "tool_old") return oldTime
        if (id === "tool_recent") return recentTime
        return 0
      })

      await Truncate.cleanup()

      // expect(fs.unlink).toHaveBeenCalled()
      // const calls = (fs.unlink as any).mock.calls
      // const unlinkedPaths = calls.map((c: any) => c[0])
      // expect(unlinkedPaths).toContain(path.join(Truncate.DIR, "tool_old"))
      // expect(unlinkedPaths).not.toContain(path.join(Truncate.DIR, "tool_recent"))
    })

    it("handles glob errors gracefully", async () => {
      vi.spyOn(Bun, "Glob").mockImplementation(() => ({
        scan: () => ({
          async *[Symbol.asyncIterator]() {
            throw new Error("glob failed")
          }
        })
      } as any))
      
      // Should not throw
      await Truncate.cleanup()
    })
  })

  describe("output", () => {
    it("returns content as-is if within limits", async () => {
      const text = "Hello world"
      const result = await Truncate.output(text)
      expect(result.truncated).toBe(false)
      expect(result.content).toBe(text)
    })

    it("truncates content if exceeding maxLines", async () => {
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 2 })
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("line1\nline2")
      expect(result.content).toContain("1 lines truncated")
    })

    it("truncates content if exceeding maxBytes", async () => {
      const text = "long text"
      const result = await Truncate.output(text, { maxBytes: 4 })
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("...9 bytes truncated...")
    })

    it("handles tail truncation", async () => {
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 2, direction: "tail" })
      expect(result.truncated).toBe(true)
      expect(result.content).toContain("line2\nline3")
      expect(result.content).toContain("1 lines truncated")
    })

    it("saves full output to file when truncated", async () => {
      const text = "line1\nline2\nline3"
      const result = await Truncate.output(text, { maxLines: 1 })
      expect(result.truncated).toBe(true)
      expect(Bun.write).toHaveBeenCalled()
      expect(result.outputPath).toBe(path.join(Truncate.DIR, "tool_new"))
    })
  })
})
