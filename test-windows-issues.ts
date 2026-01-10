#!/usr/bin/env bun

/**
 * Windows Command Execution Investigation Test Script
 *
 * This script tests the specific issues identified with Windows command execution
 * in the OpenCode IDE, focusing on PowerShell executor and bash tool behavior.
 */

import { PowerShellExecutor } from "./packages/opencode/src/tool/powershell-executor"
import { TempFileManager } from "./packages/opencode/src/tool/temp-file-manager"
import { BashTool } from "./packages/opencode/src/tool/bash"
import { Instance } from "./packages/opencode/src/project/instance"
import path from "path"
import os from "os"

const isWindows = process.platform === "win32"

console.log("🧪 Windows Command Execution Investigation Test Script")
console.log("=".repeat(60))
console.log(`Platform: ${process.platform}`)
console.log(`Is Windows: ${isWindows}`)
console.log(`Temp Directory: ${os.tmpdir()}`)
console.log("=".repeat(60))

// Test context for BashTool
const testCtx = {
  sessionID: "test-session",
  messageID: "test-message",
  callID: "test-call",
  agent: "test-agent",
  abort: new AbortController().signal,
  metadata: (data: any) => console.log("Metadata:", data),
  ask: async (req: any) => {
    console.log("Permission request:", req)
    return { response: "approve" }
  },
}

async function testIssue1_PathResolution() {
  console.log("\n🔍 Issue 1: PowerShell File Execution Path Resolution")
  console.log("-".repeat(50))

  if (!isWindows) {
    console.log("⚠️  Skipping PowerShell tests on non-Windows platform")
    return
  }

  const tempManager = new TempFileManager()
  const executor = new PowerShellExecutor({ tempFileManager: tempManager })

  try {
    // Test 1: Basic file execution
    console.log("Testing basic PowerShell file execution...")
    const result1 = await executor.execute('Write-Host "Hello from temp file"')
    console.log(`✅ Exit code: ${result1.exitCode}`)
    console.log(`📄 Output: ${result1.stdout.trim()}`)

    // Test 2: File path resolution
    console.log("\nTesting file path resolution...")
    const tempPath = await tempManager.create('Write-Host "Path test successful"')
    console.log(`📁 Temp file created at: ${tempPath}`)
    console.log(`📁 Temp directory: ${path.dirname(tempPath)}`)
    console.log(`📁 System temp dir: ${os.tmpdir()}`)

    const result2 = await executor.executeFile(tempPath)
    console.log(`✅ File execution exit code: ${result2.exitCode}`)
    console.log(`📄 File execution output: ${result2.stdout.trim()}`)

    // Test 3: Manual file creation vs executor coordination
    console.log("\nTesting manual file creation coordination...")
    const manualPath = path.join(os.tmpdir(), "manual-test.ps1")
    await Bun.write(manualPath, 'Write-Host "Manual file test"')

    try {
      // This should fail if paths don't coordinate properly
      const result3 = await executor.executeFile(manualPath)
      console.log(`✅ Manual file execution exit code: ${result3.exitCode}`)
      console.log(`📄 Manual file execution output: ${result3.stdout.trim()}`)
    } catch (error) {
      console.log(`❌ Manual file execution failed: ${error}`)
    } finally {
      // Cleanup manual file
      try {
        await Bun.file(manualPath).delete()
      } catch {}
    }

  } catch (error) {
    console.log(`❌ Issue 1 test failed: ${error}`)
  } finally {
    await tempManager.dispose()
  }
}

async function testIssue2_OutputFormatting() {
  console.log("\n🔍 Issue 2: PowerShell Pipeline Output Formatting and Stream Handling")
  console.log("-".repeat(70))

  if (!isWindows) {
    console.log("⚠️  Skipping PowerShell tests on non-Windows platform")
    return
  }

  const tempManager = new TempFileManager()
  const executor = new PowerShellExecutor({ tempFileManager: tempManager })

  try {
    // Test 1: Pipeline output formatting
    console.log("Testing Get-Process pipeline output...")
    const result1 = await executor.execute('Get-Process | Select-Object -First 2')
    console.log(`✅ Exit code: ${result1.exitCode}`)
    console.log("📄 Raw output:")
    console.log(result1.stdout)
    console.log("📄 Output contains table headers?", result1.stdout.includes("Name") || result1.stdout.includes("Id"))

    // Test 2: Stream redirection
    console.log("\nTesting stream redirection (2>&1)...")
    const result2 = await executor.execute('Write-Host "stdout"; Write-Error "stderr" 2>&1')
    console.log(`✅ Exit code: ${result2.exitCode}`)
    console.log("📄 Combined output:")
    console.log(result2.stdout)
    console.log("📄 Separate stderr:")
    console.log(result2.stderr)

    // Test 3: Array collection vs string concatenation
    console.log("\nTesting array collection...")
    const result3 = await executor.execute('$output = @(); 1..5 | % { $output += "LINE_$_" }; $output -join "`n"')
    console.log(`✅ Exit code: ${result3.exitCode}`)
    console.log("📄 Array collection output:")
    console.log(result3.stdout)

    // Test 4: Out-String formatting
    console.log("\nTesting Out-String formatting...")
    const result4 = await executor.execute('Get-Process | Select-Object -First 2 | Out-String -Width 200')
    console.log(`✅ Exit code: ${result4.exitCode}`)
    console.log("📄 Out-String output:")
    console.log(result4.stdout)

  } catch (error) {
    console.log(`❌ Issue 2 test failed: ${error}`)
  } finally {
    await tempManager.dispose()
  }
}

