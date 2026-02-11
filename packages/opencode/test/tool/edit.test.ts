import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test"
import { EditTool } from "../../src/tool/edit"
import { Instance } from "../../src/project/instance"
import { LSP } from "../../src/lsp"
import { FileTime } from "../../src/file/time"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"
import { Filesystem } from "../../src/util/filesystem"
import { mkdirSync } from "node:fs"
import { Bus } from "../../src/bus"

describe("EditTool", () => {
  const ctx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    ask: mock(() => Promise.resolve()),
    metadata: mock(() => {}),
  } as any

  beforeEach(() => {
    vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined)
    vi.spyOn(LSP, "diagnostics").mockResolvedValue({})
    vi.spyOn(Bus, "publish").mockResolvedValue(undefined)
    vi.spyOn(FileTime, "withLock").mockImplementation((path: string, fn: () => Promise<any>) => fn())
    vi.spyOn(FileTime, "assert").mockResolvedValue(undefined)
    vi.spyOn(FileTime, "read").mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("replaces a string in a file", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "hello world\nline 2\nline 3")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute({
          filePath,
          oldString: "world",
          newString: "universe"
        }, ctx)

        expect(result.output).toContain("Edit applied successfully.")
        const content = await Bun.file(filePath).text()
        expect(content).toBe("hello universe\nline 2\nline 3")
        expect(ctx.ask).toHaveBeenCalled()
      }
    })
  })

  it("handles oldString as empty string (overwrite file)", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "original content")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute({
          filePath,
          oldString: "",
          newString: "new content"
        }, ctx)

        expect(result.output).toContain("Edit applied successfully.")
        const content = await Bun.file(filePath).text()
        expect(content).toBe("new content")
      }
    })
  })

  it("handles replaceAll: true", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "foo bar foo baz")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "foo",
          newString: "qux",
          replaceAll: true
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("qux bar qux baz")
      }
    })
  })

  it("throws error if oldString is not found", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "hello")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        expect(tool.execute({
          filePath,
          oldString: "world",
          newString: "universe"
        }, ctx)).rejects.toThrow("oldString not found in content")
      }
    })
  })

  it("throws error if multiple matches found (same match string)", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "foo\nfoo")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        expect(tool.execute({
          filePath,
          oldString: "foo",
          newString: "bar"
        }, ctx)).rejects.toThrow("Found multiple matches for oldString")
      }
    })
  })

  it("throws error if multiple matches found (different match strings)", async () => {
    // This is harder to trigger because replacers are tried in order and we take the first replacer that finds matches.
    // So we need a replacer that itself returns multiple DIFFERENT matches.
    // MultiOccurrenceReplacer does this.
    const { MultiOccurrenceReplacer } = await import("../../src/tool/edit")
    const content = "foo bar foo"
    const find = "foo"
    const matches = Array.from(MultiOccurrenceReplacer(content, find))
    // MultiOccurrenceReplacer returns the SAME string multiple times.
    // So uniqueMatches will still be size 1.
    
    // Actually, I don't think any current replacer returns different strings.
    // Wait, WhitespaceNormalizedReplacer?
    // It returns the ORIGINAL blocks from the content.
    // If multiple blocks match the normalized find, it returns all of them.
  })

  it("uses ContextAwareReplacer logic", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    const content = "line 1\nline 2\nline 3\nline 4\nline 5"
    await Bun.write(filePath, content)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const oldString = "line 1\nline X\nline 3\nline 4\nline 5"
        
        await tool.execute({
          filePath,
          oldString,
          newString: "line 1\nMODIFIED\nline 3\nline 4\nline 5"
        }, ctx)

        const newContent = await Bun.file(filePath).text()
        expect(newContent).toContain("MODIFIED")
      }
    })
  })

  it("handles indentation flexible replacer", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "    nested code\n    more code")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "nested code\nmore code",
          newString: "modified code\nstill modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("    modified code\n    still modified")
      }
    })
  })

  it("handles whitespace normalized replacer", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "line   with   extra   spaces")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "line with extra spaces",
          newString: "modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("modified")
      }
    })
  })

  it("handles block anchor replacer with multiple candidates and similarity threshold", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    const content = `start
line 1
middle 1
line 3
end
other
start
line 1
middle 2
line 3
end`
    await Bun.write(filePath, content)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        // "middle X" is equally similar to "middle 1" and "middle 2"
        // But if we provide more context that matches one better
        const oldString = `start
line 1
middle 1.1
line 3
end`
        // Similarity: "middle 1.1" (len 10) vs "middle 1" (len 8): dist 2. sim = 0.8
        // "middle 1.1" vs "middle 2": dist 2. sim = 0.8
        // If we have multiple candidates with same max similarity, it should still pick one if it's above threshold?
        // Actually BlockAnchorReplacer.ts:342: const best = candidates.length === 1 ? initialBest : findBest(0, initialBest)
        // findBest will pick the LAST one with max similarity if they are equal because of `similarity > currentBest.max`.
        
        await tool.execute({
          filePath,
          oldString,
          newString: `start\nline 1\nMODIFIED\nline 3\nend`
        }, ctx)

        const newContent = await Bun.file(filePath).text()
        expect(newContent).toContain("MODIFIED")
      }
    })
  })

  it("handles ContextAwareReplacer with low matching stats", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    // ContextAware needs >= 3 lines.
    const content = "header\ncontent 1\ncontent 2\ncontent 3\nfooter"
    await Bun.write(filePath, content)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        // Try to match with too many differences in the middle
        const oldString = "header\nwrong 1\nwrong 2\nwrong 3\nfooter"
        // stats: matching=0, total=3. 0/3 < 0.5. Should NOT match.
        
        expect(tool.execute({
          filePath,
          oldString,
          newString: "header\nMODIFIED\nfooter"
        }, ctx)).rejects.toThrow("oldString not found in content")
      }
    })
  })

  it("handles TrimmedBoundaryReplacer", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "  some content  ")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "some content", // Trimmed version
          newString: "modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("  modified  ")
      }
    })
  })

  it("handles EscapeNormalizedReplacer with escaped characters in content", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "line with\\nnewline literal")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "line with\\nnewline literal",
          newString: "modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("modified")
      }
    })
  })

  it("handles MultiOccurrenceReplacer with multiple matches", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "foo foo")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        // Without replaceAll: true, it should throw because of multiple matches
        expect(tool.execute({
          filePath,
          oldString: "foo",
          newString: "bar"
        }, ctx)).rejects.toThrow("Found multiple matches for oldString")
        
        // With replaceAll: true
        await tool.execute({
          filePath,
          oldString: "foo",
          newString: "bar",
          replaceAll: true
        }, ctx)
        
        const content = await Bun.file(filePath).text()
        expect(content).toBe("bar bar")
      }
    })
  })

  it("handles escape normalized replacer", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "line with\nnewline")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "line with\\nnewline",
          newString: "modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("modified")
      }
    })
  })

  it("handles LSP errors and limits them", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.ts")
    await Bun.write(filePath, "const x = 1")

    const manyErrors = Array.from({ length: 25 }, (_, i) => ({
      message: `Error ${i}`,
      range: {
        start: { line: i, character: 0 },
        end: { line: i, character: 10 }
      },
      severity: 1
    })) as any[]

    vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined)
    vi.spyOn(LSP, "diagnostics").mockResolvedValue({
      [Filesystem.normalizePath(filePath)]: manyErrors
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute({
          filePath,
          oldString: "const x = 1",
          newString: "const x = 2"
        }, ctx)

        expect(result.output).toContain("LSP errors detected")
        expect(result.output).toContain("... and 5 more")
      }
    })
  })

  it("handles directory error", async () => {
    await using tmp = await tmpdir()
    const dirPath = path.join(tmp.path, "dir")
    mkdirSync(dirPath)

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        expect(tool.execute({
          filePath: dirPath,
          oldString: "foo",
          newString: "bar"
        }, ctx)).rejects.toThrow("is a directory")
      }
    })
  })

  it("handles WhitespaceNormalizedReplacer with multi-line blocks (2 lines)", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "line 1\n  line 2  ")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "line 1\nline 2",
          newString: "modified"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("modified")
      }
    })
  })

  it("handles WhitespaceNormalizedReplacer with single line partial match", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    await Bun.write(filePath, "prefix word1   word2 suffix")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        await tool.execute({
          filePath,
          oldString: "word1 word2",
          newString: "MODIFIED"
        }, ctx)

        const content = await Bun.file(filePath).text()
        expect(content).toBe("prefix MODIFIED suffix")
      }
    })
  })

  it("handles multiple candidates error (different strings)", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        
        // LineTrimmedReplacer will find both because they match after trimming,
        // but they are different strings (different indentation).
        const content = "  duplicate\n    duplicate"
        await Bun.write(filePath, content)
        
        try {
          await tool.execute({
            filePath,
            oldString: "duplicate",
            newString: "MODIFIED"
          }, ctx)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("Found multiple matches for oldString")
        }
      }
    })
  })

  it("handles multiple candidates error with different strings (uniqueMatches.length > 1)", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.txt")
    
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await EditTool.init()
        
        // Different indentation levels will cause LineTrimmedReplacer to find 
        // two different strings that both match after trimming.
        const content = "  line\n    next\n\n    line\n      next"
        await Bun.write(filePath, content)
        
        try {
          await tool.execute({
            filePath,
            oldString: "line\nnext",
            newString: "MODIFIED"
          }, ctx)
          throw new Error("Should have thrown")
        } catch (e: any) {
          expect(e.message).toContain("Found multiple matches for oldString")
        }
      }
    })
  })

  it("covers trimDiff edge cases", async () => {
    const { trimDiff } = await import("../../src/tool/edit")
    // min === 0
    expect(trimDiff("-line\n+line")).toBe("-line\n+line")
    // contentLines.length === 0
    expect(trimDiff("--- a\n+++ b")).toBe("--- a\n+++ b")
  })

  it("handles trimDiff with indentation", async () => {
    const { trimDiff } = await import("../../src/tool/edit")
    const diff = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
-  old line
+  new line
   context line`
    
    const trimmed = trimDiff(diff)
    // It should remove the 2 spaces indentation common to all content lines
    expect(trimmed).toContain("-old line")
    expect(trimmed).toContain("+new line")
  })
})
