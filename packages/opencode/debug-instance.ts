#!/usr/bin/env bun

// Debug script to check Instance module state
console.log("=== Instance Module Debug ===")

try {
  // Try importing Instance directly
  const { Instance } = await import("./src/project/instance")
  console.log("1. Direct import Instance type:", typeof Instance)
  console.log("2. Direct import Instance.provide type:", typeof Instance?.provide)
  console.log("3. Direct import Instance keys:", Object.keys(Instance || {}))
  
  // Check global Instance
  console.log("4. Global Instance type:", typeof (globalThis as any).Instance)
  console.log("5. Global Instance.provide type:", typeof (globalThis as any).Instance?.provide)
  console.log("6. Global Instance keys:", Object.keys((globalThis as any).Instance || {}))
  
  // Check if they're the same object
  console.log("7. Same reference?", Instance === (globalThis as any).Instance)
  
  // Try calling provide
  if (typeof Instance?.provide === 'function') {
    console.log("8. Direct provide call works")
  } else {
    console.log("8. Direct provide call FAILED")
  }
  
  if (typeof (globalThis as any).Instance?.provide === 'function') {
    console.log("9. Global provide call works")
  } else {
    console.log("9. Global provide call FAILED")
  }
  
} catch (err) {
  console.error("Error:", err)
}
