import { describe, expect, test, beforeEach, afterEach, vi } from "bun:test"
import { ReadTool } from "../../src/tool/read"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { InstructionPrompt } from "../../src/session/instruction"
import { LSP } from "../../src/lsp"
import { PermissionNext } from "../../src/permission"
import { Agent } from "../../src/agent/agent"
import * as fs from "fs/promises"
import * as path from "path"

const FIXTURES_DIR = path.join(import.meta.dir, "..", "fixture")

const ctx: any = {
  sessionID: "session",
  messageID: "message",
  agent: "agent",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("ReadTool", () => {
  let mocks: {
    instructionPromptResolve: any
    lspTouchFile: any
  }

  beforeEach(() => {
    mocks = {
      instructionPromptResolve: vi.spyOn(InstructionPrompt, "resolve").mockResolvedValue([]),
      lspTouchFile: vi.spyOn(LSP, "touchFile").mockResolvedValue(undefined),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("reads a text file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.txt")
        await fs.writeFile(filePath, "line 1\nline 2\nline 3")

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("line 1")
        expect(result.output).toContain("line 2")
        expect(result.output).toContain("line 3")
        expect(result.output).toContain("(End of file - total 3 lines)")
      },
    })
  })

  test("asks for external_directory permission when reading absolute path outside project", async () => {
    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "secret.txt"), "secret data")
      },
    })
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await read.execute({ filePath: path.join(outerTmp.path, "secret.txt") }, testCtx)
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns.some((p) => p.includes(outerTmp.path))).toBe(true)
      },
    })
  })

  test("asks for directory-scoped external_directory permission when reading external directory", async () => {
    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "external", "a.txt"), "a")
      },
    })
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await read.execute({ filePath: path.join(outerTmp.path, "external") }, testCtx)
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns).toContain(path.join(outerTmp.path, "external", "*"))
      },
    })
  })

  test("asks for external_directory permission when reading relative path outside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        // This will fail because file doesn't exist, but we can check if permission was asked
        await read.execute({ filePath: "../outside.txt" }, testCtx).catch(() => {})
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
      },
    })
  })

  test("does not ask for external_directory permission when reading inside project", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "internal.txt"), "internal content")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await read.execute({ filePath: path.join(tmp.path, "internal.txt") }, testCtx)
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeUndefined()
      },
    })
  })

  test("handles missing file with suggestions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.writeFile(path.join(tmp.path, "hello.txt"), "hello")
        await fs.writeFile(path.join(tmp.path, "world.txt"), "world")

        const tool = await ReadTool.init()
        try {
          await tool.execute({ filePath: path.join(tmp.path, "hell") }, ctx)
          expect.unreachable()
        } catch (e: any) {
          expect(e.message).toContain("File not found")
          expect(e.message).toContain("Did you mean one of these?")
          expect(e.message).toContain("hello.txt")
        }
      },
    })
  })

  test("reads image as base64", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.png")
        const content = Buffer.from("fake-png-data")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toBe("Image read successfully")
        expect(result.attachments).toBeDefined()
        expect(result.attachments![0].mime).toBe("image/png")
        expect(result.attachments![0].url).toContain("data:image/png;base64,")
      },
    })
  })

  test("throws for binary files", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.bin")
        // A file with null bytes is considered binary
        await fs.writeFile(filePath, Buffer.from([0, 1, 2, 3, 0]))

        const tool = await ReadTool.init()
        expect(tool.execute({ filePath }, ctx)).rejects.toThrow(/Cannot read binary file/)
      },
    })
  })

  test("handles offset and limit", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "large.txt")
        const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath, offset: 3, limit: 3 }, ctx)

        expect(result.output).not.toContain("line 1")
        expect(result.output).not.toContain("line 2")
        expect(result.output).toContain("line 3")
        expect(result.output).toContain("line 4")
        expect(result.output).toContain("line 5")
        expect(result.output).not.toContain("line 6")
        expect(result.output).toContain("Use 'offset' parameter to read beyond line 5")
        expect(result.metadata.truncated).toBe(true)
      },
    })
  })

  test("respects offset parameter", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n")
        await Bun.write(path.join(dir, "offset.txt"), lines)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const result = await read.execute({ filePath: path.join(tmp.path, "offset.txt"), offset: 5 }, ctx)
        expect(result.output).toContain("line5")
        expect(result.output).not.toContain("line4")
      },
    })
  })

  test("throws when offset is beyond end of file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const lines = Array.from({ length: 3 }, (_, i) => `line${i + 1}`).join("\n")
        await Bun.write(path.join(dir, "short.txt"), lines)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        await expect(
          read.execute({ filePath: path.join(tmp.path, "short.txt"), offset: 4, limit: 5 }, ctx),
        ).rejects.toThrow("Offset 4 is out of range for this file (3 lines)")
      },
    })
  })

  test("does not mark final directory page as truncated", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Promise.all(
          Array.from({ length: 10 }, (_, i) => Bun.write(path.join(dir, "dir", `file-${i + 1}.txt`), `line${i}`)),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const result = await read.execute({ filePath: path.join(tmp.path, "dir"), offset: 6, limit: 5 }, ctx)
        expect(result.metadata.truncated).toBe(false)
        expect(result.output).not.toContain("Showing 5 of 10 entries")
      },
    })
  })

  test("truncates long lines", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "long_line.txt")
        const longLine = "a".repeat(3000)
        await fs.writeFile(filePath, longLine)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("a".repeat(2000) + "...")
        expect(result.output).not.toContain("a".repeat(2001))
      },
    })
  })

  test("handles empty file", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "empty.txt")
        await fs.writeFile(filePath, "")

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("(End of file - total 1 lines)")
        expect(result.metadata.truncated).toBe(false)
      },
    })
  })

  test("respects bypassCwdCheck in extra", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Use a path that is definitely outside both project and home
        const filePath = "C:\\Users\\user\\Desktop\\outside.txt"
        // Mock fs.writeFile and file.exists/text so we don't actually touch the filesystem
        vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)
        vi.spyOn(Bun, "file").mockImplementation((path: string) => ({
          exists: () => Promise.resolve(true),
          stat: () => Promise.resolve({ isDirectory: () => false }),
          text: () => Promise.resolve("outside"),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          type: "text/plain"
        } as any))

        const tool = await ReadTool.init()
        // Should trigger ask for external_directory normally
        const askSpy = vi.spyOn(ctx, "ask")
        await tool.execute({ filePath }, ctx)
        expect(askSpy).toHaveBeenCalledWith(expect.objectContaining({
          permission: "external_directory"
        }))

        // Should pass with bypass without external_directory permission
        askSpy.mockClear()
        const result = await tool.execute({ filePath }, { ...ctx, extra: { bypassCwdCheck: true } })
        expect(result.output).toContain("outside")
        // Check that it asked for "read" but NOT "external_directory"
        const calls = askSpy.mock.calls
        const permissions = calls.map(c => (c[0] as any).permission)
        expect(permissions).toContain("read")
        expect(permissions).not.toContain("external_directory")
      },
    })
  })

  test("truncates based on MAX_BYTES", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "bytes.txt")
        // MAX_BYTES is 50KB. Create a file larger than that.
        const chunk = "a".repeat(1000)
        const content = Array.from({ length: 60 }, () => chunk).join("\n")
        await fs.writeFile(filePath, content)

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("Output truncated at 51200 bytes")
        expect(result.metadata.truncated).toBe(true)
      },
    })
  })

  test("includes system reminders from instructions", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filePath = path.join(tmp.path, "test.txt")
        await fs.writeFile(filePath, "content")

        const mockResolve = InstructionPrompt.resolve as any
        mockResolve.mockResolvedValueOnce([{ filepath: "hint.md", content: "Remember to do X" }])

        const tool = await ReadTool.init()
        const result = await tool.execute({ filePath }, ctx)

        expect(result.output).toContain("<system-reminder>")
        expect(result.output).toContain("Remember to do X")
        expect(result.metadata.loaded).toContain("hint.md")
      },
    })
  })
})

