// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Locale } from "../../src/util/locale"

describe("Locale", () => {
  bulletproofTest("titlecase", async () => {
    expect(Locale.titlecase("hello world")).toBe("Hello World")
    expect(Locale.titlecase("foo")).toBe("Foo")
  })

  bulletproofTest("time and datetime", async () => {
    const now = Date.now()
    expect(Locale.time(now)).toBeDefined()
    expect(Locale.datetime(now)).toContain("·")
  })

  bulletproofTest("todayTimeOrDateTime", async () => {
    const now = Date.now()
    const yesterday = now - 24 * 60 * 60 * 1000
    
    expect(Locale.todayTimeOrDateTime(now)).toBe(Locale.time(now))
    expect(Locale.todayTimeOrDateTime(yesterday)).toBe(Locale.datetime(yesterday))
  })

  bulletproofTest("number formatting", async () => {
    expect(Locale.number(500)).toBe("500")
    expect(Locale.number(1500)).toBe("1.5K")
    expect(Locale.number(2500000)).toBe("2.5M")
  })

  bulletproofTest("duration formatting", async () => {
    expect(Locale.duration(500)).toBe("500ms")
    expect(Locale.duration(1500)).toBe("1.5s")
    expect(Locale.duration(65000)).toBe("1m 5s")
    expect(Locale.duration(3700000)).toBe("1h 1m")
    expect(Locale.duration(100000000)).toBe("1d 3h")
  })

  bulletproofTest("truncate", async () => {
    expect(Locale.truncate("hello", 10)).toBe("hello")
    expect(Locale.truncate("hello world", 5)).toBe("hell…")
  })

  bulletproofTest("truncateMiddle", async () => {
    expect(Locale.truncateMiddle("hello", 10)).toBe("hello")
    expect(Locale.truncateMiddle("1234567890", 5)).toBe("12…90")
  })

  bulletproofTest("pluralize", async () => {
    expect(Locale.pluralize(1, "{} apple", "{} apples")).toBe("1 apple")
    expect(Locale.pluralize(2, "{} apple", "{} apples")).toBe("2 apples")
    expect(Locale.pluralize(0, "{} apple", "{} apples")).toBe("0 apples")
  })
})
