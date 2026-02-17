import { describe, it, expect, vi, beforeEach } from "bun:test"
import { replace } from "../edit"

// Mock the replace function to control success/failure
const mockReplace = vi.fn(replace)
vi.mock("../edit", () => ({
  replace: mockReplace,
  EditTool: {
    init: vi.fn(() => Promise.resolve({}))
  }
}))

describe("MultiEdit Error Handling Logic", () => {
  beforeEach(() => {
    mockReplace.mockClear()
  })

  it("should track successful and failed edits correctly", async () => {
    // Mock replace to succeed for first call, fail for second, succeed for third
    mockReplace
      .mockImplementationOnce((content, oldStr, newStr) => {
        expect(oldStr).toBe("Hello world")
        expect(newStr).toBe("Hello universe")
        return content.replace(oldStr, newStr)
      })
      .mockImplementationOnce(() => {
        throw new Error("String not found")
      })
      .mockImplementationOnce((content, oldStr, newStr) => {
        expect(oldStr).toBe("Another line")
        expect(newStr).toBe("Modified line")
        return content.replace(oldStr, newStr)
      })

    // Simulate the edit logic from multiedit
    const edits = [
      { oldString: "Hello world", newString: "Hello universe" },
      { oldString: "Non-existent text", newString: "This will fail" },
      { oldString: "Another line", newString: "Modified line" }
    ]

    let contentNew = "Hello world\nThis is a test\nAnother line\nFinal line"
    let appliedEdits = 0
    let failedEdits = 0
    const editResults: Array<{ index: number; success: boolean; applied: boolean; error?: string }> = []

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]

      if (edit.oldString === edit.newString) {
        editResults.push({
          index: i,
          success: true,
          applied: false
        })
        continue
      }

      try {
        contentNew = mockReplace(contentNew, edit.oldString, edit.newString, false, {
          occurrence: undefined,
          autoContext: true,
          confidence: 0.8
        })
        appliedEdits++
        editResults.push({
          index: i,
          success: true,
          applied: true
        })
      } catch (error) {
        failedEdits++
        editResults.push({
          index: i,
          success: false,
          applied: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // Verify results
    expect(appliedEdits).toBe(2)
    expect(failedEdits).toBe(1)
    expect(editResults).toHaveLength(3)

    // First edit should succeed
    expect(editResults[0]).toEqual({
      index: 0,
      success: true,
      applied: true
    })

    // Second edit should fail
    expect(editResults[1]).toEqual({
      index: 1,
      success: false,
      applied: false,
      error: "String not found"
    })

    // Third edit should succeed
    expect(editResults[2]).toEqual({
      index: 2,
      success: true,
      applied: true
    })
  })

  it("should handle no-op edits correctly", async () => {
    const edits = [
      { oldString: "Hello world", newString: "Hello universe" },
      { oldString: "Hello universe", newString: "Hello universe" } // No-op
    ]

    let contentNew = "Hello world\nThis is a test"
    let appliedEdits = 0
    let failedEdits = 0
    const editResults: Array<{ index: number; success: boolean; applied: boolean }> = []

    // Mock replace to succeed for the first call
    mockReplace.mockImplementation((content, oldStr, newStr) => {
      return content.replace(oldStr, newStr)
    })

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]

      if (edit.oldString === edit.newString) {
        editResults.push({
          index: i,
          success: true,
          applied: false // No-op, not actually applied
        })
        continue
      }

      try {
        contentNew = mockReplace(contentNew, edit.oldString, edit.newString, false, {
          occurrence: undefined,
          autoContext: true,
          confidence: 0.8
        })
        appliedEdits++
        editResults.push({
          index: i,
          success: true,
          applied: true
        })
      } catch (error) {
        failedEdits++
        editResults.push({
          index: i,
          success: false,
          applied: false
        })
      }
    }

    // Verify results
    expect(appliedEdits).toBe(1)
    expect(failedEdits).toBe(0)
    expect(editResults).toHaveLength(2)

    // First edit should succeed
    expect(editResults[0]).toEqual({
      index: 0,
      success: true,
      applied: true
    })

    // Second edit should be a no-op
    expect(editResults[1]).toEqual({
      index: 1,
      success: true,
      applied: false
    })
  })

  it("should handle all edits failing", async () => {
    const edits = [
      { oldString: "Non-existent text 1", newString: "This will fail 1" },
      { oldString: "Non-existent text 2", newString: "This will fail 2" }
    ]

    let contentNew = "Hello world\nThis is a test"
    let appliedEdits = 0
    let failedEdits = 0
    const editResults: Array<{ index: number; success: boolean; applied: boolean; error?: string }> = []

    // Mock replace to always fail
    mockReplace.mockImplementation(() => {
      throw new Error("String not found")
    })

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]

      try {
        contentNew = mockReplace(contentNew, edit.oldString, edit.newString, false, {
          occurrence: undefined,
          autoContext: true,
          confidence: 0.8
        })
        appliedEdits++
        editResults.push({
          index: i,
          success: true,
          applied: true
        })
      } catch (error) {
        failedEdits++
        editResults.push({
          index: i,
          success: false,
          applied: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // Verify results
    expect(appliedEdits).toBe(0)
    expect(failedEdits).toBe(2)
    expect(editResults).toHaveLength(2)

    // Both edits should fail
    expect(editResults[0]).toEqual({
      index: 0,
      success: false,
      applied: false,
      error: "String not found"
    })

    expect(editResults[1]).toEqual({
      index: 1,
      success: false,
      applied: false,
      error: "String not found"
    })
  })
})
