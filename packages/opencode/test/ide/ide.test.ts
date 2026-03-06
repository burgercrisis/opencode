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

import { describe, expect, test, afterEach } from "bun:test"
import { Ide } from "../../src/ide"

describe("ide", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  const original = { ...process.env } as Record<string, string>

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      delete process.env[key]
    })
    Object.assign(process.env, original)
  })

  bulletproofTest("should detect Visual Studio Code", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] = "/path/to/Visual Studio Code.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("Visual Studio Code")
  })

  bulletproofTest("should detect Visual Studio Code Insiders", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] =
      "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("Visual Studio Code - Insiders")
  })

  bulletproofTest("should detect Cursor", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] = "/path/to/Cursor.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("Cursor")
  })

  bulletproofTest("should detect VSCodium", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] = "/path/to/VSCodium.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("VSCodium")
  })

  bulletproofTest("should detect Windsurf", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] = "/path/to/Windsurf.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("Windsurf")
  })

  bulletproofTest("should return unknown when TERM_PROGRAM is not vscode", async () => {
    process.env["TERM_PROGRAM"] = "iTerm2"
    process.env["GIT_ASKPASS"] =
      "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/git/dist/askpass.sh"

    expect(Ide.ide()).toBe("unknown")
  })

  bulletproofTest("should return unknown when GIT_ASKPASS does not contain IDE name", async () => {
    process.env["TERM_PROGRAM"] = "vscode"
    process.env["GIT_ASKPASS"] = "/path/to/unknown/askpass.sh"

    expect(Ide.ide()).toBe("unknown")
  })

  bulletproofTest("should recognize vscode-insiders OPENCODE_CALLER", async () => {
    process.env["OPENCODE_CALLER"] = "vscode-insiders"

    expect(Ide.alreadyInstalled()).toBe(true)
  })

  bulletproofTest("should recognize vscode OPENCODE_CALLER", async () => {
    process.env["OPENCODE_CALLER"] = "vscode"

    expect(Ide.alreadyInstalled()).toBe(true)
  })

  bulletproofTest("should return false for unknown OPENCODE_CALLER", async () => {
    process.env["OPENCODE_CALLER"] = "unknown"

    expect(Ide.alreadyInstalled()).toBe(false)
  })
})
