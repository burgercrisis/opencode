import { describe, expect, test } from "bun:test"
import { getDirectory, getFileExtension, getFilename, getFilenameTruncated, normalize, truncateMiddle } from "@opencode-ai/util/path"

describe("util.path.normalize", () => {
  test("returns empty string for undefined or empty input", () => {
    expect(normalize(undefined)).toBe("")
    expect(normalize("")).toBe("")
  })

  test("normalizes backslashes and collapses duplicates", () => {
    expect(normalize("C:\\foo\\\\bar\\\\baz")).toBe("C:/foo/bar/baz")
    expect(normalize("foo//bar///baz")).toBe("foo/bar/baz")
    expect(normalize("///foo/bar")).toBe("/foo/bar")
    expect(normalize("//foo//bar")).toBe("//foo/bar")
    expect(normalize("//foo///bar")).toBe("//foo/bar")
  })

  test("preserves UNC paths and device prefixes correctly", () => {
    expect(normalize("//?/UNC/server/share/folder")).toBe("//server/share/folder")
    expect(normalize("//?/C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//?/Volume{guid}/path")).toBe("Volume{guid}/path")
    expect(normalize("//./pipe/mynamedpipe")).toBe("//./pipe/mynamedpipe")
    expect(normalize("//./C:/path/to/file")).toBe("C:/path/to/file")
    expect(normalize("//./not-a-drive/path")).toBe("//./not-a-drive/path")
  })

  test("handles msys and cygdrive drive prefixes and wildcard suffix", () => {
    expect(normalize("/c/foo/bar")).toBe("C:/foo/bar")
    expect(normalize("/cygdrive/d/foo/*")).toBe("D:/foo/*")
    expect(normalize("/e/path/*")).toBe("E:/path/*")
  })
})

describe("util.path filename helpers", () => {
  test("getFilename returns last segment and handles trailing slashes", () => {
    expect(getFilename("/foo/bar/baz.txt")).toBe("baz.txt")
    expect(getFilename("/foo/bar/baz.txt/")).toBe("baz.txt")
    expect(getFilename("//server/share/file.txt")).toBe("file.txt")
    expect(getFilename(undefined)).toBe("")
    expect(getFilename("")).toBe("")
  })

  test("getDirectory returns parent directory with trailing slash", () => {
    expect(getDirectory("/foo/bar/baz.txt")).toBe("/foo/bar/")
    expect(getDirectory("C:\\foo\\bar\\baz.txt")).toBe("C:/foo/bar/")
    expect(getDirectory("file.txt")).toBe("/")
    expect(getDirectory(undefined)).toBe("")
  })

  test("getFileExtension returns extension or empty string", () => {
    expect(getFileExtension(undefined)).toBe("")
    expect(getFileExtension("filename")).toBe("filename")
    expect(getFileExtension("archive.tar.gz")).toBe("gz")
    expect(getFileExtension(".hidden")).toBe("hidden")
    expect(getFileExtension("no-extension.")).toBe("")
  })
})

describe("util.path truncation helpers", () => {
  test("truncateMiddle returns original when shorter than limit", () => {
    expect(truncateMiddle("short", 10)).toBe("short")
    expect(truncateMiddle("exactly10!", 10)).toBe("exactly10!")
  })

  test("truncateMiddle truncates with ellipsis in the middle", () => {
    expect(truncateMiddle("1234567890", 5)).toBe("12…90")
    expect(truncateMiddle("1234567890", 6)).toBe("123…90")
  })

  test("getFilenameTruncated returns full filename when within limit", () => {
    expect(getFilenameTruncated("/foo/bar.txt", 20)).toBe("bar.txt")
    expect(getFilenameTruncated("short.js", 10)).toBe("short.js")
  })

  test("getFilenameTruncated truncates base name but preserves extension", () => {
    expect(getFilenameTruncated("averylongfilename.txt", 12)).toBe("aver…ame.txt")
    expect(getFilenameTruncated("another-long-one.json", 15)).toBe("anoth…-one.json")
  })

  test("getFilenameTruncated handles no extension or dot at start", () => {
    expect(getFilenameTruncated("longfilenamewitnoextension", 10)).toBe("longf…sion")
    expect(getFilenameTruncated(".hiddenlongfile", 10)).toBe(".hidd…file")
  })

  test("getFilenameTruncated falls back to truncating whole name for very small limits", () => {
    expect(getFilenameTruncated("longname.txt", 3)).toBe("l…t")
    expect(getFilenameTruncated("verylong.extension", 5)).toBe("ve…on")
  })
})

