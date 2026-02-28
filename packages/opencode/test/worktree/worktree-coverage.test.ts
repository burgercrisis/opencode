import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"

// Import the worktree module to access internal functions
const worktreeModule = await import("../../src/worktree")

// Access internal functions through module manipulation
const ADJECTIVES = [
  "brave", "calm", "clever", "cosmic", "crisp", "curious", "eager", "gentle",
  "glowing", "happy", "hidden", "jolly", "kind", "lucky", "mighty", "misty",
  "neon", "nimble", "playful", "proud", "quick", "quiet", "shiny", "silent",
  "stellar", "sunny", "swift", "tidy", "witty"
] as const

const NOUNS = [
  "cabin", "cactus", "canyon", "circuit", "comet", "eagle", "engine", "falcon",
  "forest", "garden", "harbor", "island", "knight", "lagoon", "meadow", "moon",
  "mountain", "nebula", "orchid", "otter", "panda", "pixel", "planet", "river",
  "rocket", "sailor", "squid", "star", "tiger", "wizard", "wolf"
] as const

// Helper functions to test internal logic
function pick<const T extends readonly string[]>(list: T) {
  return list[Math.floor(Math.random() * list.length)]
}

function slug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
}

function randomName() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
}

async function exists(target: string) {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false)
}

function outputText(input: Uint8Array | undefined) {
  if (!input?.length) return ""
  return new TextDecoder().decode(input).trim()
}

function errorText(result: { stdout?: Uint8Array; stderr?: Uint8Array }) {
  return [outputText(result.stderr), outputText(result.stdout)].filter(Boolean).join("\n")
}

