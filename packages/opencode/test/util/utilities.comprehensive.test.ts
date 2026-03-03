import { describe, expect, test } from "bun:test"

// Thinking tag utility functions
function cleanText(text: string): string {
  return text
    .replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>\s*/g, "")
    .split("\n")
    .map((line: string) => line.trim())
    .find((line: string) => line.length > 0) || ""
}

// Titlebar history utility functions (simplified versions for testing)
interface TitlebarHistory {
  stack: string[]
  index: number
  action?: string
}

function history(): TitlebarHistory {
  return { stack: [], index: 0, action: undefined }
}

function applyPath(state: TitlebarHistory, path: string, max: number): TitlebarHistory {
  const newStack = [...state.stack]
  
  // Remove any entries after current index
  if (state.index < newStack.length - 1) {
    newStack.splice(state.index + 1)
  }
  
  // Add new path if it's not a duplicate
  if (newStack[newStack.length - 1] !== path) {
    newStack.push(path)
  }
  
  // Trim to max size
  if (newStack.length > max) {
    newStack.splice(0, newStack.length - max)
  }
  
  return {
    stack: newStack,
    index: newStack.length - 1,
    action: "navigate"
  }
}

function backPath(state: TitlebarHistory): { to: string; state: TitlebarHistory } | null {
  if (state.index <= 0) return null
  
  const newIndex = state.index - 1
  return {
    to: state.stack[newIndex],
    state: { ...state, index: newIndex, action: "back" }
  }
}

function forwardPath(state: TitlebarHistory): { to: string; state: TitlebarHistory } | null {
  if (state.index >= state.stack.length - 1) return null
  
  const newIndex = state.index + 1
  return {
    to: state.stack[newIndex],
    state: { ...state, index: newIndex, action: "forward" }
  }
}

describe("utility functions", () => {
  describe("thinking tag cleaning", () => {
    test("removes </think> tags", () => {
      const input = "</think>some thought</think>Actual Title"
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("removes <thinking> tags", () => {
      const input = "<thinking>some thinking</thinking>Actual Title"
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("removes multiple tags", () => {
      const input = "</think>thought 1</think><thinking>thought 2</thinking>Actual Title"
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("handles multi-line content inside tags", () => {
      const input = "</think>\nmulti\nline\nthought\n</think>Actual Title"
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("handles tags with whitespace around them", () => {
      const input = "  </think>thought</think>  \n  Actual Title  "
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("handles empty input", () => {
      expect(cleanText("")).toBe("")
    })

    test("handles input without thinking tags", () => {
      const input = "Just a normal title"
      expect(cleanText(input)).toBe("Just a normal title")
    })

    test("handles nested thinking tags", () => {
      const input = "<thinking>outer <think>inner</think> content</thinking>Actual Title"
      expect(cleanText(input)).toBe("Actual Title")
    })

    test("handles malformed tags", () => {
      const input = "<think>unclosed tagActual Title"
      expect(cleanText(input)).toBe("<think>unclosed tagActual Title")
    })

    test("preserves content after tags", () => {
      const input = "</think>thought<think>\n\nSecond line\nThird line"
      expect(cleanText(input)).toBe("Second line")
    })
  })

  describe("titlebar history", () => {
    test("append and trim keeps max bounded", () => {
      let state = history()
      state = applyPath(state, "/", 3)
      state = applyPath(state, "/a", 3)
      state = applyPath(state, "/b", 3)
      state = applyPath(state, "/c", 3)

      expect(state.stack).toEqual(["/a", "/b", "/c"])
      expect(state.stack.length).toBe(3)
      expect(state.index).toBe(2)
    })

    test("back and forward indexes stay correct after trimming", () => {
      let state = history()
      state = applyPath(state, "/", 3)
      state = applyPath(state, "/a", 3)
      state = applyPath(state, "/b", 3)
      state = applyPath(state, "/c", 3)

      expect(state.stack).toEqual(["/a", "/b", "/c"])
      expect(state.index).toBe(2)

      const back = backPath(state)
      expect(back?.to).toBe("/b")
      expect(back?.state.index).toBe(1)

      const afterBack = applyPath(back!.state, back!.to, 3)
      expect(afterBack.stack).toEqual(["/a", "/b", "/c"])
      expect(afterBack.index).toBe(1)

      const forward = forwardPath(afterBack)
      expect(forward?.to).toBe("/c")
      expect(forward?.state.index).toBe(2)

      const afterForward = applyPath(forward!.state, forward!.to, 3)
      expect(afterForward.stack).toEqual(["/a", "/b", "/c"])
      expect(afterForward.index).toBe(2)
    })

    test("action-driven navigation does not push duplicate history entries", () => {
      const state: TitlebarHistory = {
        stack: ["/", "/a", "/b"],
        index: 2,
        action: "navigate"
      }

      const result = applyPath(state, "/b", 3)
      expect(result.stack).toEqual(["/", "/a", "/b"])
      expect(result.index).toBe(2)
    })

    test("back returns null when at beginning", () => {
      const state = history()
      const result = backPath(state)
      expect(result).toBeNull()
    })

    test("forward returns null when at end", () => {
      let state = history()
      state = applyPath(state, "/a", 3)
      
      const result = forwardPath(state)
      expect(result).toBeNull()
    })

    test("handles single entry history", () => {
      let state = history()
      state = applyPath(state, "/single", 3)
      
      expect(backPath(state)).toBeNull()
      expect(forwardPath(state)).toBeNull()
      expect(state.stack).toEqual(["/single"])
      expect(state.index).toBe(0)
    })

    test("handles max size of 1", () => {
      let state = history()
      state = applyPath(state, "/first", 1)
      state = applyPath(state, "/second", 1)
      state = applyPath(state, "/third", 1)
      
      expect(state.stack).toEqual(["/third"])
      expect(state.index).toBe(0)
    })

    test("preserves action type", () => {
      let state = history()
      state = applyPath(state, "/a", 3)
      
      const back = backPath(state)
      expect(back?.state.action).toBe("back")
      
      const forward = forwardPath(back!.state)
      expect(forward?.state.action).toBe("forward")
    })
  })
})
