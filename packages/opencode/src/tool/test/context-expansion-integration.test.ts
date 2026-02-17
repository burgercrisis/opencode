import { describe, test, expect } from "bun:test"
import { EditTool } from "../edit"
import { tmpdir } from "os"
import { join } from "path"

describe("Context Expansion Integration", () => {
  test("should work with actual EditTool when context expansion finds unique match", async () => {
    const tmp = tmpdir()
    const filePath = join(tmp, `test-${Date.now()}.txt`)
    
    const content = `function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
    
    await Bun.write(filePath, content)
    
    try {
      const tool = await EditTool.init()
      const result = await tool.execute({
        filePath,
        oldString: 'console.log("hello")',
        newString: 'console.log("world")',
        autoContext: true,
        confidence: 0.4
      })
      
      // Should succeed because context expansion finds unique match
      expect(result).toContain('console.log("world")')
      expect(result).not.toContain('console.log("hello")')
    } finally {
      // Cleanup
      try {
        await Bun.file(filePath).delete()
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test("should fail when context expansion cannot find unique match", async () => {
    const tmp = tmpdir()
    const filePath = join(tmp, `test-${Date.now()}.txt`)
    
    const content = `function test() {
  console.log("hello")
}

function another() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
    
    await Bun.write(filePath, content)
    
    try {
      const tool = await EditTool.init()
      
      // Should throw error because even with context expansion, multiple similar matches exist
      await expect(tool.execute({
        filePath,
        oldString: 'console.log("hello")',
        newString: 'console.log("world")',
        autoContext: true,
        confidence: 0.8 // High confidence threshold
      })).rejects.toThrow("Found multiple matches")
    } finally {
      // Cleanup
      try {
        await Bun.file(filePath).delete()
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test("should work with explicit occurrence selection", async () => {
    const tmp = tmpdir()
    const filePath = join(tmp, `test-${Date.now()}.txt`)
    
    const content = `function test() {
  console.log("hello")
}

function main() {
  console.log("hello")
}`
    
    await Bun.write(filePath, content)
    
    try {
      const tool = await EditTool.init()
      const result = await tool.execute({
        filePath,
        oldString: 'console.log("hello")',
        newString: 'console.log("world")',
        occurrence: 2, // Replace second occurrence
        autoContext: false
      })
      
      // Should replace only the second occurrence
      const lines = result.split('\n')
      const testFunctionLine = lines.findIndex(line => line.includes('function test()'))
      const mainFunctionLine = lines.findIndex(line => line.includes('function main()'))
      
      expect(testFunctionLine).toBeGreaterThan(-1)
      expect(mainFunctionLine).toBeGreaterThan(-1)
      
      // The second occurrence (in main function) should be replaced
      const mainFunctionIndex = lines.findIndex(line => line.includes('function main()'))
      const consoleLineAfterMain = lines[mainFunctionIndex + 1]
      expect(consoleLineAfterMain).toContain('console.log("world")')
      
      // The first occurrence (in test function) should remain unchanged
      const testFunctionIndex = lines.findIndex(line => line.includes('function test()'))
      const consoleLineAfterTest = lines[testFunctionIndex + 1]
      expect(consoleLineAfterTest).toContain('console.log("hello")')
    } finally {
      // Cleanup
      try {
        await Bun.file(filePath).delete()
      } catch {
        // Ignore cleanup errors
      }
    }
  })
})
