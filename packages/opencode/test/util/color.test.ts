import { expect, test, describe } from "bun:test"
import { Color } from "../../src/util/color"

describe("Color", () => {
  test("isValidHex", () => {
    expect(Color.isValidHex("#ffffff")).toBe(true)
    expect(Color.isValidHex("#000000")).toBe(true)
    expect(Color.isValidHex("#123456")).toBe(true)
    expect(Color.isValidHex("#ABCDEF")).toBe(true)
    
    expect(Color.isValidHex("ffffff")).toBe(false)
    expect(Color.isValidHex("#fff")).toBe(false)
    expect(Color.isValidHex("#gggggg")).toBe(false)
    expect(Color.isValidHex(undefined)).toBe(false)
    expect(Color.isValidHex("")).toBe(false)
  })

  test("hexToRgb", () => {
    expect(Color.hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 })
    expect(Color.hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 })
    expect(Color.hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 })
    expect(Color.hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 })
    expect(Color.hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 })
  })

  test("hexToAnsiBold", () => {
    expect(Color.hexToAnsiBold("#ffffff")).toBe("\x1b[38;2;255;255;255m\x1b[1m")
    expect(Color.hexToAnsiBold("#000000")).toBe("\x1b[38;2;0;0;0m\x1b[1m")
    expect(Color.hexToAnsiBold("invalid")).toBeUndefined()
  })
})
