// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

describe("file/index Filesystem patterns", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  describe("File.read() - text content", () => {
    bulletproofTest("reads text file via Filesystem.readText()", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.txt")
      await fs.writeFile(filepath, "Hello World", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.txt")
          expect(result.type).toBe("text")
          expect(result.content).toBe("Hello World")
        },
      })
    })

    bulletproofTest("reads with Filesystem.exists() check", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Non-existent file should return empty content
          const result = await File.read("nonexistent.txt")
          expect(result.type).toBe("text")
          expect(result.content).toBe("")
        },
      })
    })

    bulletproofTest("trims whitespace from text content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.txt")
      await fs.writeFile(filepath, "  content with spaces  \n\n", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.txt")
          expect(result.content).toBe("content with spaces")
        },
      })
    })

    bulletproofTest("handles empty text file", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "empty.txt")
      await fs.writeFile(filepath, "", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("empty.txt")
          expect(result.type).toBe("text")
          expect(result.content).toBe("")
        },
      })
    })

    bulletproofTest("handles multi-line text files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "multiline.txt")
      await fs.writeFile(filepath, "line1\nline2\nline3", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("multiline.txt")
          expect(result.content).toBe("line1\nline2\nline3")
        },
      })
    })
  })

  describe("File.read() - binary content", () => {
    bulletproofTest("reads binary file via Filesystem.readArrayBuffer()", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "image.png")
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await fs.writeFile(filepath, binaryContent)

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("image.png")
          expect(result.type).toBe("text") // Images return as text with base64 encoding
          expect(result.encoding).toBe("base64")
          expect(result.mimeType).toBe("image/png")
          expect(result.content).toBe(binaryContent.toString("base64"))
        },
      })
    })

    bulletproofTest("returns empty for binary non-image files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "binary.so")
      await fs.writeFile(filepath, Buffer.from([0x7f, 0x45, 0x4c, 0x46]), "binary")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("binary.so")
          expect(result.type).toBe("binary")
          expect(result.content).toBe("")
        },
      })
    })
  })

  describe("File.read() - Filesystem.mimeType()", () => {
    bulletproofTest("detects MIME type via Filesystem.mimeType()", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.json")
      await fs.writeFile(filepath, '{"key": "value"}', "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          expect(Filesystem.mimeType(filepath)).toContain("application/json")

          const result = await File.read("test.json")
          expect(result.type).toBe("text")
        },
      })
    })

    bulletproofTest("handles various image MIME types", async () => {
      await using tmp = await tmpdir()
      const testCases = [
        { ext: "jpg", mime: "image/jpeg" },
        { ext: "png", mime: "image/png" },
        { ext: "gif", mime: "image/gif" },
        { ext: "webp", mime: "image/webp" },
      ]

      for (const { ext, mime } of testCases) {
        const filepath = path.join(tmp.path, `test.${ext}`)
        await fs.writeFile(filepath, Buffer.from([0x00, 0x00, 0x00, 0x00]), "binary")

        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            expect(Filesystem.mimeType(filepath)).toContain(mime)
          },
        })
      }
    })
  })

  describe("File.list() - Filesystem.exists() and readText()", () => {
    bulletproofTest("reads .gitignore via Filesystem.exists() and readText()", async () => {
      await using tmp = await tmpdir({ git: true })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const gitignorePath = path.join(tmp.path, ".gitignore")
          await fs.writeFile(gitignorePath, "node_modules\ndist\n", "utf-8")

          // This is used internally in File.list()
          expect(await Filesystem.exists(gitignorePath)).toBe(true)

          const content = await Filesystem.readText(gitignorePath)
          expect(content).toContain("node_modules")
        },
      })
    })

    bulletproofTest("reads .ignore file similarly", async () => {
      await using tmp = await tmpdir({ git: true })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ignorePath = path.join(tmp.path, ".ignore")
          await fs.writeFile(ignorePath, "*.log\n.env\n", "utf-8")

          expect(await Filesystem.exists(ignorePath)).toBe(true)
          expect(await Filesystem.readText(ignorePath)).toContain("*.log")
        },
      })
    })

    bulletproofTest("handles missing .gitignore gracefully", async () => {
      await using tmp = await tmpdir({ git: true })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const gitignorePath = path.join(tmp.path, ".gitignore")
          expect(await Filesystem.exists(gitignorePath)).toBe(false)

          // File.list() should still work
          const nodes = await File.list()
          expect(Array.isArray(nodes)).toBe(true)
        },
      })
    })
  })

  describe("File.changed() - Filesystem.readText() for untracked files", () => {
    bulletproofTest("reads untracked files via Filesystem.readText()", async () => {
      await using tmp = await tmpdir({ git: true })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const untrackedPath = path.join(tmp.path, "untracked.txt")
          await fs.writeFile(untrackedPath, "new content\nwith multiple lines", "utf-8")

          // This is how File.changed() reads untracked files
          const content = await Filesystem.readText(untrackedPath)
          const lines = content.split("\n").length
          expect(lines).toBe(2)
        },
      })
    })
  })

  describe("Error handling", () => {
    bulletproofTest("handles errors gracefully in Filesystem.readText()", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "readonly.txt")
      await fs.writeFile(filepath, "content", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const nonExistentPath = path.join(tmp.path, "does-not-exist.txt")
          // Filesystem.readText() on non-existent file throws
          await expect(Filesystem.readText(nonExistentPath)).rejects.toThrow()

          // But File.read() handles this gracefully
          const result = await File.read("does-not-exist.txt")
          expect(result.content).toBe("")
        },
      })
    })

    bulletproofTest("handles errors in Filesystem.readArrayBuffer()", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const nonExistentPath = path.join(tmp.path, "does-not-exist.bin")
          const buffer = await Filesystem.readArrayBuffer(nonExistentPath).catch(() => new ArrayBuffer(0))
          expect(buffer.byteLength).toBe(0)
        },
      })
    })

    bulletproofTest("returns empty array buffer on error for images", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "broken.png")
      // Don't create the file

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // File.read() handles missing images gracefully
          const result = await File.read("broken.png")
          expect(result.type).toBe("text")
          expect(result.content).toBe("")
        },
      })
    })
  })

  describe("shouldEncode() logic", () => {
    bulletproofTest("treats .ts files as text", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.ts")
      await fs.writeFile(filepath, "export const value = 1", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.ts")
          expect(result.type).toBe("text")
          expect(result.content).toBe("export const value = 1")
        },
      })
    })

    bulletproofTest("treats .mts files as text", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.mts")
      await fs.writeFile(filepath, "export const value = 1", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.mts")
          expect(result.type).toBe("text")
          expect(result.content).toBe("export const value = 1")
        },
      })
    })

    bulletproofTest("treats .sh files as text", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.sh")
      await fs.writeFile(filepath, "#!/usr/bin/env bash\necho hello", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.sh")
          expect(result.type).toBe("text")
          expect(result.content).toBe("#!/usr/bin/env bash\necho hello")
        },
      })
    })

    bulletproofTest("treats Dockerfile as text", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "Dockerfile")
      await fs.writeFile(filepath, "FROM alpine:3.20", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("Dockerfile")
          expect(result.type).toBe("text")
          expect(result.content).toBe("FROM alpine:3.20")
        },
      })
    })

    bulletproofTest("returns encoding info for text files", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.txt")
      await fs.writeFile(filepath, "simple text", "utf-8")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.txt")
          expect(result.encoding).toBeUndefined()
          expect(result.type).toBe("text")
        },
      })
    })

    bulletproofTest("returns base64 encoding for images", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "test.jpg")
      await fs.writeFile(filepath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "binary")

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await File.read("test.jpg")
          expect(result.encoding).toBe("base64")
          expect(result.mimeType).toBe("image/jpeg")
        },
      })
    })
  })

  describe("Path security", () => {
    bulletproofTest("throws for paths outside project directory", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await expect(File.read("../outside.txt")).rejects.toThrow("Access denied")
        },
      })
    })

    bulletproofTest("throws for paths outside project directory", async () => {
      await using tmp = await tmpdir()

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await expect(File.read("../outside.txt")).rejects.toThrow("Access denied")
        },
      })
    })
  })
})