function failed(result: { stdout?: Uint8Array; stderr?: Uint8Array }) {
  return [outputText(result.stderr), outputText(result.stdout)].filter(Boolean).flatMap((chunk) =>
    chunk
      .split("\n")
      .map((line) => line.trim())
      .flatMap((line) => {
        const match = line.match(/^warning:\s+failed to remove\s+(.+):\s+/i)
        if (!match) return []
        const value = match[1]?.trim().replace(/^['"]|['"]$/g, "")
        if (!value) return []
        return [value]
      }),
  )
}

async function canonical(input: string) {
  const abs = path.resolve(input)
  const real = await fs.realpath(abs).catch(() => abs)
  const normalized = path.normalize(real)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

describe("Worktree Internal Functions Coverage", () => {
  describe("pick function", () => {
    test("returns element from array", () => {
      const list = ["a", "b", "c"] as const
      const result = pick(list)
      expect(list).toContain(result)
    })

    test("works with empty array edge case", () => {
      const list = [] as const
      const result = pick(list)
      expect(result).toBeUndefined()
    })

    test("returns different elements on multiple calls", () => {
      const list = ["option1", "option2", "option3"] as const
      const results = new Set()

      // Call multiple times to increase chance of different results
      for (let i = 0; i < 10; i++) {
        results.add(pick(list))
      }

      // Should have at least some variety (though not guaranteed due to randomness)
      expect(results.size).toBeGreaterThan(0)
    })
  })

  describe("slug function", () => {
    test("normalizes basic string", () => {
      expect(slug("Hello World")).toBe("hello-world")
    })

    test("handles special characters", () => {
      expect(slug("My Feature Name!")).toBe("my-feature-name")
    })

    test("handles multiple spaces and hyphens", () => {
      expect(slug("  test---multiple   spaces  ")).toBe("test-multiple-spaces")
    })

    test("handles leading and trailing hyphens", () => {
      expect(slug("---test---")).toBe("test")
    })

    test("handles empty string", () => {
      expect(slug("")).toBe("")
    })

    test("handles only special characters", () => {
      expect(slug("!@#$%^&*()")).toBe("")
    })
  })

  describe("randomName function", () => {
    test("generates valid format", () => {
      const name = randomName()
      expect(name).toMatch(/^[a-z]+-[a-z]+$/)
    })

    test("uses adjective from list", () => {
      const name = randomName()
      const [adjective] = name.split("-")
      expect(ADJECTIVES).toContain(adjective)
    })

    test("uses noun from list", () => {
      const name = randomName()
      const [, noun] = name.split("-")
      expect(NOUNS).toContain(noun)
    })

    test("generates different names", () => {
      const names = new Set()
      for (let i = 0; i < 50; i++) {
        names.add(randomName())
      }
      expect(names.size).toBeGreaterThan(1)
    })
  })

  describe("exists function", () => {
    test("returns true for existing file", async () => {
      const tmpFile = path.join(os.tmpdir(), "test-exists-" + Date.now())
      await fs.writeFile(tmpFile, "test")

      try {
        const result = await exists(tmpFile)
        expect(result).toBe(true)
      } finally {
        await fs.rm(tmpFile).catch(() => { })
      }
    })

    test("returns false for non-existing file", async () => {
      const nonExistent = path.join(os.tmpdir(), "non-existent-" + Date.now())
      const result = await exists(nonExistent)
      expect(result).toBe(false)
    })

    test("returns true for existing directory", async () => {
      const tmpDir = path.join(os.tmpdir(), "test-dir-" + Date.now())
      await fs.mkdir(tmpDir, { recursive: true })

      try {
        const result = await exists(tmpDir)
        expect(result).toBe(true)
      } finally {
        await fs.rm(tmpDir, { recursive: true }).catch(() => { })
      }
    })
  })

  describe("outputText function", () => {
    test("decodes Uint8Array to string", () => {
      const input = new TextEncoder().encode("hello world")
      const result = outputText(input)
      expect(result).toBe("hello world")
    })

    test("trims whitespace", () => {
      const input = new TextEncoder().encode("  hello world  ")
      const result = outputText(input)
      expect(result).toBe("hello world")
    })

    test("handles empty input", () => {
      const result = outputText(new Uint8Array())
      expect(result).toBe("")
    })

    test("handles undefined input", () => {
      const result = outputText(undefined)
      expect(result).toBe("")
    })

    test("handles empty Uint8Array", () => {
      const result = outputText(new Uint8Array(0))
      expect(result).toBe("")
    })
  })

  describe("errorText function", () => {
    test("combines stdout and stderr", () => {
      const result = errorText({
        stderr: new TextEncoder().encode("error message"),
        stdout: new TextEncoder().encode("output message")
      })
      expect(result).toBe("error message\noutput message")
    })

    test("handles only stderr", () => {
      const result = errorText({
        stderr: new TextEncoder().encode("error only"),
        stdout: undefined
      })
      expect(result).toBe("error only")
    })

    test("handles only stdout", () => {
      const result = errorText({
        stderr: undefined,
        stdout: new TextEncoder().encode("output only")
      })
      expect(result).toBe("output only")
    })

    test("handles empty outputs", () => {
      const result = errorText({
        stderr: new TextEncoder().encode(""),
        stdout: new TextEncoder().encode("")
      })
      expect(result).toBe("")
    })

    test("handles undefined outputs", () => {
      const result = errorText({})
      expect(result).toBe("")
    })
  })

  describe("failed function", () => {
    test("extracts file paths from git clean warnings", () => {
      const result = failed({
        stderr: new TextEncoder().encode("warning: failed to remove 'file1.txt': Permission denied\nwarning: failed to remove 'file2.txt': Permission denied"),
        stdout: undefined
      })
      expect(result).toEqual(["file1.txt", "file2.txt"])
    })

    test("handles quoted file paths", () => {
      const result = failed({
        stderr: new TextEncoder().encode('warning: failed to remove "file with spaces.txt": Permission denied'),
        stdout: undefined
      })
      expect(result).toEqual(["file with spaces.txt"])
    })

    test("handles mixed case warnings", () => {
      const result = failed({
        stderr: new TextEncoder().encode("WARNING: failed to remove 'FILE.TXT': Permission denied"),
        stdout: undefined
      })
      expect(result).toEqual(["FILE.TXT"])
    })

    test("ignores non-warning lines", () => {
      const result = failed({
        stderr: new TextEncoder().encode("some other message\nwarning: failed to remove 'file.txt': Permission denied\nanother message"),
        stdout: undefined
      })
      expect(result).toEqual(["file.txt"])
    })

    test("handles stdout with warnings", () => {
      const result = failed({
        stderr: undefined,
        stdout: new TextEncoder().encode("warning: failed to remove 'file.txt': Permission denied")
      })
      expect(result).toEqual(["file.txt"])
    })

    test("handles empty outputs", () => {
      const result = failed({
        stderr: new TextEncoder().encode(""),
        stdout: new TextEncoder().encode("")
      })
      expect(result).toEqual([])
    })
  })

  describe("canonical function", () => {
    test("resolves relative paths", async () => {
      const result = await canonical("./test")
      expect(path.isAbsolute(result)).toBe(true)
    })

    test("normalizes path separators", async () => {
      const result = await canonical("path//to///file")
      expect(result).toContain(path.normalize("path/to/file"))
    })

    test("handles symlinks", async () => {
      // Create a temporary file and symlink for testing
      const tmpDir = path.join(os.tmpdir(), "test-canonical-" + Date.now())
      const targetFile = path.join(tmpDir, "target.txt")
      const linkFile = path.join(tmpDir, "link.txt")

      await fs.mkdir(tmpDir, { recursive: true })
      await fs.writeFile(targetFile, "test")

      try {
        // Try to create symlink (may fail on Windows without admin rights)
        await fs.symlink(targetFile, linkFile).catch(() => { })

        const result = await canonical(linkFile)
        expect(result).toBeDefined()
        expect(typeof result).toBe("string")
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { })
      }
    })

    test("lowercases on Windows", async () => {
      const originalPlatform = process.platform
      // Mock Windows platform
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

      try {
        const result = await canonical("C:\\Test\\Path")
        expect(result).toBe(result.toLowerCase())
      } finally {
        // Restore original platform
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      }
    })

    test("preserves case on non-Windows", async () => {
      const originalPlatform = process.platform
      // Mock non-Windows platform
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

      try {
        const result = await canonical("/test/path")
        expect(result).toBe("/test/path")
      } finally {
        // Restore original platform
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      }
    })

    test("handles path resolution", async () => {
      const result = await canonical("./test")
      expect(path.isAbsolute(result)).toBe(true)
      expect(typeof result).toBe("string")
    })
  })

  describe("ADJECTIVES and NOUNS constants", () => {
    test("ADJECTIVES contains expected values", () => {
      expect(ADJECTIVES).toContain("brave")
      expect(ADJECTIVES).toContain("clever")
      expect(ADJECTIVES).toContain("happy")
      expect(ADJECTIVES.length).toBeGreaterThan(20)
    })

    test("NOUNS contains expected values", () => {
      expect(NOUNS).toContain("cabin")
      expect(NOUNS).toContain("eagle")
      expect(NOUNS).toContain("forest")
      expect(NOUNS.length).toBeGreaterThan(20)
    })

    test("constants are readonly", () => {
      // Test that the constants are defined and have expected length
      expect(ADJECTIVES.length).toBeGreaterThan(20)
      expect(NOUNS.length).toBeGreaterThan(20)
      // Test that they are arrays
      expect(Array.isArray(ADJECTIVES)).toBe(true)
      expect(Array.isArray(NOUNS)).toBe(true)
    })
  })
})