describe("tool.read env file permissions", () => {
  const cases: [string, boolean][] = [
    [".env", true],
    [".env.local", true],
    [".env.production", true],
    [".env.development.local", true],
    [".env.example", false],
    [".envrc", false],
    ["environment.ts", false],
  ]

  describe.each(["build", "plan"])("agent=%s", (agentName) => {
    test.each(cases)("%s asks=%s", async (filename, shouldAsk) => {
      await using tmp = await tmpdir({
        init: (dir) => Bun.write(path.join(dir, filename), "content"),
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const agent = await Agent.get(agentName)
          let askedForEnv = false
          const ctxWithPermissions = {
            ...ctx,
            ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
              for (const pattern of req.patterns) {
                const rule = PermissionNext.evaluate(req.permission, pattern, agent.permission)
                if (rule.action === "ask" && req.permission === "read") {
                  askedForEnv = true
                }
                if (rule.action === "deny") {
                  throw new PermissionNext.DeniedError(agent.permission)
                }
              }
            },
          }
          const read = await ReadTool.init()
          await read.execute({ filePath: path.join(tmp.path, filename) }, ctxWithPermissions)
          expect(askedForEnv).toBe(shouldAsk)
        },
      })
    })
  })
})

describe("tool.read truncation", () => {
  test("truncates large file by bytes and sets truncated metadata", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const line = "a".repeat(100) + "\n"
        const target = 60 * 1024
        const content = line.repeat(Math.ceil(target / line.length))
        await Bun.write(path.join(dir, "large.json"), content)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const result = await read.execute({ filePath: path.join(tmp.path, "large.json") }, ctx)
        expect(result.metadata.truncated).toBe(true)
        expect(result.output).toContain("Output truncated at")
        expect(result.output).toContain("bytes")
      },
    })
  })

  test("truncates by line count when limit is specified", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        await Bun.write(path.join(dir, "many-lines.txt"), lines)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const result = await read.execute({ filePath: path.join(tmp.path, "many-lines.txt"), limit: 10 }, ctx)
        expect(result.metadata.truncated).toBe(true)
        expect(result.output).toContain("File has more lines")
        expect(result.output).toContain("line0")
        expect(result.output).toContain("line9")
        expect(result.output).not.toContain("line10")
      },
    })
  })

  test("does not truncate small file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "small.txt"), "hello world")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const read = await ReadTool.init()
        const result = await read.execute({ filePath: path.join(tmp.path, "small.txt") }, ctx)
        expect(result.metadata.truncated).toBe(false)
      },
    })
  })
})
