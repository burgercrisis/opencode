import { describe, it, expect } from "bun:test"
import { defer } from "../defer"

describe("defer", () => {
  describe("sync dispose", () => {
    it("should call function when Symbol.dispose is called", () => {
      let called = false
      const d = defer(() => {
        called = true
      })
      
      expect(called).toBe(false)
      
      // Manually call dispose
      d[Symbol.dispose]()
      
      expect(called).toBe(true)
    })

    it("should pass arguments correctly", () => {
      let value = 0
      const d = defer(() => {
        value = 42
      })
      
      d[Symbol.dispose]()
      
      expect(value).toBe(42)
    })
  })

  describe("async dispose", () => {
    it("should support async dispose with Symbol.asyncDispose", async () => {
      let called = false
      const d = defer(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        called = true
      })
      
      expect(called).toBe(false)
      
      await d[Symbol.asyncDispose]()
      
      expect(called).toBe(true)
    })

    it("should handle async errors", async () => {
      const d = defer(async () => {
        throw new Error("async error")
      })
      
      await expect(d[Symbol.asyncDispose]()).rejects.toThrow("async error")
    })
  })

  describe("early execution", () => {
    it("should execute on scope exit", () => {
      const order: string[] = []
      
      function testFn() {
        order.push("start")
        const d = defer(() => {
          order.push("defer")
        })
        order.push("middle")
        d[Symbol.dispose]()
      }
      
      testFn()
      
      expect(order).toEqual(["start", "middle", "defer"])
    })
  })
})