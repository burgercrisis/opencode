#!/usr/bin/env bun

// Script to identify which failing file test corrupts the global Instance by testing combinations
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const failingTests = [
  "should get git status for modified files",
  "should read text files", 
  "should read image files as base64",
  "should list directory contents",
  "should sort directories before files"
]

console.log("🔍 Testing combinations to identify Instance corruption...\n")

// Helper to temporarily skip a test
function skipTest(testName: string) {
  const filePath = "packages/opencode/src/file/test/index.test.ts"
  let content = readFileSync(filePath, 'utf8')
  
  // Skip the specific test by changing it("test name") to it.skip("test name")
  const regex = new RegExp(`(it\\s*\\(\\s*["'\`]${testName}["'\`]\\s*,)`, 'g')
  content = content.replace(regex, 'it.skip(')
  
  writeFileSync(filePath, content)
  return content
}

// Helper to restore all tests
function restoreTests(originalContent: string) {
  const filePath = "packages/opencode/src/file/test/index.test.ts"
  writeFileSync(filePath, originalContent)
}

// Store original content
const originalContent = readFileSync("packages/opencode/src/file/test/index.test.ts", 'utf8')

try {
  // Test 1: Skip each test individually and check if agent tests work
  for (let i = 0; i < failingTests.length; i++) {
    const testName = failingTests[i]
    console.log(`🧪 Skipping: ${testName}`)
    
    // Restore original content first
    restoreTests(originalContent)
    
    // Skip this specific test
    skipTest(testName)
    
    try {
      // Test if agent tests work now
      console.log(`🔍 Testing agent tests after skipping ${testName}...`)
      const agentOutput = execSync(
        `bun test --cwd packages/opencode test/agent/agent.test.ts -t "returns default native agents when no config" --timeout 10000`,
        { 
          encoding: 'utf8', 
          stdio: 'pipe',
          cwd: process.cwd()
        }
      )
      console.log(`✅ SUCCESS: Agent tests work when skipping ${testName}!`)
      console.log(`🚨 CORRUPTION IDENTIFIED: ${testName} is the corrupting test!`)
      break
    } catch (agentError) {
      if (agentError.message.includes('Instance.provide is not a function')) {
        console.log(`❌ Agent tests still fail when skipping ${testName}`)
      } else {
        console.log(`⚠️  Agent tests failed for other reasons when skipping ${testName}`)
      }
    }
  }
  
  // Test 2: Try skipping all failing tests at once
  console.log(`\n🧪 Testing: Skipping ALL failing tests`)
  restoreTests(originalContent)
  
  let content = originalContent
  for (const testName of failingTests) {
    const regex = new RegExp(`(it\\s*\\(\\s*["'\`]${testName}["'\`]\\s*,)`, 'g')
    content = content.replace(regex, 'it.skip(')
  }
  writeFileSync("packages/opencode/src/file/test/index.test.ts", content)
  
  try {
    console.log(`🔍 Testing agent tests after skipping all failing tests...`)
    const agentOutput = execSync(
      `bun test --cwd packages/opencode test/agent/agent.test.ts -t "returns default native agents when no config" --timeout 10000`,
      { 
        encoding: 'utf8', 
        stdio: 'pipe',
        cwd: process.cwd()
      }
    )
    console.log(`✅ SUCCESS: Agent tests work when skipping all failing tests!`)
    console.log(`🎯 CONCLUSION: One or more of the failing tests are corrupting the Instance`)
  } catch (agentError) {
    if (agentError.message.includes('Instance.provide is not a function')) {
      console.log(`❌ Agent tests still fail even when skipping all failing tests`)
      console.log(`🤔 CONCLUSION: Instance corruption might be coming from elsewhere`)
    } else {
      console.log(`⚠️  Agent tests failed for other reasons even when skipping all failing tests`)
    }
  }
  
} finally {
  // Always restore original content
  restoreTests(originalContent)
  console.log(`\n🔄 Restored original test file`)
}

console.log("\n🎯 Investigation complete!")
