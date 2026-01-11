#!/usr/bin/env bun
/**
 * Run All Tool Tests
 *
 * This script automatically discovers all test files in the tool directory
 * and provides the command to run them all with Bun's test runner.
 */

import { readdir } from "fs/promises"
import { extname } from "path"
import { fileURLToPath } from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

async function runAllToolTests() {
  console.log("🔍 Discovering test files in tool directory...")

  try {
    // Get all files in the current directory
    const files = await readdir(__dirname)

    // Filter for .test.ts files, excluding this script
    const testFiles = files
      .filter(file => {
        return file.endsWith('.test.ts') &&
               file !== 'run-all-tool-tests.ts' &&
               extname(file) === '.ts'
      })
      .sort() // Sort for consistent execution order

    if (testFiles.length === 0) {
      console.log("❌ No test files found in tool directory")
      process.exit(1)
    }

    console.log(`📋 Found ${testFiles.length} test files:`)
    testFiles.forEach(file => console.log(`   - ${file}`))
    console.log()

    console.log("🧪 To run all tests, execute the following command:")
    console.log(`cd ${__dirname}`)
    console.log(`bun test --timeout 30000`)
    console.log()
    console.log("This will automatically discover and run all .test.ts files in the directory.")
    console.log("\n🎯 Test discovery completed successfully!")

  } catch (error) {
    console.error("❌ Error discovering tests:", error)
    process.exit(1)
  }
}

// Run the discovery
runAllToolTests().catch((error) => {
  console.error("💥 Fatal error:", error)
  process.exit(1)
})