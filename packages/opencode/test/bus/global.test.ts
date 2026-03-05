import { expect, test, describe } from "bun:test"
import { GlobalBus } from "../../src/bus/global"

describe("GlobalBus", () => {
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