async function testIssue3_CommandSupport() {
  console.log("\n🔍 Issue 3: Missing Command Support and Error Handling")
  console.log("-".repeat(50))

  if (!isWindows) {
    console.log("⚠️  Skipping PowerShell tests on non-Windows platform")
    return
  }

  const tempManager = new TempFileManager()
  const executor = new PowerShellExecutor({ tempFileManager: tempManager })

  const failingCommands = [
    { cmd: 'Invoke-WebRequest -Uri "http://nonexistent.invalid"', desc: "Network request (should fail)" },
    { cmd: 'Get-Disk', desc: "Get-Disk command (may require admin)" },
    { cmd: 'Get-PSReadLineOption', desc: "PSReadLine command (may not be loaded)" },
    { cmd: '$PSDefaultParameterValues', desc: "PSDefaultParameterValues (may not exist)" },
    { cmd: 'sc query', desc: "Service controller query" },
  ]

  try {
    for (const { cmd, desc } of failingCommands) {
      console.log(`\nTesting: ${desc}`)
      console.log(`Command: ${cmd}`)
      try {
        const result = await executor.execute(cmd)
        console.log(`✅ Exit code: ${result.exitCode}`)
        console.log(`📄 Output length: ${result.stdout.length} chars`)
        if (result.stderr) {
          console.log(`⚠️  Stderr: ${result.stderr.trim()}`)
        }
      } catch (error) {
        console.log(`❌ Command failed: ${error}`)
      }
    }
  } catch (error) {
    console.log(`❌ Issue 3 test failed: ${error}`)
  } finally {
    await tempManager.dispose()
  }
}

async function testIssue4_BackgroundJobs() {
  console.log("\n🔍 Issue 4: Background Job Support Missing")
  console.log("-".repeat(40))

  if (!isWindows) {
    console.log("⚠️  Skipping PowerShell tests on non-Windows platform")
    return
  }

  const tempManager = new TempFileManager()
  const executor = new PowerShellExecutor({ tempFileManager: tempManager })

  try {
    console.log("Testing PowerShell background job lifecycle...")

    // Test job creation and monitoring
    const jobCommand = `
$j = Start-Job { Start-Sleep -Milliseconds 100; "Job completed successfully" }
Write-Host "Job started with ID: $($j.Id)"
Write-Host "Job state: $($j.State)"
Start-Sleep -Milliseconds 200  # Wait for job to complete
Write-Host "Job state after wait: $($j.State)"
$result = Receive-Job $j
Write-Host "Job result: $result"
Stop-Job $j 2>$null
Write-Host "Final job state: $($j.State)"
`

    const result = await executor.execute(jobCommand)
    console.log(`✅ Exit code: ${result.exitCode}`)
    console.log("📄 Job execution output:")
    console.log(result.stdout)

    // Check if job states are mentioned
    const hasRunning = result.stdout.includes("Running")
    const hasStopped = result.stdout.includes("Stopped")
    const hasCompleted = result.stdout.includes("Completed")

    console.log(`📊 Job states observed - Running: ${hasRunning}, Stopped: ${hasStopped}, Completed: ${hasCompleted}`)

  } catch (error) {
    console.log(`❌ Issue 4 test failed: ${error}`)
  } finally {
    await tempManager.dispose()
  }
}

async function testBashToolIntegration() {
  console.log("\n🔍 Bash Tool Integration Tests")
  console.log("-".repeat(35))

  const projectRoot = path.join(__dirname, "packages", "opencode")

  await Instance.provide({
    directory: projectRoot,
    fn: async () => {
      const bash = await BashTool.init()

      // Test basic command execution
      console.log("Testing basic bash tool execution...")
      try {
        const result = await bash.execute(
          { command: "echo 'Bash tool integration test'", description: "Basic echo test" },
          testCtx
        )
        console.log(`✅ Exit code: ${result.metadata.exit}`)
        console.log(`📄 Output: ${result.metadata.output.trim()}`)
      } catch (error) {
        console.log(`❌ Bash tool test failed: ${error}`)
      }

      // Test PowerShell command via bash tool
      if (isWindows) {
        console.log("\nTesting PowerShell command via bash tool...")
        try {
          const result = await bash.execute(
            {
              command: 'powershell.exe -NoProfile -Command "Write-Host \'PowerShell via bash tool\'"',
              description: "PowerShell via bash tool"
            },
            testCtx
          )
          console.log(`✅ Exit code: ${result.metadata.exit}`)
          console.log(`📄 Output: ${result.metadata.output.trim()}`)
        } catch (error) {
          console.log(`❌ PowerShell via bash tool failed: ${error}`)
        }
      }
    }
  })
}

async function main() {
  try {
    await testIssue1_PathResolution()
    await testIssue2_OutputFormatting()
    await testIssue3_CommandSupport()
    await testIssue4_BackgroundJobs()
    await testBashToolIntegration()

    console.log("\n" + "=".repeat(60))
    console.log("🎯 Test script completed")
    console.log("=".repeat(60))

  } catch (error) {
    console.error("💥 Test script failed:", error)
    process.exit(1)
  }
}

// Run the tests
main()