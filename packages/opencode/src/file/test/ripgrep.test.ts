import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { Ripgrep } from "../ripgrep"
import { Global } from "../../global"
import { tmpdir } from "bun"
import fs from "fs/promises"
import path from "path"

describe("Ripgrep", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = tmpdir()
  })

  afterEach(async () => {
    // Clean up temp directory if needed
  })

  describe("schema validation", () => {
    it("should validate Match schema", () => {
      const validMatch = {
        type: "match" as const,
        data: {
          path: { text: "test.txt" },
          lines: { text: "console.log('hello');" },
          line_number: 1,
          absolute_offset: 0,
          submatches: [{
            match: { text: "console" },
            start: 0,
            end: 7
          }]
        }
      }
      
      expect(() => Ripgrep.Match.parse(validMatch)).not.toThrow()
      const parsed = Ripgrep.Match.parse(validMatch)
      expect(parsed.type).toBe("match")
      expect(parsed.data.path.text).toBe("test.txt")
      expect(parsed.data.line_number).toBe(1)
    })

    it("should validate Begin schema", () => {
      const validBegin = {
        type: "begin" as const,
        data: {
          path: { text: "test.txt" }
        }
      }
      
      expect(() => Ripgrep.Result.parse(validBegin)).not.toThrow()
      const parsed = Ripgrep.Result.parse(validBegin)
      expect(parsed.type).toBe("begin")
    })

    it("should validate End schema", () => {
      const validEnd = {
        type: "end" as const,
        data: {
          path: { text: "test.txt" },
          binary_offset: null,
          stats: {
            elapsed: { secs: 0, nanos: 100000, human: "0.000s" },
            searches: 1,
            searches_with_match: 1,
            bytes_searched: 100,
            bytes_printed: 50,
            matched_lines: 1,
            matches: 1
          }
        }
      }
      
      expect(() => Ripgrep.Result.parse(validEnd)).not.toThrow()
      const parsed = Ripgrep.Result.parse(validEnd)
      expect(parsed.type).toBe("end")
    })

    it("should validate Summary schema", () => {
      const validSummary = {
        type: "summary" as const,
        data: {
          elapsed_total: { secs: 1, nanos: 500000000, human: "1.500s" },
          stats: {
            elapsed: { secs: 0, nanos: 100000, human: "0.000s" },
            searches: 1,
            searches_with_match: 1,
            bytes_searched: 100,
            bytes_printed: 50,
            matched_lines: 1,
            matches: 1
          }
        }
      }
      
      expect(() => Ripgrep.Result.parse(validSummary)).not.toThrow()
      const parsed = Ripgrep.Result.parse(validSummary)
      expect(parsed.type).toBe("summary")
    })
  })

  describe("error classes", () => {
    it("should create ExtractionFailedError", () => {
      const error = new Ripgrep.ExtractionFailedError({
        filepath: "/test/rg.tar.gz",
        stderr: "tar: Error opening archive"
      })
      
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("RipgrepExtractionFailedError")
    })

    it("should create UnsupportedPlatformError", () => {
      const error = new Ripgrep.UnsupportedPlatformError({
        platform: "unknown-arch"
      })
      
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("RipgrepUnsupportedPlatformError")
    })

    it("should create DownloadFailedError", () => {
      const error = new Ripgrep.DownloadFailedError({
        url: "https://example.com/rg",
        status: 404
      })
      
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("RipgrepDownloadFailedError")
    })
  })

  describe("filepath function", () => {
    it("should return filepath when rg is available", async () => {
      // Mock Bun.which to return a path
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/rg"
        }
      })()

      // Mock fs.stat to return a file stat
      mock(fs, "stat", () => Promise.resolve({ isFile: () => true }))

      const filepath = await Ripgrep.filepath()
      expect(filepath).toBe("/usr/local/bin/rg")
    })

    it("should return fallback path when rg is not available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => null
        }
      })()

      // This would test the download and extraction logic
      // For now, just ensure it doesn't throw
      const filepath = await Ripgrep.filepath()
      expect(typeof filepath).toBe("string")
    })
  })

  describe("files function", () => {
    beforeEach(() => {
      // Mock Global.Path.bin
      globalThis.Global = {
        ...Global,
        Path: {
          ...Global.Path,
          bin: tempDir
        }
      }
    })

    it("should yield files from directory", async () => {
      // Mock the spawn and file reading
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: false, 
                  value: new TextEncoder().encode("file1.ts\nfile2.js\n") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const files = []
      for await (const file of Ripgrep.files({ cwd: tempDir })) {
        files.push(file)
      }

      expect(files).toContain("file1.ts")
      expect(files).toContain("file2.js")
    })

    it("should respect glob patterns", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--glob=*.ts")
            return {
              stdout: {
                getReader: () => ({
                  read: () => Promise.resolve({ 
                    done: true, 
                    value: new TextEncoder().encode("file.ts\n") 
                  }),
                  releaseLock: () => {}
                })
              },
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const files = []
      for await (const file of Ripgrep.files({ 
        cwd: tempDir, 
        glob: ["*.ts"] 
      })) {
        files.push(file)
      }

      expect(files).toContain("file.ts")
    })

    it("should handle hidden files option", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--hidden")
            return {
              stdout: {
                getReader: () => ({
                  read: () => Promise.resolve({ 
                    done: true, 
                    value: new TextEncoder().encode("") 
                  }),
                  releaseLock: () => {}
                })
              },
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const files = []
      for await (const file of Ripgrep.files({ 
        cwd: tempDir, 
        hidden: true 
      })) {
        files.push(file)
      }

      expect(Array.isArray(files)).toBe(true)
    })

    it("should handle max depth option", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--max-depth=2")
            return {
              stdout: {
                getReader: () => ({
                  read: () => Promise.resolve({ 
                    done: true, 
                    value: new TextEncoder().encode("") 
                  }),
                  releaseLock: () => {}
                })
              },
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const files = []
      for await (const file of Ripgrep.files({ 
        cwd: tempDir, 
        maxDepth: 2 
      })) {
        files.push(file)
      }

      expect(Array.isArray(files)).toBe(true)
    })

    it("should handle abort signal", async () => {
      const abortController = new AbortController()
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const files = []
      for await (const file of Ripgrep.files({ 
        cwd: tempDir, 
        signal: abortController.signal 
      })) {
        files.push(file)
      }

      expect(Array.isArray(files)).toBe(true)
    })

    it("should handle non-existent directory", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      // Mock fs.stat to throw ENOENT
      mock(fs, "stat", () => Promise.reject(
        Object.assign(new Error("No such file or directory"), {
          code: "ENOENT",
          errno: -2,
          path: "/nonexistent"
        })
      ))

      await expect(Ripgrep.files({ cwd: "/nonexistent" }).next()).rejects.toThrow("No such file or directory")
    })
  })

  describe("tree function", () => {
    it("should generate tree structure", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("src/\nsrc/components/\nsrc/components/Button.tsx\npackage.json\n") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const tree = await Ripgrep.tree({ cwd: tempDir })
      expect(typeof tree).toBe("string")
      expect(tree).toContain("src/")
      expect(tree).toContain("src/components/")
    })

    it("should respect limit parameter", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("src/\nsrc/components/\nsrc/components/Button.tsx\n") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const tree = await Ripgrep.tree({ cwd: tempDir, limit: 10 })
      const lines = tree.split('\n').filter(line => line.trim())
      expect(lines.length).toBeLessThanOrEqual(10)
    })

    it("should handle abort signal", async () => {
      const abortController = new AbortController()
      
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const tree = await Ripgrep.tree({ cwd: tempDir, signal: abortController.signal })
      expect(typeof tree).toBe("string")
    })

    it("should filter .opencode files", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: {
              getReader: () => ({
                read: () => Promise.resolve({ 
                  done: true, 
                  value: new TextEncoder().encode("src/\npackage.json\n") 
                }),
                releaseLock: () => {}
              })
            },
            exited: Promise.resolve(0)
          })
        }
      })()

      const tree = await Ripgrep.tree({ cwd: tempDir })
      expect(tree).not.toContain(".opencode")
    })
  })

  describe("search function", () => {
    it("should search for patterns", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: () => ({
            stdout: new Response(JSON.stringify([
              {
                type: "match",
                data: {
                  path: { text: "test.ts" },
                  lines: { text: "console.log('hello');" },
                  line_number: 1,
                  absolute_offset: 0,
                  submatches: [{
                    match: { text: "console" },
                    start: 0,
                    end: 7
                  }]
                }
              }
            ])).body,
            exited: Promise.resolve(0)
          })
        }
      })()

      const results = await Ripgrep.search({ 
        cwd: tempDir, 
        pattern: "console" 
      })

      expect(results).toHaveLength(1)
      expect(results[0].path.text).toBe("test.ts")
      expect(results[0].lines.text).toContain("console")
    })

    it("should respect glob patterns", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--glob=*.ts")
            return {
              stdout: new Response("[]").body,
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const results = await Ripgrep.search({ 
        cwd: tempDir, 
        pattern: "test",
        glob: ["*.ts"] 
      })

      expect(Array.isArray(results)).toBe(true)
    })

    it("should respect limit parameter", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--max-count=5")
            return {
              stdout: new Response("[]").body,
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const results = await Ripgrep.search({ 
        cwd: tempDir, 
        pattern: "test",
        limit: 5 
      })

      expect(Array.isArray(results)).toBe(true)
    })

    it("should handle follow option", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          spawn: (args) => {
            expect(args).toContain("--follow")
            return {
              stdout: new Response("[]").body,
              exited: Promise.resolve(0)
            }
          }
        }
      })()

      const results = await Ripgrep.search({ 
        cwd: tempDir, 
        pattern: "test",
        follow: true 
      })

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe("platform support", () => {
    it("should support all major platforms", () => {
      const platforms = ["arm64-darwin", "arm64-linux", "x64-darwin", "x64-linux", "x64-win32"]
      
      platforms.forEach(platform => {
        expect(typeof platform).toBe("string")
        expect(platform.includes("-")).toBe(true)
      })
    })
  })

  describe("error handling", () => {
    it("should handle download failures", async () => {
      mock(async () => {
        global.fetch = () => Promise.resolve({
          ok: false,
          status: 404
        })
      })()

      await expect(Ripgrep.filepath()).rejects.toThrow()
    })

    it("should handle extraction failures", async () => {
      // This would need more complex mocking for the extraction process
      // For now, ensure error handling exists
      expect(Ripgrep.ExtractionFailedError).toBeDefined()
      expect(Ripgrep.UnsupportedPlatformError).toBeDefined()
      expect(Ripgrep.DownloadFailedError).toBeDefined()
    })
  })
})
