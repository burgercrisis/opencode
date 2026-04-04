import { describe, expect, test } from "bun:test"
import { base64Decode, base64Encode, checksum, hash } from "@opencode-ai/util/encode"

describe("util.encode base64", () => {
  test("base64Encode produces URL-safe string and roundtrips with base64Decode", () => {
    const original = "hello+/世界"
    const encoded = base64Encode(original)

    // URL-safe: no '+' '/' or '=' padding
    expect(encoded).not.toMatch(/[+/=]/)

    const decoded = base64Decode(encoded)
    expect(decoded).toBe(original)
  })
})

describe("util.encode hash", () => {
  test("hash is deterministic and sensitive to content", async () => {
    const a1 = await hash("content-a")
    const a2 = await hash("content-a")
    const b = await hash("content-b")

    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).toMatch(/^[0-9a-f]+$/)
  })
})

describe("util.encode checksum", () => {
  test("checksum returns undefined for empty content", () => {
    expect(checksum("")).toBeUndefined()
  })

  test("checksum returns stable, non-empty base36 string for non-empty content", () => {
    const c1 = checksum("abc123")!
    const c2 = checksum("abc123")!
    const c3 = checksum("different")!

    expect(c1).toBe(c2)
    expect(c1).not.toBe(c3)
    expect(c1).toMatch(/^[0-9a-z]+$/)
  })
})

