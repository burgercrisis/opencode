import { expect, test, describe } from "bun:test"
import { Lock } from "../../src/util/lock"

describe("util.lock", () => {
  test("Lock should allow multiple concurrent readers", async () => {
    const key = "test-lock-readers"
    const r1 = await Lock.read(key)
    const r2 = await Lock.read(key)
    
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
    
    r1[Symbol.dispose]()
    r2[Symbol.dispose]()
  })

  test("Lock should block readers while writer is active", async () => {
    const key = "test-lock-writer-blocks-readers"
    const w1 = await Lock.write(key)
    
    let readerAcquired = false
    const readerPromise = Lock.read(key).then(r => {
      readerAcquired = true
      return r
    })
    
    // Wait a bit to ensure the reader is blocked
    await new Promise(r => setTimeout(r, 10))
    expect(readerAcquired).toBe(false)
    
    w1[Symbol.dispose]()
    const r1 = await readerPromise
    expect(readerAcquired).toBe(true)
    r1[Symbol.dispose]()
  })

  test("Lock should block writers while readers are active", async () => {
    const key = "test-lock-readers-block-writer"
    const r1 = await Lock.read(key)
    
    let writerAcquired = false
    const writerPromise = Lock.write(key).then(w => {
      writerAcquired = true
      return w
    })
    
    await new Promise(r => setTimeout(r, 10))
    expect(writerAcquired).toBe(false)
    
    r1[Symbol.dispose]()
    const w1 = await writerPromise
    expect(writerAcquired).toBe(true)
    w1[Symbol.dispose]()
  })

  test("Lock should prioritize writers over readers", async () => {
    const key = "test-lock-writer-priority"
    const w_initial = await Lock.write(key)
    
    const events: string[] = []
    
    const readerPromise = Lock.read(key).then(r => {
      events.push("reader")
      r[Symbol.dispose]()
    })
    
    const writerPromise = Lock.write(key).then(w => {
      events.push("writer")
      w[Symbol.dispose]()
    })
    
    w_initial[Symbol.dispose]()
    
    await Promise.all([readerPromise, writerPromise])
    
    // Writer should be processed before reader due to priority in process()
    expect(events).toEqual(["writer", "reader"])
  })

  test("Lock should handle multiple waiting writers", async () => {
    const key = "test-lock-multiple-writers"
    const w1 = await Lock.write(key)
    
    const events: string[] = []
    const p1 = Lock.write(key).then(w => { events.push("w2"); w[Symbol.dispose]() })
    const p2 = Lock.write(key).then(w => { events.push("w3"); w[Symbol.dispose]() })
    
    w1[Symbol.dispose]()
    await Promise.all([p1, p2])
    expect(events).toEqual(["w2", "w3"])
  })
})
