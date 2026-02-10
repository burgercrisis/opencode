import { expect, test, describe, vi, beforeEach } from "bun:test"
import { Rpc } from "../../src/util/rpc"

describe("Rpc", () => {
  test("listen should respond to requests", async () => {
    const originalOnMessage = globalThis.onmessage
    const originalPostMessage = globalThis.postMessage
    
    const rpc = {
      hello: async (name: string) => `hello ${name}`
    }
    
    let result: string | undefined
    globalThis.postMessage = vi.fn().mockImplementation((msg: string) => {
      result = msg
    })
    
    Rpc.listen(rpc)
    
    const request = { type: "rpc.request", method: "hello", input: "world", id: 123 }
    await globalThis.onmessage!({ data: JSON.stringify(request) } as MessageEvent)
    
    expect(result).toBeDefined()
    const parsed = JSON.parse(result!)
    expect(parsed.type).toBe("rpc.result")
    expect(parsed.result).toBe("hello world")
    expect(parsed.id).toBe(123)
    
    globalThis.onmessage = originalOnMessage
    globalThis.postMessage = originalPostMessage
  })

  test("emit should post event message", () => {
    const originalPostMessage = globalThis.postMessage
    globalThis.postMessage = vi.fn()
    
    Rpc.emit("test-event", { a: 1 })
    
    expect(globalThis.postMessage).toHaveBeenCalled()
    const msg = (globalThis.postMessage as any).mock.calls[0][0]
    const parsed = JSON.parse(msg)
    expect(parsed.type).toBe("rpc.event")
    expect(parsed.event).toBe("test-event")
    expect(parsed.data).toEqual({ a: 1 })
    
    globalThis.postMessage = originalPostMessage
  })

  test("client should call methods and receive events", async () => {
    const target = {
      postMessage: vi.fn(),
      onmessage: null as any
    }
    
    const client = Rpc.client<{ add: (n: number) => number }>(target)
    
    // Test call
    const callPromise = client.call("add", 5)
    expect(target.postMessage).toHaveBeenCalled()
    const msg = JSON.parse(target.postMessage.mock.calls[0][0])
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
