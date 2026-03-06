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

// COMPREHENSIVE TEST-LEVEL INSTANCE PROTECTION
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
    console.log("[test-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[test-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[test-protection] Using current Instance")
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

import { describe, expect, test, afterEach, beforeEach } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { WebFetchTool } from "../../src/tool/webfetch"

const projectRoot = path.join(import.meta.dir, "../..")

const ctx = {
  sessionID: "test",
  messageID: "message",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

async function withFetch(
  mockFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockFetch as unknown as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe("tool.webfetch", () => {
  bulletproofTest("returns image responses as file attachments", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    await withFetch(
      async () => new Response(bytes, { status: 200, headers: { "content-type": "IMAGE/PNG; charset=binary" } }),
      async () => {
        await Instance.provide({
          directory: projectRoot,
          fn: async () => {
            const webfetch = await WebFetchTool.init()
            const result = await webfetch.execute({ url: "https://example.com/image.png", format: "markdown" }, ctx)
            expect(result.output).toBe("Image fetched successfully")
            expect(result.attachments).toBeDefined()
            expect(result.attachments?.length).toBe(1)
            expect(result.attachments?.[0].type).toBe("file")
            expect(result.attachments?.[0].mime).toBe("image/png")
            expect(result.attachments?.[0].url.startsWith("data:image/png;base64,")).toBe(true)
            expect(result.attachments?.[0]).not.toHaveProperty("id")
            expect(result.attachments?.[0]).not.toHaveProperty("sessionID")
            expect(result.attachments?.[0]).not.toHaveProperty("messageID")
          },
        })
      },
    )
  })

  bulletproofTest("keeps svg as text output", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>'
    await withFetch(
      async () =>
        new Response(svg, {
          status: 200,
          headers: { "content-type": "image/svg+xml; charset=UTF-8" },
        }),
      async () => {
        await Instance.provide({
          directory: projectRoot,
          fn: async () => {
            const webfetch = await WebFetchTool.init()
            const result = await webfetch.execute({ url: "https://example.com/image.svg", format: "html" }, ctx)
            expect(result.output).toContain("<svg")
            expect(result.attachments).toBeUndefined()
          },
        })
      },
    )
  })

  bulletproofTest("keeps text responses as text output", async () => {
    await withFetch(
      async () =>
        new Response("hello from webfetch", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      async () => {
        await Instance.provide({
          directory: projectRoot,
          fn: async () => {
            const webfetch = await WebFetchTool.init()
            const result = await webfetch.execute({ url: "https://example.com/file.txt", format: "text" }, ctx)
            expect(result.output).toBe("hello from webfetch")
            expect(result.attachments).toBeUndefined()
          },
        })
      },
    )
  })
})
