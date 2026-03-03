import { describe, expect, test } from "bun:test"
import { terminalTabLabel } from "../pages/session/terminal-label"
import { terminalWriter } from "./terminal-writer"

// Mock translation function for terminal label tests
const t = (key: string, vars?: Record<string, string | number | boolean>) => {
  if (key === "terminal.title.numbered") return `Terminal ${vars?.number}`
  if (key === "terminal.title") return "Terminal"
  return key
}

describe("terminal functionality", () => {
  describe("terminal tab labels", () => {
    test("returns custom title unchanged", () => {
      const label = terminalTabLabel({ title: "server", titleNumber: 3, t })
      expect(label).toBe("server")
    })

    test("normalizes default numbered title", () => {
      const label = terminalTabLabel({ title: "Terminal 2", titleNumber: 2, t })
      expect(label).toBe("Terminal 2")
    })

    test("falls back to generic title", () => {
      const label = terminalTabLabel({ title: "", titleNumber: 0, t })
      expect(label).toBe("Terminal")
    })

    test("handles null title gracefully", () => {
      const label = terminalTabLabel({ title: null, titleNumber: 0, t })
      expect(label).toBe("Terminal")
    })

    test("handles undefined title gracefully", () => {
      const label = terminalTabLabel({ title: undefined, titleNumber: 0, t })
      expect(label).toBe("Terminal")
    })

    test("uses title number when title is generic", () => {
      const label = terminalTabLabel({ title: "Terminal", titleNumber: 5, t })
      expect(label).toBe("Terminal 5")
    })

    test("preserves non-terminal custom titles", () => {
      const label = terminalTabLabel({ title: "custom-app", titleNumber: 1, t })
      expect(label).toBe("custom-app")
    })
  })

  describe("terminal writer", () => {
    test("buffers and flushes once per schedule", () => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
      )

      writer.push("a")
      writer.push("b")
      writer.push("c")

      expect(calls).toEqual([])
      expect(scheduled).toHaveLength(1)

      scheduled[0]?.()
      expect(calls).toEqual(["abc"])
    })

    test("flush is a no-op when empty", () => {
      const calls: string[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => flush(),
      )
      writer.flush()
      expect(calls).toEqual([])
    })

    test("flush waits for pending write completion", () => {
      const calls: string[] = []
      let done: VoidFunction | undefined
      const writer = terminalWriter(
        (data, finish) => {
          calls.push(data)
          done = finish
        },
        (flush) => flush(),
      )

      writer.push("test")
      writer.flush()
      expect(calls).toEqual(["test"])
      
      // Complete the write
      done?.()
    })

    test("handles multiple flushes correctly", () => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
      )

      writer.push("first")
      writer.flush()
      writer.push("second")
      writer.flush()

      expect(scheduled).toHaveLength(2)
      expect(calls).toEqual(["first", "second"])
    })

    test("handles empty strings", () => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
      )

      writer.push("")
      writer.push("test")

      scheduled[0]?.()
      expect(calls).toEqual(["test"])
    })

    test("handles special characters", () => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
      )

      writer.push("Hello\nWorld\t!")
      scheduled[0]?.()
      expect(calls).toEqual(["Hello\nWorld\t!"])
    })

    test("handles large data chunks", () => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
      )

      const largeData = "x".repeat(10000)
      writer.push(largeData)
      writer.push("small")

      scheduled[0]?.()
      expect(calls).toEqual([largeData + "small"])
    })
  })
})
