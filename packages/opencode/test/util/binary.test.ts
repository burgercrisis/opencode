import { describe, expect, test } from "bun:test"
import { Binary } from "@opencode-ai/util/binary"

type Item = { id: string; value: number }

const compare = (item: Item) => item.id

describe("util.binary.search", () => {
  test("returns not found with insertion index for empty array", () => {
    const result = Binary.search<Item>([], "a", compare)
    expect(result).toEqual({ found: false, index: 0 })
  })

  test("finds existing element in sorted array", () => {
    const items: Item[] = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ]

    const result = Binary.search(items, "b", compare)
    expect(result.found).toBe(true)
    expect(result.index).toBe(1)
  })

  test("returns insertion index when element not found", () => {
    const items: Item[] = [
      { id: "a", value: 1 },
      { id: "c", value: 3 },
    ]

    const before = Binary.search(items, "0", compare)
    const between = Binary.search(items, "b", compare)
    const after = Binary.search(items, "z", compare)

    expect(before).toEqual({ found: false, index: 0 })
    expect(between).toEqual({ found: false, index: 1 })
    expect(after).toEqual({ found: false, index: 2 })
  })
})

describe("util.binary.insert", () => {
  test("inserts into empty array", () => {
    const items: Item[] = []
    const result = Binary.insert(items, { id: "b", value: 2 }, compare)
    expect(result).toEqual([{ id: "b", value: 2 }])
  })

  test("inserts while keeping array sorted", () => {
    const items: Item[] = [
      { id: "a", value: 1 },
      { id: "c", value: 3 },
    ]

    Binary.insert(items, { id: "b", value: 2 }, compare)
    Binary.insert(items, { id: "d", value: 4 }, compare)
    Binary.insert(items, { id: "0", value: 0 }, compare)

    expect(items.map(compare)).toEqual(["0", "a", "b", "c", "d"])
  })
})

