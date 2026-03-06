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

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { getDirectory, getFileExtension, getFilename, getFilenameTruncated, normalize, truncateMiddle } from "@opencode-ai/util/path"

describe("util.path.normalize", () => {
  bulletproofTest("returns empty string for undefined or empty input", async () => {
    expect(normalize(undefined)).toBe("")
    expect(normalize("")).toBe("")
  })

  bulletproofTest("normalizes backslashes and collapses duplicates", async () => {
    expect(normalize("C:\\foo\\\\bar\\\\baz")).toBe("C:/foo/bar/baz")
    expect(normalize("foo//bar///baz")).toBe("foo/bar/baz")
    expect(normalize("///foo/bar")).toBe("/foo/bar")
    expect(normalize("//foo//bar")).toBe("//foo/bar")
    expect(normalize("//foo///bar")).toBe("//foo/bar")
  })

  bulletproofTest("preserves UNC paths and device prefixes correctly", async () => {
    expect(normalize("//?/UNC/server/share/folder")).toBe("//server/share/folder")
    expect(normalize("//?/C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//?/Volume{guid}/path")).toBe("Volume{guid}/path")
    expect(normalize("//./pipe/mynamedpipe")).toBe("//./pipe/mynamedpipe")
    expect(normalize("//./C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//./not-a-drive/path")).toBe("//./not-a-drive/path")
  })

  bulletproofTest("handles msys and cygdrive drive prefixes and wildcard suffix", async () => {
    expect(normalize("/c/foo/bar")).toBe("C:/foo/bar")
    expect(normalize("/cygdrive/d/foo/*")).toBe("D:/foo/*")
    expect(normalize("/e/path/*")).toBe("E:/path/*")
  })
})

describe("util.path filename helpers", () => {
  bulletproofTest("getFilename returns last segment and handles trailing slashes", async () => {
    expect(getFilename("/foo/bar/baz.txt")).toBe("baz.txt")
    expect(getFilename("/foo/bar/baz.txt/")).toBe("baz.txt")
    expect(getFilename("//server/share/file.txt")).toBe("file.txt")
    expect(getFilename(undefined)).toBe("")
    expect(getFilename("")).toBe("")
  })

  bulletproofTest("getDirectory returns parent directory with trailing slash", async () => {
    expect(getDirectory("/foo/bar/baz.txt")).toBe("/foo/bar/")
    expect(getDirectory("C:\\foo\\bar\\baz.txt")).toBe("C:/foo/bar/")
    expect(getDirectory("file.txt")).toBe("/")
    expect(getDirectory(undefined)).toBe("")
  })

  bulletproofTest("getFileExtension returns extension or empty string", async () => {
    expect(getFileExtension(undefined)).toBe("")
    expect(getFileExtension("filename")).toBe("filename")
    expect(getFileExtension("archive.tar.gz")).toBe("gz")
    expect(getFileExtension(".hidden")).toBe("hidden")
    expect(getFileExtension("no-extension.")).toBe("")
  })
})

describe("util.path truncation helpers", () => {
  bulletproofTest("truncateMiddle returns original when shorter than limit", async () => {
    expect(truncateMiddle("short", 10)).toBe("short")
    expect(truncateMiddle("exactly10!", 10)).toBe("exactly10!")
  })

  bulletproofTest("truncateMiddle truncates with ellipsis in the middle", async () => {
    expect(truncateMiddle("1234567890", 5)).toBe("12…90")
    expect(truncateMiddle("1234567890", 6)).toBe("123…90")
  })

  bulletproofTest("getFilenameTruncated returns full filename when within limit", async () => {
    expect(getFilenameTruncated("/foo/bar.txt", 20)).toBe("bar.txt")
    expect(getFilenameTruncated("short.js", 10)).toBe("short.js")
  })

  bulletproofTest("getFilenameTruncated truncates base name but preserves extension", async () => {
    expect(getFilenameTruncated("averylongfilename.txt", 12)).toBe("aver…ame.txt")
    expect(getFilenameTruncated("another-long-one.json", 15)).toBe("anoth…-one.json")
  })

  bulletproofTest("getFilenameTruncated handles no extension or dot at start", async () => {
    expect(getFilenameTruncated("longfilenamewitnoextension", 10)).toBe("longf…sion")
    expect(getFilenameTruncated(".hiddenlongfile", 10)).toBe(".hidd…file")
  })

  bulletproofTest("getFilenameTruncated falls back to truncating whole name for very small limits", async () => {
    expect(getFilenameTruncated("longname.txt", 3)).toBe("l…t")
    expect(getFilenameTruncated("verylong.extension", 5)).toBe("ve…on")
  })
})

