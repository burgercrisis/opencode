import { describe, test, expect } from "bun:test"

describe("Edit Tool Input Validation", () => {
  test("should validate required filePath", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({} as any, {} as any)
    ).rejects.toThrow("filePath is required")
  })

  test("should validate non-empty oldString", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "",
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("oldString is required and cannot be empty")
  })

  test("should validate non-empty newString", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "old",
        newString: ""
      }, {} as any)
    ).rejects.toThrow("newString is required and cannot be empty")
  })

  test("should reject identical strings", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "same",
        newString: "same"
      }, {} as any)
    ).rejects.toThrow("No changes to apply: oldString and newString are identical.")
  })

  test("should reject null bytes in strings", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: "test\0malicious",
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("String parameters cannot contain null bytes")
  })

  test("should reject strings exceeding max length", async () => {
    const { EditTool } = await import("../src/tool/edit")
    const longString = "a".repeat(1001) // Exceeds TOOL.MAX_LENGTH
    
    await expect(
      EditTool.execute({
        filePath: "/test.txt",
        oldString: longString,
        newString: "replacement"
      }, {} as any)
    ).rejects.toThrow("String parameters too long: max 1000 characters allowed")
  })

  test("should accept valid parameters", async () => {
    const { EditTool } = await import("../src/tool/edit")
    
    // Mock the file operations to avoid actual file I/O
    const originalWithLock = global.FileTime?.withLock
    global.FileTime = {
      withLock: async (path: string, callback: () => Promise<any>) => {
        if (path === "/test.txt") {
          return callback()
        }
        throw new Error("File not found")
      }
    } as any
    
    try {
      const result = await EditTool.execute({
        filePath: "/test.txt",
        oldString: "old text",
        newString: "new text",
        replaceAll: false
      }, {} as any)
      
      expect(result).toBeDefined()
      expect(result.title).toBeDefined()
      
    } finally {
      global.FileTime = { withLock: originalWithLock }
    }
  })
})
