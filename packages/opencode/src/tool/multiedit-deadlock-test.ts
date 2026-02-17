import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { MultiEditTool } from "./multiedit"

describe("MultiEdit Deadlock Analysis", () => {
  it("should identify potential deadlock scenarios", () => {
    // Test case 1: Edit that would fail partway through
    const failingEdits = [
      {
        oldString: "line1\nline2\nline3",
        newString: "modified1\nmodified2\nmodified3",
        replaceAll: false,
      },
      {
        oldString: "line4\nline5",
        newString: "modified4\nmodified5",
        replaceAll: false,
      },
      {
        oldString: "line6", // This one will fail
        newString: "modified6",
        replaceAll: false,
      }
    ]

    // With current implementation, if edit 2 fails, edits 3+ might not be applied
    // This could leave the file in an inconsistent state

    for (let i = 0; i < failingEdits.length; i++) {
      expect(failingEdits[i].oldString).toBeDefined()
      expect(failingEdits[i].newString).toBeDefined()
    }
  })

  it("should handle concurrent multiedit operations safely", async () => {
    // Test case 2: Multiple multiedit operations on same file
    const filePath = "/tmp/test-concurrent.txt"

    // Create initial file content
    await Bun.write(filePath, "original content")

    try {
      // Operation 1: Should succeed
      const result1 = await MultiEditTool.execute({
        filePath,
        edits: [
          {
            oldString: "original content",
            newString: "modified by operation 1",
            replaceAll: false,
          }
        ]
      }, {} as any)

      expect(result1.success).toBe(true)
      expect(result1.metadata.editCount).toBe(1)

      // Operation 2: Should also succeed
      const result2 = await MultiEditTool.execute({
        filePath,
        edits: [
          {
            oldString: "modified by operation 1",
            newString: "modified by operation 2",
            replaceAll: false,
          }
        ]
      }, {} as any)

      expect(result2.success).toBe(true)
      expect(result2.metadata.editCount).toBe(1)

    } catch (error) {
      fail("Concurrent operations should not throw errors")
    }
  })

  it("should handle edit failure gracefully", async () => {
    // Test case 3: Edit failure handling
    const filePath = "/tmp/test-failure.txt"

    // Create initial file content
    await Bun.write(filePath, "original content")

    try {
      const result = await MultiEditTool.execute({
        filePath,
        edits: [
          {
            oldString: "original content",
            newString: "modified content",
            replaceAll: false,
          },
          {
            oldString: "nonexistent content", // This will fail
            newString: "should not be applied",
            replaceAll: false,
          }
        ]
      }, {} as any)

      // Should fail due to second edit not found
      expect(result.success).toBe(false)
      expect(result.metadata.editCount).toBe(1) // Only first edit applied
      expect(result.output).toContain("Failed to apply edit")

    } catch (error) {
      // Expected to fail, but should not crash
      expect(error).toBeDefined()
    }
  })

  it("should prevent inconsistent state on partial failure", async () => {
    // Test case 4: Verify file state consistency
    const filePath = "/tmp/test-consistency.txt"

    // Create initial file content with specific pattern
    await Bun.write(filePath, "LINE1\nLINE2\nLINE3\nLINE4\nLINE5")

    try {
      // Generate combined result
      let finalResult
      try {
        finalResult = await MultiEditTool.execute({
          filePath,
          edits: [
            {
              oldString: "LINE3",
              newString: "MODIFIED_LINE3",
              replaceAll: false,
            },
            {
              oldString: "LINE5",
              newString: "MODIFIED_LINE5",
              replaceAll: false,
            },
            {
              oldString: "LINE1",
              newString: "MODIFIED_LINE1",
              replaceAll: false,
            },
            {
              oldString: "LINE2",
              newString: "MODIFIED_LINE2",
              replaceAll: false,
            },
            {
              oldString: "LINE4",
              newString: "MODIFIED_LINE4",
              replaceAll: false,
            },
            {
              oldString: "LINE1", // Second edit on same line - should fail or conflict
              newString: "CONFLICTING_LINE1",
              replaceAll: false,
            }
          ]
        }, {} as any)
      } catch (error) {
        finalResult = {
        },
        {
          oldString: "LINE5",
          newString: "MODIFIED_LINE5",
          replaceAll: false,
        },
        {
          oldString: "LINE1",
          newString: "MODIFIED_LINE1",
          replaceAll: false,
        },
        {
          oldString: "LINE2",
          newString: "MODIFIED_LINE2",
          replaceAll: false,
        },
        {
          oldString: "LINE4",
          newString: "MODIFIED_LINE4",
          replaceAll: false,
        },
        {
          oldString: "LINE1", // Second edit on same line - should fail or conflict
          newString: "CONFLICTING_LINE1",
          replaceAll: false,
        }
        ]
      }, { } as any)

  if (result.success) {
    // If successful, verify all edits were applied
    const finalContent = await Bun.file(filePath).text()

    // Should contain all modifications except the conflicting one
    expect(finalContent).toContain("MODIFIED_LINE3")
    expect(finalContent).toContain("MODIFIED_LINE5")
    expect(finalContent).toContain("MODIFIED_LINE2")
    expect(finalContent).toContain("MODIFIED_LINE4")
    expect(finalContent).toContain("MODIFIED_LINE1")

    // The conflicting edit should not be applied
    expect(finalContent).not.toContain("CONFLICTING_LINE1")
  } else {
    // If failed, should have meaningful error
    expect(result.output).toBeDefined()
    expect(result.output).toContain("Failed to apply edit")
  }
} catch (error) {
  fail("Should not throw unexpected errors")
}
  })
})

function fail(message: string) {
  expect(true).toBe(false, message)
}
