import { describe, expect, test } from "bun:test"
import { Identifier } from "@opencode-ai/util/identifier"

describe("util.identifier", () => {
  test("ascending generates monotonic IDs for the same timestamp", () => {
    const t = 1_700_000_000_000
    const id1 = Identifier.create(false, t)
    const id2 = Identifier.create(false, t)

    expect(id1).not.toBe(id2)
    expect(id1.length).toBe(26)
    expect(id2.length).toBe(26)
  })

  test("descending generates different IDs than ascending for same timestamp", () => {
    const t = 1_700_000_010_000
    const asc = Identifier.create(false, t)
    const desc = Identifier.create(true, t)

    expect(asc).not.toBe(desc)
    expect(asc.slice(0, 12)).not.toBe(desc.slice(0, 12))
  })

  test("timestamp change resets counter", () => {
    const t1 = 1_700_000_020_000
    const t2 = t1 + 1

    const id1 = Identifier.create(false, t1)
    const id2 = Identifier.create(false, t1)
    const id3 = Identifier.create(false, t2)

    expect(id1).not.toBe(id2)
    expect(id3.slice(0, 12)).not.toBe(id2.slice(0, 12))
  })

  test("ascending() and descending() delegate to create()", () => {
    const idAsc = Identifier.ascending()
    const idDesc = Identifier.descending()

    expect(idAsc.length).toBe(26)
    expect(idDesc.length).toBe(26)
    expect(idAsc).not.toBe(idDesc)
  })
})

