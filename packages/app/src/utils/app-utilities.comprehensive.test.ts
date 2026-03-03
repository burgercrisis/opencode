import { describe, expect, test } from "bun:test"
import {
  disposeIfDisposable,
  getHoveredLinkText,
  getSpeechRecognitionCtor,
  hasSetOption,
  isDisposable,
  setOptionIfSupported,
} from "./runtime-adapters"
import { createScopedCache } from "./scoped-cache"

describe("app utilities", () => {
  describe("runtime adapters", () => {
    test("detects and disposes disposable values", () => {
      let count = 0
      const value = {
        dispose: () => {
          count += 1
        },
      }
      expect(isDisposable(value)).toBe(true)
      disposeIfDisposable(value)
      expect(count).toBe(1)
    })

    test("ignores non-disposable values", () => {
      expect(isDisposable({ dispose: "nope" })).toBe(false)
      expect(() => disposeIfDisposable({ dispose: "nope" })).not.toThrow()
    })

    test("sets options only when setter exists", () => {
      const calls: Array<[string, unknown]> = []
      const value = {
        setOption: (key: string, next: unknown) => {
          calls.push([key, next])
        },
      }
      expect(hasSetOption(value)).toBe(true)
      setOptionIfSupported(value, "fontFamily", "Berkeley Mono")
      expect(calls).toEqual([["fontFamily", "Berkeley Mono"]])
      expect(() => setOptionIfSupported({}, "fontFamily", "Berkeley Mono")).not.toThrow()
    })

    test("reads hovered link text safely", () => {
      expect(getHoveredLinkText({ currentHoveredLink: { text: "https://example.com" } })).toBe("https://example.com")
      expect(getHoveredLinkText({ currentHoveredLink: { text: 1 } })).toBeUndefined()
      expect(getHoveredLinkText(null)).toBeUndefined()
    })

    test("resolves speech recognition constructor with webkit precedence", () => {
      class SpeechCtor {}
      class WebkitCtor {}
      
      // Mock global objects
      const originalSpeech = global.SpeechRecognition
      const originalWebkit = global.webkitSpeechRecognition
      
      global.SpeechRecognition = SpeechCtor as any
      global.webkitSpeechRecognition = WebkitCtor as any
      
      const ctor = getSpeechRecognitionCtor()
      expect(ctor).toBe(WebkitCtor)
      
      // Restore
      global.SpeechRecognition = originalSpeech
      global.webkitSpeechRecognition = originalWebkit
    })

    test("handles missing speech recognition constructors", () => {
      const originalSpeech = global.SpeechRecognition
      const originalWebkit = global.webkitSpeechRecognition
      
      delete global.SpeechRecognition
      delete global.webkitSpeechRecognition
      
      expect(getSpeechRecognitionCtor()).toBeUndefined()
      
      // Restore
      global.SpeechRecognition = originalSpeech
      global.webkitSpeechRecognition = originalWebkit
    })

    test("handles null/undefined values safely", () => {
      expect(isDisposable(null)).toBe(false)
      expect(isDisposable(undefined)).toBe(false)
      expect(() => disposeIfDisposable(null)).not.toThrow()
      expect(() => disposeIfDisposable(undefined)).not.toThrow()
      expect(hasSetOption(null)).toBe(false)
      expect(hasSetOption(undefined)).toBe(false)
      expect(() => setOptionIfSupported(null, "key", "value")).not.toThrow()
      expect(() => setOptionIfSupported(undefined, "key", "value")).not.toThrow()
    })
  })

  describe("scoped cache", () => {
    test("evicts least-recently-used entry when max is reached", () => {
      const disposed: string[] = []
      const cache = createScopedCache((key) => ({ key }), {
        maxEntries: 2,
        dispose: (value) => disposed.push(value.key),
      })

      const a = cache.get("a")
      const b = cache.get("b")
      expect(a.key).toBe("a")
      expect(b.key).toBe("b")

      cache.get("a")
      const c = cache.get("c")

      expect(c.key).toBe("c")
      expect(cache.peek("a")?.key).toBe("a")
      expect(cache.peek("b")).toBeUndefined()
      expect(cache.peek("c")?.key).toBe("c")
      expect(disposed).toEqual(["b"])
    })

    test("disposes entries on delete and clear", () => {
      const disposed: string[] = []
      const cache = createScopedCache((key) => ({ key }), {
        dispose: (value) => disposed.push(value.key),
      })

      cache.get("a")
      cache.get("b")

      const removed = cache.delete("a")
      expect(removed?.key).toBe("a")
      expect(cache.peek("a")).toBeUndefined()

      cache.clear()
      expect(cache.peek("b")).toBeUndefined()
      expect(disposed).toEqual(["a", "b"])
    })

    test("expires stale entries with ttl and recreates on get", () => {
      let clock = 0
      let count = 0
      const disposed: string[] = []
      const cache = createScopedCache((key) => ({ key, count: ++count }), {
        ttlMs: 10,
        dispose: (value) => disposed.push(value.key),
        now: () => clock,
      })

      const a = cache.get("a")
      expect(a.count).toBe(1)

      clock = 5
      const a2 = cache.get("a")
      expect(a2.count).toBe(1) // Still cached
      expect(a2).toBe(a)

      clock = 15
      const a3 = cache.get("a")
      expect(a3.count).toBe(2) // Recreated
      expect(a3).not.toBe(a)
      expect(disposed).toEqual(["a"])
    })

    test("handles empty cache operations", () => {
      const cache = createScopedCache((key) => ({ key }))
      
      expect(cache.peek("nonexistent")).toBeUndefined()
      expect(cache.delete("nonexistent")).toBeUndefined()
      expect(() => cache.clear()).not.toThrow()
    })

    test("respects max entries limit", () => {
      const disposed: string[] = []
      const cache = createScopedCache((key) => ({ key }), {
        maxEntries: 1,
        dispose: (value) => disposed.push(value.key),
      })

      cache.get("a")
      cache.get("b")
      cache.get("c")

      expect(cache.peek("a")).toBeUndefined()
      expect(cache.peek("b")).toBeUndefined()
      expect(cache.peek("c")?.key).toBe("c")
      expect(disposed).toEqual(["a", "b"])
    })

    test("handles ttl of zero (immediate expiration)", () => {
      const disposed: string[] = []
      const cache = createScopedCache((key) => ({ key }), {
        ttlMs: 0,
        dispose: (value) => disposed.push(value.key),
      })

      const a = cache.get("a")
      const a2 = cache.get("a")

      expect(a2.count).toBe(2) // Recreated immediately
      expect(a2).not.toBe(a)
      expect(disposed).toEqual(["a"])
    })

    test("provides cache statistics", () => {
      const cache = createScopedCache((key) => ({ key }))
      
      cache.get("a")
      cache.get("b")
      cache.get("a") // Hit
      
      const stats = cache.stats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(2)
      expect(stats.size).toBe(2)
    })

    test("handles complex values", () => {
      const disposed: Array<{ id: string; data: string[] }> = []
      const cache = createScopedCache((key) => ({ id: key, data: [key] }), {
        maxEntries: 2,
        dispose: (value) => disposed.push(value),
      })

      const a = cache.get("a")
      expect(a.data).toEqual(["a"])
      
      cache.get("b")
      cache.get("c") // Should evict "b"

      expect(cache.peek("a")?.id).toBe("a")
      expect(cache.peek("b")).toBeUndefined()
      expect(cache.peek("c")?.id).toBe("c")
      expect(disposed.length).toBe(1)
      expect(disposed[0].id).toBe("b")
    })
  })
})
