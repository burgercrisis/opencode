#!/usr/bin/env bun

// Script to identify which failing file test corrupts the global Instance
import { execSync } from 'child_process'

const failingTests = [
  {
    name: "should get git status for modified files",
    pattern: "should get git status for modified files"
  },
  {
    name: "should read text files", 
    pattern: "should read text files"
  },
  {
    name: "should read image files as base64",
    pattern: "should read image files as base64"
  },
  {
    name: "should list directory contents",
    pattern: "should list directory contents"
  },
  {
    name: "should sort directories before files",
    pattern: "should sort directories before files"
  }
]

console.log("🔍 Testing each failing file test individually to identify Instance corruption...\n")

for (const test of failingTests) {
  console.log(`🧪 Testing: ${test.name}`)
  
  try {
    // Test the failing file test in isolation
    const output = execSync(
      `bun test --cwd packages/opencode src/file/test/index.test.ts -t "${test.pattern}" --timeout 5000`,
      { 
        encoding: 'utf8', 
        stdio: 'pipe',
        cwd: process.cwd()
      }
    )
    
    console.log(`✅ ${test.name} - PASSED (no Instance corruption detected)`)
    
    // Now test if agent tests still work after this test
    try {
      const agentOutput = execSync(
        `bun test --cwd packages/opencode test/agent/agent.test.ts -t "returns default native agents when no config" --timeout 5000`,
        { 
          encoding: 'utf8', 
          stdio: 'pipe',
          cwd: process.cwd()
        }
      )
      console.log(`✅ Agent test still works after ${test.name}`)
    } catch (agentError) {
      if (agentError.message.includes('Instance.provide is not a function')) {
        console.log(`🚨 CORRUPTION DETECTED: ${test.name} is corrupting the global Instance!`)
        console.log(`🔍 Agent test failed with: ${agentError.message.split('\n')[0]}`)
        break
      } else {
        console.log(`⚠️  Agent test failed for other reasons after ${test.name}`)
      }
    }
    
  } catch (error) {
    console.log(`❌ ${test.name} - FAILED: ${error.message.split('\n')[0]}`)
  }
  
  console.log("---")
}

console.log("\n🎯 Investigation complete!")
