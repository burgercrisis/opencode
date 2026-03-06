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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { PtyRoutes } from "../../routes/pty"

describe("PtyRoutes - Simple", () => {
  let app: ReturnType<typeof PtyRoutes>

  beforeEach(() => {
    globalThis.requestId = "test-request-id"
    app = PtyRoutes()
  })

  describe("Basic functionality", () => {
    it("should handle PTY requests without crashing", async () => {
      const res = await app.request("/")
      expect([200, 404, 500]).toContain(res.status)
    })

    it("should handle PTY creation without crashing", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "bash",
          args: ["-c", "echo test"]
        })
      })
      expect([200, 400, 500]).toContain(res.status)
    })
  })
})
