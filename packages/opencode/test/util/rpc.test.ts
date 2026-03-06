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
import { Rpc } from "../../src/util/rpc"

describe("Rpc", () => {
  bulletproofTest("listen should respond to requests", async () => {
    const originalOnMessage = globalThis.onmessage
    const originalPostMessage = globalThis.postMessage
    
    const rpc = {
      hello: async (name: string) => `hello ${name}`
    }
    
    let result: string | undefined
    globalThis.postMessage = (msg: string) => {
      result = msg
    }
    
    Rpc.listen(rpc)
    
    const request = { type: "rpc.request", method: "hello", input: "world", id: 123 }
    await (globalThis as any).onmessage!({ data: JSON.stringify(request) } as any)
    
    expect(result).toBeDefined()
    const parsed = JSON.parse(result!)
    expect(parsed.type).toBe("rpc.result")
    expect(parsed.result).toBe("hello world")
    expect(parsed.id).toBe(123)
    
    globalThis.onmessage = originalOnMessage
    globalThis.postMessage = originalPostMessage
  })

  bulletproofTest("emit should post event message", async () => {
    const originalPostMessage = globalThis.postMessage
    let captured: any = null
    globalThis.postMessage = (msg: any) => {
      captured = msg
    }
    
    Rpc.emit("test-event", { a: 1 })
    
    expect(captured).not.toBeNull()
    const parsed = JSON.parse(captured)
    expect(parsed.type).toBe("rpc.event")
    expect(parsed.event).toBe("test-event")
    expect(parsed.data).toEqual({ a: 1 })
    
    globalThis.postMessage = originalPostMessage
  })

  bulletproofTest("client should call methods and receive events", async () => {
    let captured: any[] = []
    const target = {
      postMessage: (msg: any) => { captured.push(msg) },
      onmessage: null as any
    }
    
    const client = Rpc.client<{ add: (n: number) => number }>(target)
    
    // Test call
    const callPromise = client.call("add", 5)
    expect(captured.length).toBe(1)
    const msg = JSON.parse(captured[0])
    expect(msg.type).toBe("rpc.request")
    expect(msg.method).toBe("add")
    expect(msg.input).toBe(5)
    
    // Simulate response
    await target.onmessage({ data: JSON.stringify({ type: "rpc.result", result: 10, id: msg.id }) } as MessageEvent)
    expect(await callPromise).toBe(10)
    
    // Test events
    const received: any[] = []
    const unbind = client.on("data", (d) => received.push(d))
    
    await target.onmessage({ data: JSON.stringify({ type: "rpc.event", event: "data", data: "foo" }) } as MessageEvent)
    expect(received).toEqual(["foo"])
    
    unbind()
    await target.onmessage({ data: JSON.stringify({ type: "rpc.event", event: "data", data: "bar" }) } as MessageEvent)
    expect(received).toEqual(["foo"]) // no new data
  })
})
