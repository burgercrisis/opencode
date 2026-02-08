import { describe, expect, test } from "bun:test"

function cleanText(text: string): string {
  return text
    .replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>\s*/g, "")
    .split("\n")
    .map((line: string) => line.trim())
    .find((line: string) => line.length > 0) || ""
}

describe("thinking tag cleaning", () => {
  test("removes <think> tags", () => {
    const input = "<think>some thought</think>Actual Title"
    expect(cleanText(input)).toBe("Actual Title")
  })

  test("removes <thinking> tags", () => {
    const input = "<thinking>some thinking</thinking>Actual Title"
    expect(cleanText(input)).toBe("Actual Title")
  })

  test("removes multiple tags", () => {
    const input = "<think>thought 1</think><thinking>thought 2</thinking>Actual Title"
    expect(cleanText(input)).toBe("Actual Title")
  })

  test("handles multi-line content inside tags", () => {
    const input = "<think>\nmulti\nline\nthought\n</think>Actual Title"
    expect(cleanText(input)).toBe("Actual Title")
  })

  test("handles tags with whitespace around them", () => {
    const input = "  <think>thought</think>  \n  Actual Title  "
    expect(cleanText(input)).toBe("Actual Title")
  })
})
