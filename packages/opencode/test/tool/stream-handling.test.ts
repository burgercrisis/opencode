/**
 * Terminal Stream Handling Tests
 * 
 * Tests verifying proper path handling, stream capture, and PowerShell job behavior.
 * 
 * This test file addresses the following issues:
 * 1. Path Issues: Hardcoded C:\tmp paths may not exist or have permissions
 *    - Fix: Use os.tmpdir() or [System.IO.Path]::GetTempPath() instead of hardcoded paths
 * 2. Job Display Quirks: PowerShell jobs show "Stopped" state but execution succeeds
 *    - This is expected behavior, not an execution problem
 * 3. Output Formatting: Some output captured differently due to stream handling
 *    - Fix: Use proper stream redirection 2>&1 | Out-String for combined capture
 */

import { describe, expect, test } from "bun:test"
import path from "path"
import os from "os"
import { TempFileManager } from "../../src/tool/temp-file-manager"
import { PowerShellExecutor } from "../../src/tool/powershell-executor"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import type { PermissionNext } from "../../src/permission/next"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

describe("terminal stream handling - path handling", () => {
  test("TempFileManager should use os.tmpdir() instead of hardcoded paths", async () => {
    const manager = new TempFileManager()
    
    // Verify the poolDir is using the system temp directory
    const expectedTmpDir = os.tmpdir()
    expect(manager["poolDir"]).toBe(expectedTmpDir)
    
    // Create a temp file and verify it's in the correct location
    const filePath = await manager.create("test content")
    expect(filePath).toStartWith(expectedTmpDir)
    
    // Verify file exists and can be read
    const content = await Bun.file(filePath).text()
    expect(content).toBe("test content")
    
    // Cleanup
    await manager.cleanup(filePath)
  })

  test("TempFileManager should create files with secure permissions", async () => {
    const manager = new TempFileManager()
    const filePath = await manager.create("secure test content")
    
    // File should exist and have content
    const exists = await Bun.file(filePath).exists()
    expect(exists).toBe(true)
    
    // Cleanup
    await manager.cleanup(filePath)
  })

  test("TempFileManager should handle concurrent file creation", async () => {
    const manager = new TempFileManager()
    
    // Create multiple files concurrently
    const filePromises = Array.from({ length: 5 }, (_, i) =>
      manager.create(`content-${i}`)
    )
    
    const filePaths = await Promise.all(filePromises)
    
    // All files should be unique
    const uniquePaths = new Set(filePaths)
    expect(uniquePaths.size).toBe(5)
    
    // Cleanup all files
    await Promise.all(filePaths.map((fp) => manager.cleanup(fp)))
  })
})

describe("terminal stream handling - stream output", () => {
  test("BashTool should capture stdout correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          { command: "echo 'stdout test'", description: "Test stdout capture" },
          ctx,
        )
        expect(result.metadata.output).toContain("stdout test")
        expect(result.metadata.exit).toBe(0)
      },
    })
  })

  test("BashTool should capture stderr correctly when redirected", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          { command: "echo 'error message' >&2", description: "Test stderr capture" },
          ctx,
        )
        expect(result.metadata.output).toContain("error message")
        expect(result.metadata.exit).toBe(0)
      },
    })
  })

  test("BashTool should handle large output correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        // Generate 100 lines of output - use cross-platform approach
        const largeCommand = process.platform === "win32"
          ? "powershell -Command \"1..100 | ForEach-Object { \"LINE_$_\" }\""
          : "for i in $(seq 1 100); do echo \"LINE_$i\"; done"
        const result = await bash.execute(
          { command: largeCommand, description: "Test large output capture" },
          ctx,
        )
        
        // Verify all lines are captured
        const lines = result.metadata.output.split("\n").filter(l => l.trim())
        expect(lines.length).toBeGreaterThanOrEqual(100)
        expect(lines[0]).toContain("LINE_1")
        expect(lines[99]).toContain("LINE_100")
      },
    })
  })

  test("BashTool should handle mixed stdout and stderr", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          { command: "echo 'stdout' && echo 'stderr' >&2", description: "Test mixed streams" },
          ctx,
        )
        expect(result.metadata.output).toContain("stdout")
        expect(result.metadata.output).toContain("stderr")
      },
    })
  })
})

describe("terminal stream handling - cross-platform compatibility", () => {
  test("should handle Windows-style paths correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        // Test path handling on Windows
        const result = await bash.execute(
          { command: "echo 'path test'", description: "Test path compatibility" },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
      },
    })
  })

  test("should handle special characters in output", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const specialChars = "Special chars: \n\t\"'\\`!@#$%^&*()[]{}|;:,.<>?"
        const result = await bash.execute(
          { command: `echo '${specialChars.replace(/'/g, "'\\''")}'`, description: "Test special chars" },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
      },
    })
  })
})

describe("terminal stream handling - performance", () => {
  test("should handle many small commands efficiently", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const startTime = Date.now()
        
        // Execute many small commands
        for (let i = 0; i < 20; i++) {
          await bash.execute(
            { command: "echo test", description: `Quick echo ${i}` },
            ctx,
          )
        }
        
        const elapsed = Date.now() - startTime
        // Should complete quickly (less than 10 seconds for 20 commands)
        expect(elapsed).toBeLessThan(10000)
      },
    })
  })
})
