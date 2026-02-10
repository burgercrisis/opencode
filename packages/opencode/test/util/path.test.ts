import { describe, expect, test } from "bun:test"
import { getDirectory, getFileExtension, getFilename, getFilenameTruncated, normalize, truncateMiddle } from "@opencode-ai/util/path"

describe("util.path.normalize", () => {
  test("returns empty string for undefined or empty input", () => {
    expect(normalize(undefined)).toBe("")
    expect(normalize("")).toBe("")
  })

  test("normalizes backslashes and collapses duplicates", () => {
    expect(normalize("C:\\foo\\\\bar\\\\baz")).toBe("C:/foo/bar/baz")
  })

  test("preserves UNC paths and device prefixes correctly", () => {
    expect(normalize("//?/UNC/server/share/folder")).toBe("//server/share/folder")
    expect(normalize("//?/C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//./pipe/mynamedpipe")).toBe("//./pipe/mynamedpipe")
    expect(normalize("//./C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//./not-a-drive/path")).toBe("//./not-a-drive/path")
  })

  test("handles msys and cygdrive drive prefixes and wildcard suffix", () => {
    expect(normalize("/c/foo/bar")).toBe("C:/foo/bar")
    expect(normalize("/cygdrive/d/foo/*")).toBe("D:/foo/*")
  })
})

describe("util.path filename helpers", () => {
  test("getFilename returns last segment and handles trailing slashes", () => {
    expect(getFilename("/foo/bar/baz.txt")).toBe("baz.txt")
    expect(getFilename("/foo/bar/baz.txt/")).toBe("baz.txt")
    expect(getFilename(undefined)).toBe("")
  })

  test("getDirectory returns parent directory with trailing slash", () => {
    expect(getDirectory("/foo/bar/baz.txt")).toBe("/foo/bar/")
    expect(getDirectory("C:\\foo\\bar\\baz.txt")).toBe("C:/foo/bar/")
    expect(getDirectory(undefined)).toBe("")
  })

  test("getFileExtension returns empty string when no path or no dot", () => {
    expect(getFileExtension(undefined)).toBe("")
    expect(getFileExtension("filename")).toBe("filename")
    expect(getFileExtension("archive.tar.gz")).toBe("gz")
  })
})

describe("util.path truncation helpers", () => {
  test("truncateMiddle returns original when shorter than limit", () => {
    expect(truncateMiddle("short", 10)).toBe("short")
  })

  test("truncateMiddle truncates with ellipsis in the middle", () => {
    const result = truncateMiddle("averylongfilename", 10)
    expect(result.length).toBeLessThanOrEqual(10)
    expect(result).toContain("…")
  })

  test("getFilenameTruncated returns full filename when within limit", () => {
    expect(getFilenameTruncated("/foo/bar.txt", 20)).toBe("bar.txt")
  })

  test("getFilenameTruncated truncates base name but preserves extension", () => {
    const result = getFilenameTruncated("/foo/averylongfilename.txt", 12)
    expect(result.endsWith(".txt")).toBe(true)
    expect(result.length).toBeLessThanOrEqual(12)
  })

  test("getFilenameTruncated falls back to truncating whole name for very small limits", () => {
    const result = getFilenameTruncated("/foo/longname.txt", 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

