import { expect, test, describe } from "bun:test"
import { GlobalBus } from "../../src/bus/global"

describe("GlobalBus", () => {
  test("is an EventEmitter", () => {
    expect(GlobalBus).toBeDefined()
    expect(typeof GlobalBus.emit).toBe("function")
    expect(typeof GlobalBus.on).toBe("function")
    expect(typeof GlobalBus.off).toBe("function")
  })

  test("can emit and receive events", () => {
    const received: any[] = []
    
    GlobalBus.on("event", (data) => {
      received.push(data)
    })

    GlobalBus.emit("event", {
      directory: "/test",
      payload: { type: "test", properties: { message: "hello" } },
    })

    expect(received.length).toBe(1)
    expect(received[0].directory).toBe("/test")
    expect(received[0].payload.type).toBe("test")
  })

  test("can emit multiple events", () => {
    const received: any[] = []
    
    GlobalBus.on("event", (data) => {
      received.push(data)
    })

    GlobalBus.emit("event", { payload: { type: "1" } })
    GlobalBus.emit("event", { payload: { type: "2" } })

    expect(received.length).toBe(2)
  })

  test("can remove listeners", () => {
    const received: any[] = []
    const handler = (data: any) => received.push(data)
    
    GlobalBus.on("event", handler)
    GlobalBus.emit("event", { payload: { type: "1" } })
    
    GlobalBus.off("event", handler)
    GlobalBus.emit("event", { payload: { type: "2" } })
    
    expect(received.length).toBe(1)
  })
})
