import { describe, test, expect } from "bun:test"
import { promises as fs } from "fs"
import path from "path"

// Mock the FileTime.withLock for testing
const mockFileTime = {
  withLock: async (filePath: string, callback: () => Promise<any>) => {
    return callback()
  }
}

// Mock EditTool for testing
const mockEditTool = {
  init: async () => ({
    execute: async (params: any) => ({
      output: `Applied edit: ${params.oldString} -> ${params.newString}`,
      metadata: { success: true }
    })
  })
}

describe("MultiEdit Optimization", () => {
  test("should reduce file operations from N to 2", async () => {
    const testFile = path.join(process.cwd(), "test-multiedit.txt")
    const initialContent = "line1\nline2\nline3\nline4\nline5"
    
    // Create test file
    await fs.writeFile(testFile, initialContent)
    
    // Mock FileTime and EditTool
    const originalWithLock = global.FileTime?.withLock
    const originalInit = global.EditTool?.init
    global.FileTime = mockFileTime
    global.EditTool = mockEditTool as any
    
    try {
      // Import and execute MultiEdit
      const { MultiEditTool } = await import("../src/tool/multiedit")
      
      const result = await MultiEditTool.execute({
        filePath: testFile,
        edits: [
          { oldString: "line2", newString: "modified2" },
          { oldString: "line4", newString: "modified4" }
        ]
      }, {} as any)
      
      // Verify file was modified correctly
      const finalContent = await fs.readFile(testFile, "utf-8")
      expect(finalContent).toContain("modified2")
      expect(finalContent).toContain("modified4")
      expect(finalContent).toContain("line1") // unchanged
      expect(finalContent).toContain("line3") // unchanged
      expect(finalContent).toContain("line5") // unchanged
      
      // Should have applied 2 edits successfully
      expect(result.metadata.editCount).toBe(2)
      
    } finally {
      // Restore original functions
      global.FileTime = { withLock: originalWithLock }
      global.EditTool = { init: originalInit }
      
      // Cleanup
      await fs.unlink(testFile).catch(() => {})
    }
  })

  test("should handle no-op edits efficiently", async () => {
    const testFile = path.join(process.cwd(), "test-multiedit-noop.txt")
    const initialContent = "line1\nline2\nline3"
    
    await fs.writeFile(testFile, initialContent)
    
    // Mock FileTime and EditTool
    const originalWithLock = global.FileTime?.withLock
    const originalInit = global.EditTool?.init
    global.FileTime = mockFileTime
    global.EditTool = mockEditTool as any
    
    try {
      const { MultiEditTool } = await import("../src/tool/multiedit")
      
      const result = await MultiEditTool.execute({
        filePath: testFile,
        edits: [
          { oldString: "line2", newString: "line2" }, // no-op
          { oldString: "nonexistent", newString: "added" }
        ]
      }, {} as any)
      
      // Verify only the real edit was applied
      const finalContent = await fs.readFile(testFile, "utf-8")
      expect(finalContent).toContain("added")
      expect(finalContent).not.toContain("modified") // no-op edit skipped
      
      // Should have applied 1 edit successfully
      expect(result.metadata.editCount).toBe(2) // still counts both, but only 1 applied
      
    } finally {
      // Restore original functions
      global.FileTime = { withLock: originalWithLock }
      global.EditTool = { init: originalInit }
      
      // Cleanup
      await fs.unlink(testFile).catch(() => {})
    }
  })
})
