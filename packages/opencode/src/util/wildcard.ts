import { sortBy, pipe } from "remeda"

export namespace Wildcard {
  export function match(str: string, pattern: string) {
    const s = str.replace(/\\/g, "/")
    const p = pattern.replace(/\\/g, "/")

    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape special regex chars
      .replace(/\*/g, ".*") // * becomes .*
      .replace(/\?/g, ".") // ? becomes .
      .replace(/ \.\*$/, "( .*)?") // If pattern ends with " *" (space + wildcard), make it optional

    return new RegExp("^" + escaped + "$", "s").test(s)
  }

  export function all(input: string, patterns: Record<string, any>) {
    const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
    return sorted.reduce((acc, [pattern, value]) => match(input, pattern) ? value : acc, undefined)
  }

  export function allStructured(input: { head: string; tail: string[] }, patterns: Record<string, any>) {
    const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
    return sorted.reduce((acc, [pattern, value]) => {
      const parts = pattern.split(/\s+/)
      if (!match(input.head, parts[0])) return acc
      if (parts.length === 1 || matchSequence(input.tail, parts.slice(1))) return value
      return acc
    }, undefined)
  }

  function matchSequence(items: string[], patterns: string[]): boolean {
    if (patterns.length === 0) return true
    const [pattern, ...rest] = patterns
    if (pattern === "*") return matchSequence(items, rest)
    return items.some((item, i) => match(item, pattern) && matchSequence(items.slice(i + 1), rest))
  }
}
