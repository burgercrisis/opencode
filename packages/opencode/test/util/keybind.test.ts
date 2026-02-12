import { expect, test, describe } from "bun:test"
import { Keybind } from "../../src/util/keybind"
import type { ParsedKey } from "@opentui/core"

describe("Keybind", () => {
  test("match", () => {
    const a: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false }
    const b: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false }
    const c: Keybind.Info = { name: "b", ctrl: true, meta: false, shift: false, leader: false }
    
    expect(Keybind.match(a, b)).toBe(true)
    expect(Keybind.match(a, c)).toBe(false)
    expect(Keybind.match(undefined, b)).toBe(false)
    
    // Test normalization of super
    const d: Keybind.Info = { name: "a", ctrl: true, meta: false, shift: false, leader: false, super: false }
    expect(Keybind.match(a, d)).toBe(true)
  })

  test("fromParsedKey", () => {
    const parsed: ParsedKey = {
      name: "x",
      ctrl: true,
      meta: false,
      shift: true,
      sequence: "ctrl+shift+x"
    }
    const info = Keybind.fromParsedKey(parsed, true)
    expect(info).toEqual({
      name: "x",
      ctrl: true,
      meta: false,
      shift: true,
      super: false,
      leader: true
    })
  })

  test("toString", () => {
    expect(Keybind.toString(undefined)).toBe("")
    
    const info: Keybind.Info = {
      name: "s",
      ctrl: true,
      meta: true,
      shift: true,
      super: true,
      leader: true
    }
    expect(Keybind.toString(info)).toBe("<leader> ctrl+alt+super+shift+s")
    
    expect(Keybind.toString({ name: "delete", ctrl: false, meta: false, shift: false, leader: false })).toBe("del")
    expect(Keybind.toString({ name: "", ctrl: false, meta: false, shift: false, leader: true })).toBe("<leader>")
  })

  test("parse", () => {
    expect(Keybind.parse("none")).toEqual([])
    
    const results = Keybind.parse("ctrl+s,alt+shift+x,<leader> a")
    expect(results).toHaveLength(3)
    
    expect(results[0]).toMatchObject({ name: "s", ctrl: true })
    expect(results[1]).toMatchObject({ name: "x", meta: true, shift: true })
    expect(results[2]).toMatchObject({ name: "a", leader: true })
    
    // Test various aliases
    const aliases = Keybind.parse("option+o,meta+m,super+p,esc")
    expect(aliases[0].meta).toBe(true)
    expect(aliases[1].meta).toBe(true)
    expect(aliases[2].super).toBe(true)
    expect(aliases[3].name).toBe("escape")
  })
})
