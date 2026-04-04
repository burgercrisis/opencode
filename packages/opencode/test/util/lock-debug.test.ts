import { describe, test, expect } from "bun:test"

describe("Lock Debug Test", () => {
  test("simple lock test", async () => {
    console.log("Starting simple lock test...")
    
    const { Lock } = await import("../../src/util/lock")
    
    console.log("Lock imported, testing basic functionality...")
    
    // Test basic lock functionality
    const lock = await Lock.read("test")
    console.log("Lock acquired successfully")
    lock[Symbol.dispose]()
    console.log("Lock released successfully")
    
    expect(true).toBe(true)
  })

  test("cleanup test", async () => {
    console.log("Starting cleanup test...")
    
    const { Lock } = await import("../../src/util/lock")
    
    console.log("Lock imported, testing cleanup...")
    
    // Test cleanup
    Lock.cleanup()
    console.log("Cleanup completed")
    
    expect(true).toBe(true)
  })
})
