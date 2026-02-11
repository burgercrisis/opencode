import { expect, test, describe, vi } from "bun:test"
import { Lock } from "../../src/util/lock"

describe("Lock", () => {
  test("read lock should allow multiple readers", async () => {
    const l1 = await Lock.read("k1")
    const l2 = await Lock.read("k1")
    
    expect(l1).toBeDefined()
    expect(l2).toBeDefined()
    
    l1[Symbol.dispose]()
    l2[Symbol.dispose]()
  })

  test("write lock should be exclusive", async () => {
    const w1 = await Lock.write("k2")
    let w2Resolved = false
    const w2Promise = Lock.write("k2").then(l => {
      w2Resolved = true
      return l
    })
    
    // Give some time for promises to settle
    await new Promise(r => setTimeout(r, 10))
    expect(w2Resolved).toBe(false)
    
    w1[Symbol.dispose]()
    const w2 = await w2Promise
    expect(w2Resolved).toBe(true)
    w2[Symbol.dispose]()
  })

  test("readers should wait for writer", async () => {
    const w1 = await Lock.write("k3")
    let r1Resolved = false
    const r1Promise = Lock.read("k3").then(l => {
      r1Resolved = true
      return l
    })
    
    await new Promise(r => setTimeout(r, 10))
    expect(r1Resolved).toBe(false)
    
    w1[Symbol.dispose]()
    const r1 = await r1Promise
    expect(r1Resolved).toBe(true)
    r1[Symbol.dispose]()
  })

  test("writers should wait for readers", async () => {
    const r1 = await Lock.read("k4")
    let w1Resolved = false
    const w1Promise = Lock.write("k4").then(l => {
      w1Resolved = true
      return l
    })
    
    await new Promise(r => setTimeout(r, 10))
    expect(w1Resolved).toBe(false)
    
    r1[Symbol.dispose]()
    const w1 = await w1Promise
    expect(w1Resolved).toBe(true)
    w1[Symbol.dispose]()
  })

  test("prioritize writers over waiting readers", async () => {
    const w1 = await Lock.write("k5")
    
    const order: string[] = []
    const r1Promise = Lock.read("k5").then(l => { order.push("reader"); return l })
    const w2Promise = Lock.write("k5").then(l => { order.push("writer"); return l })
    
    await new Promise(r => setTimeout(r, 10))
    
    w1[Symbol.dispose]()
    
    // w2 should resolve first
    const w2 = await w2Promise
    expect(order).toEqual(["writer"])
    
    w2[Symbol.dispose]()
    const r1 = await r1Promise
    expect(order).toEqual(["writer", "reader"])
    r1[Symbol.dispose]()
  })
})
