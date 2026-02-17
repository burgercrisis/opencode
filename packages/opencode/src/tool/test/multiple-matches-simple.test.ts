import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test"
import { EditTool, replace } from "../edit"
import { Instance } from "../../project/instance"
import { LSP } from "../../lsp"
import { FileTime } from "../../file/time"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"
import { Filesystem } from "../../util/filesystem"
import { mkdirSync } from "node:fs"
import { Bus } from "../../bus"

describe("EditTool Multiple Matches", () => {
  const ctx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    ask: mock(() => Promise.resolve()),
    metadata: mock(() => { }),
  } as any

  beforeEach(() => {
    vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined)
    vi.spyOn(LSP, "diagnostics").mockResolvedValue({})
    vi.spyOn(Bus, "publish").mockResolvedValue(undefined as any)
    vi.spyOn(FileTime, "withLock").mockImplementation((path: string, fn: () => Promise<any>) => fn())
    vi.spyOn(FileTime, "assert").mockResolvedValue(undefined)
    vi.spyOn(FileTime, "read").mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Occurrence Selection", () => {
    it("should replace specific occurrence", async () => {
      await using tmp = await tmpdir()
      const filePath = path.join(tmp.path, "test.txt")
      await Bun.write(filePath, "foo\nbar\nfoo\nbaz\nfoo")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await EditTool.init()
          const result = await tool.execute({
            filePath,
            oldString: "foo",
            newString: "qux",
            occurrence: 2 // Replace second occurrence
          }, ctx)

          expect(result.output).toContain("Edit applied successfully")
          const content = await Bun.file(filePath).text()
          expect(content).toBe("foo\nbar\nqux\nbaz\nfoo")
        }
      })
    })

    it("should throw error when occurrence is out of range", async () => {
      await using tmp = await tmpdir()
      const filePath = path.join(tmp.path, "test.txt")
      await Bun.write(filePath, "foo\nbar\nfoo")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await EditTool.init()

          await expect(tool.execute({
            filePath,
            oldString: "foo",
            newString: "bar",
            occurrence: 5 // Out of range
          }, ctx)).rejects.toThrow("occurrence 5 is out of range. Found 2 matches.")
        }
      })
    })
  })

  describe("Replace Function", () => {
    it("should handle occurrence selection in replace function", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo"
      const result = replace(content, "foo", "qux", false, { occurrence: 2 })
      expect(result).toBe("foo\nbar\nqux\nbaz\nfoo")
    })

    it("should handle replaceAll with options", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo"
      const result = replace(content, "foo", "qux", true, { confidence: 0.9 })
      expect(result).toBe("qux\nbar\nqux\nbaz\nqux")
    })

    it("should throw enhanced error for multiple matches", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo"

      try {
        replace(content, "foo", "qux", false)
        throw new Error("Should have thrown")
      } catch (e: any) {
        expect(e.message).toContain("Found 3 matches for oldString")
        expect(e.message).toContain("Suggested solutions:")
      }
    })

    it("should handle single match without options", () => {
      const content = "foo\nbar\nbaz"
      const result = replace(content, "bar", "qux", false)
      expect(result).toBe("foo\nqux\nbaz")
    })
  })
})
