import { describe, it, expect, beforeEach } from "bun:test"
import { Rpc } from "../rpc"

describe("Rpc", () => {
  describe("client", () => {
    it("should create a client with call method", () => {
      const target = {
        postMessage: () => {},
        onmessage: null
      }
      
      const client = Rpc.client(target)
      
      expect(client.call).toBeDefined()
      expect(client.on).toBeDefined()
    })
    
    it("should send rpc.request when call is invoked", async () => {
      const messages: string[] = []
      const target = {
        postMessage: (data: string) => {
          messages.push(data)
        },
        onmessage: null
      }
      
      const client = Rpc.client(target)
      
      // Simulate response
      setTimeout(() => {
        const request = JSON.parse(messages[0])
        const event = { data: JSON.stringify({ type: "rpc.result", result: "test result", id: request.id }) }
        if (target.onmessage) target.onmessage(event)
      }, 10)
      
      const result = await client.call("testMethod", { arg: "value" })
      
      expect(result).toBe("test result")
      
      const request = JSON.parse(messages[0])
      expect(request.type).toBe("rpc.request")
      expect(request.method).toBe("testMethod")
      expect(request.input).toEqual({ arg: "value" })
    })
    
    it("should handle multiple concurrent calls", async () => {
      const messages: string[] = []
      const target = {
        postMessage: (data: string) => {
          messages.push(data)
        },
        onmessage: null
      }
      
      const client = Rpc.client(target)
      
      // Simulate responses
      setTimeout(() => {
        messages.forEach((msg, idx) => {
          const request = JSON.parse(msg)
          const event = { data: JSON.stringify({ type: "rpc.result", result: `result-${idx}`, id: request.id }) }
          if (target.onmessage) target.onmessage(event)
        })
      }, 10)
      
      const [r1, r2] = await Promise.all([
        client.call("method1", {}),
        client.call("method2", {})
      ])
      
      expect(r1).toBe("result-0")
      expect(r2).toBe("result-1")
    })
    
    it("should handle event listeners", () => {
      const target = {
        postMessage: () => {},
        onmessage: null
      }
      
      const client = Rpc.client(target)
      
      const events: unknown[] = []
      const unsubscribe = client.on("testEvent", (data) => {
        events.push(data)
      })
      
      // Simulate event
      const event = { data: JSON.stringify({ type: "rpc.event", event: "testEvent", data: { value: 42 } }) }
      if (target.onmessage) target.onmessage(event)
      
      expect(events).toEqual([{ value: 42 }])
      
      // Test unsubscribe
      unsubscribe()
      
      const event2 = { data: JSON.stringify({ type: "rpc.event", event: "testEvent", data: { value: 43 } }) }
      if (target.onmessage) target.onmessage(event2)
      
      // Should not have added another event
      expect(events).toEqual([{ value: 42 }])
    })
    
    it("should handle multiple listeners for same event", () => {
      const target = {
        postMessage: () => {},
        onmessage: null
      }
      
      const client = Rpc.client(target)
      
      const events1: unknown[] = []
      const events2: unknown[] = []
      
      client.on("testEvent", (data) => events1.push(data))
      client.on("testEvent", (data) => events2.push(data))
      
      const event = { data: JSON.stringify({ type: "rpc.event", event: "testEvent", data: "test" }) }
      if (target.onmessage) target.onmessage(event)
      
      expect(events1).toEqual(["test"])
      expect(events2).toEqual(["test"])
    })
  })
  
  describe("emit", () => {
    it("should post message with rpc.event type", () => {
      const messages: string[] = []
      const originalPostMessage = globalThis.postMessage
      globalThis.postMessage = (data: string) => {
        messages.push(data)
      }
      
      Rpc.emit("testEvent", { value: 123 })
      
      const event = JSON.parse(messages[0])
      expect(event.type).toBe("rpc.event")
      expect(event.event).toBe("testEvent")
      expect(event.data).toEqual({ value: 123 })
      
      globalThis.postMessage = originalPostMessage
    })
  })
  
  describe("listen", () => {
    it("should handle rpc.request messages", async () => {
      const rpc = {
        testMethod: async (input: { value: number }) => {
          return input.value * 2
        }
      }
      
      const messages: string[] = []
      const originalPostMessage = globalThis.postMessage
      globalThis.postMessage = (data: string) => {
        messages.push(data)
      }
      
      Rpc.listen(rpc)
      
      // Simulate request
      const event = { data: JSON.stringify({ type: "rpc.request", method: "testMethod", input: { value: 21 }, id: 1 }) }
      if (globalThis.onmessage) globalThis.onmessage(event)
      
      // Wait for async handling
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const response = JSON.parse(messages[0])
      expect(response.type).toBe("rpc.result")
      expect(response.result).toBe(42)
      expect(response.id).toBe(1)
      
      globalThis.postMessage = originalPostMessage
    })
  })
})